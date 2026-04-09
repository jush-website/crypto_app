// 建立全域記憶體快取，確保伺服器擁有唯一且「絕不跳動」的官方股價基準
let openApiCache = {};
let cacheTime = 0;

// 單純抓取台灣證交所官方 OpenAPI 的精準數據 (快取 5 分鐘，防阻擋)
async function getOfficialStockData(symbol) {
    const now = Date.now();
    if (Object.keys(openApiCache).length === 0 || now - cacheTime > 300000) { 
        try {
            const [tseRes, otcRes] = await Promise.all([
                fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
                fetch('https://www.tpex.org.tw/openapi/v1/t1820')
            ]);
            const tse = await tseRes.json().catch(() => []);
            const otc = await otcRes.json().catch(() => []);
            
            const newCache = {};
            const spaceRegex = new RegExp('\\s+', 'g');
            
            const processItem = (item, isOtc) => {
                const code = String(isOtc ? item.SecuritiesCompanyCode : item.Code);
                const price = parseFloat(isOtc ? item.Close : item.ClosingPrice);
                
                // 嚴格過濾特殊字元 (例如除息的 'X' 與負號空白)
                let changeStr = String(item.Change || '0').replace(spaceRegex, '').replace('+', '').replace('X', '');
                const match = changeStr.match(/-?\d+\.?\d*/);
                let changeAmt = match ? parseFloat(match[0]) : 0;
                if (String(item.Change).includes('-')) changeAmt = -Math.abs(changeAmt);
                
                let prevClose = price;
                let percent = 0;
                // 利用官方 OpenAPI 的收盤價與漲跌額，絕對精準反推昨收價與漲幅
                if (!isNaN(price) && !isNaN(changeAmt) && price !== 0) {
                    prevClose = price - changeAmt;
                    if (prevClose > 0) percent = (changeAmt / prevClose) * 100.0;
                }
                
                newCache[code] = {
                    price: isNaN(price) ? 0 : price,
                    prevClose: prevClose,
                    percent: percent,
                    volume: parseInt(isOtc ? item.Volume : item.TradeVolume) || 0
                };
            };

            if (Array.isArray(tse)) tse.forEach(i => { if (i.Code) processItem(i, false); });
            if (Array.isArray(otc)) otc.forEach(i => { if (i.SecuritiesCompanyCode) processItem(i, true); });
            
            if (Object.keys(newCache).length > 0) {
                openApiCache = newCache;
                cacheTime = now;
            }
        } catch(e) {
            console.error("OpenAPI cache error", e);
        }
    }
    return openApiCache[symbol] || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, symbol, limit = 120, interval = '15m' } = req.query;

  try {
    const BINANCE_BASE_URL = 'https://fapi.binance.com/fapi/v1';

    if (action === 'overview') {
      const [tickerRes, fundingRes] = await Promise.all([
        fetch(`${BINANCE_BASE_URL}/ticker/24hr`),
        fetch(`${BINANCE_BASE_URL}/premiumIndex`)
      ]);
      const tickers = await tickerRes.json();
      const fundingRates = await fundingRes.json();
      return res.status(200).json({ tickers, fundingRates });
    } 
    else if (action === 'klines' && symbol) {
      const klineRes = await fetch(`${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      return res.status(200).json(await klineRes.json());
    } 
    else if (action === 'price' && symbol) {
      const priceRes = await fetch(`${BINANCE_BASE_URL}/ticker/price?symbol=${symbol}`);
      return res.status(200).json(await priceRes.json());
    }
    else if (action === 'tw-stocks') {
      const twseRes = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
      return res.status(200).json(await twseRes.json());
    }
    else if (action === 'tw-otc-stocks') {
      const tpexRes = await fetch('https://www.tpex.org.tw/openapi/v1/t1820');
      return res.status(200).json(await tpexRes.json());
    }
    else if (action === 'tw-history' && symbol) {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      
      // 1. 單純抓取 Yahoo 基礎歷史 K 線 (僅用於繪製圖表)
      let yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d`, { headers });
      let data = await yfRes.json();
      
      if (!data?.chart?.result) {
        yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=6mo&interval=1d`, { headers });
        data = await yfRes.json();
      }

      // 2. 核心修正：單純抓取 OpenAPI 取得最正確的官方股價，徹底取代容易跳動的 MIS 與 Yahoo Quote
      const officialData = await getOfficialStockData(symbol);

      if (officialData && data?.chart?.result?.[0]?.meta) {
          const meta = data.chart.result[0].meta;
          // 完全捨棄 Yahoo 混亂的報價，強制寫入官方 OpenAPI 數據
          meta.regularMarketPrice = officialData.price;
          meta.previousClose = officialData.prevClose; 
          meta.regularMarketVolume = officialData.volume;
          meta.exactChangePercent = officialData.percent; 
          // 確保前端知道這是不會跳回錯誤的官方數據
          meta.isRealTime = true; 
      }

      return res.status(200).json(data);
    }
    else if (action === 'news') {
      if (symbol) {
        const yNewsRes = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}.TW&newsCount=10`);
        const data = await yNewsRes.json();
        return res.status(200).json(data.news || []);
      } else {
        const feeds = [
          { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
          { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
        ];
        let allArticles = [];
        for (const feed of feeds) {
          try {
             const rssRes = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
             const data = await rssRes.json();
             if (data.status === 'ok') {
               const items = data.items.map(item => ({
                 id: item.guid || item.link, title: item.title, link: item.link, time: new Date(item.pubDate).toLocaleString(), rawDate: new Date(item.pubDate).getTime(), source: feed.category === '加密貨幣' ? 'Cointelegraph' : 'Yahoo 股市', category: feed.category
               }));
               allArticles = [...allArticles, ...items];
             }
          } catch(e) {}
        }
        allArticles.sort((a, b) => b.rawDate - a.rawDate);
        return res.status(200).json(allArticles);
      }
    } 
    else {
      return res.status(400).json({ error: '無效的 action 參數' });
    }
  } catch (error) {
    return res.status(500).json({ error: '伺服器發生錯誤', details: error.message });
  }
}
