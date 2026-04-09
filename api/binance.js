// 建立全域記憶體快取，確保伺服器擁有唯一且「絕不跳動」的官方昨收價基準
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
                    prevClose: prevClose, // <--- 我們只需要這個最準的昨收價
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
    else if (action === 'tw-brokers') {
      const brokerRes = await fetch('https://openapi.twse.com.tw/v1/opendata/OpenData_BRK02');
      return res.status(200).json(await brokerRes.json());
    }
    else if (action === 'tw-history' && symbol) {
      const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      
      // 1. 單純抓取 Yahoo 基礎歷史 K 線 (僅用於繪製圖表)
      let yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d`, { headers });
      let data = await yfRes.json();
      let suffix = '.TW';
      
      if (!data?.chart?.result) {
        suffix = '.TWO';
        yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=6mo&interval=1d`, { headers });
        data = await yfRes.json();
      }

      // 2. 獲取官方 OpenAPI 最精準的昨收價，作為不動如山的計算基準 (Anchor)
      const officialData = await getOfficialStockData(symbol);
      const truePrevClose = officialData ? officialData.prevClose : null;

      // 3. 【核心修正】擷取 Yahoo V7 Quote 取得「會跳動」的盤中即時報價
      try {
          const quoteRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}${suffix}`, { headers });
          const quoteData = await quoteRes.json();
          const quote = quoteData?.quoteResponse?.result?.[0];
          
          if (quote && data?.chart?.result?.[0]?.meta) {
              const meta = data.chart.result[0].meta;
              
              // 現價與交易量使用 Yahoo 即時報價 (這樣盤中股價就會一直跳動)
              const livePrice = quote.regularMarketPrice;
              meta.regularMarketPrice = livePrice;
              meta.regularMarketVolume = quote.regularMarketVolume;
              meta.regularMarketDayHigh = quote.regularMarketDayHigh;
              meta.regularMarketDayLow = quote.regularMarketDayLow;
              meta.regularMarketOpen = quote.regularMarketOpen;
              meta.regularMarketTime = quote.regularMarketTime;

              // 關鍵：昨收價強制使用官方的 truePrevClose。若無，才降級用 Yahoo 的昨收
              if (truePrevClose && truePrevClose > 0) {
                  meta.previousClose = truePrevClose;
                  // 用跳動的現價與鎖死的官方昨收，重新精算漲跌幅
                  meta.exactChangePercent = ((livePrice - truePrevClose) / truePrevClose) * 100.0;
              } else {
                  meta.previousClose = quote.regularMarketPreviousClose;
                  meta.exactChangePercent = quote.regularMarketChangePercent;
              }
              
              meta.isRealTime = true;
          }
      } catch(e) {
          console.error("Quote fetch error", e);
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
