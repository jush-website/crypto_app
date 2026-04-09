// 建立全域記憶體快取，確保伺服器擁有唯一且最精準的昨收價基準
let openApiCache = {};
let cacheTime = 0;

// 取得台灣證交所官方的精準昨收價 (避免頻繁請求，快取 10 分鐘)
async function getTruePrevClose(symbol) {
    const now = Date.now();
    if (Object.keys(openApiCache).length === 0 || now - cacheTime > 600000) { 
        try {
            const [tseRes, otcRes] = await Promise.all([
                fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
                fetch('https://www.tpex.org.tw/openapi/v1/t1820')
            ]);
            const tse = await tseRes.json().catch(() => []);
            const otc = await otcRes.json().catch(() => []);
            
            const newCache = {};
            // 盤中時段，官方 OpenAPI 的 ClosingPrice 正是我們需要的「精準昨收價」
            if (Array.isArray(tse)) {
                tse.forEach(s => { newCache[s.Code] = parseFloat(s.ClosingPrice); });
            }
            if (Array.isArray(otc)) {
                otc.forEach(s => { newCache[s.SecuritiesCompanyCode] = parseFloat(s.Close); });
            }
            
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
      
      // 1. 抓取基礎歷史 K 線，取得畫圖所需數據
      let yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d`, { headers });
      let data = await yfRes.json();
      let suffix = '.TW';
      
      if (!data?.chart?.result) {
        suffix = '.TWO';
        yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=6mo&interval=1d`, { headers });
        data = await yfRes.json();
      }

      // 2. 獲取官方 OpenAPI 最精準的昨收價，作為不動如山的計算基準
      let truePrevClose = await getTruePrevClose(symbol);
      
      let misSuccess = false;
      let realPrice = null;
      let realVolume = null;

      // 3. 直連台灣證交所 MIS 取得 0 延遲現價
      try {
          const sessionRes = await fetch('https://mis.twse.com.tw/stock/index.jsp', { 
              headers: { 'User-Agent': 'Mozilla/5.0' } 
          });
          
          const rawCookies = sessionRes.headers.get('set-cookie');
          let cookieString = '';
          if (rawCookies) cookieString = rawCookies.split(',').map(c => c.split(';')[0]).join('; ');
          
          const timestamp = Date.now();
          const misUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw|otc_${symbol}.tw&json=1&delay=0&_=${timestamp}`;
          
          const misFetchHeaders = { 
              'Accept-Language': 'zh-TW', 
              'User-Agent': 'Mozilla/5.0',
              'Cookie': cookieString
          };

          const misRes = await fetch(misUrl, { headers: misFetchHeaders });
          const misData = await misRes.json();
          
          if (misData?.msgArray?.length > 0) {
              const stockInfo = misData.msgArray[0];
              
              // 取得即時成交價 (若無成交則看開盤，否則看昨收)
              if (stockInfo.z && stockInfo.z !== '-') realPrice = Number(stockInfo.z);
              else if (stockInfo.o && stockInfo.o !== '-') realPrice = Number(stockInfo.o);
              else if (stockInfo.y && stockInfo.y !== '-') realPrice = Number(stockInfo.y);

              if (stockInfo.v) realVolume = Number(stockInfo.v) * 1000;
              
              // 若 OpenAPI 快取碰巧沒抓到，用 MIS 的 'y' (昨收價) 當備援
              if (!truePrevClose && stockInfo.y) truePrevClose = Number(stockInfo.y);
              
              misSuccess = true;
          }
      } catch(e) {}

      // 4. 若 MIS 被擋或失敗，回退使用 Yahoo V7 Quote API 取得目前價格
      if (!realPrice) {
          try {
              const quoteRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}${suffix}`, { headers });
              const quoteData = await quoteRes.json();
              const quote = quoteData?.quoteResponse?.result?.[0];
              
              if (quote) {
                  realPrice = quote.regularMarketPrice;
                  realVolume = quote.regularMarketVolume;
                  if (!truePrevClose) truePrevClose = quote.regularMarketPreviousClose;
              }
          } catch(e) {}
      }

      // 終極防呆：確保價格與昨收價皆有數值
      if (!realPrice && data?.chart?.result?.[0]?.meta) {
          realPrice = data.chart.result[0].meta.regularMarketPrice;
      }
      if (!truePrevClose) truePrevClose = realPrice; // 避免除以 0

      // 5. 強制覆蓋：徹底根除 Yahoo 錯誤的歷史資料，寫入鎖定計算後的精準 % 數
      if (data?.chart?.result?.[0]?.meta) {
          const meta = data.chart.result[0].meta;
          meta.regularMarketPrice = realPrice;
          meta.previousClose = truePrevClose; 
          
          if (realVolume !== null) meta.regularMarketVolume = realVolume;
          
          // 強制統一精算，不會再有任何跳動誤差
          meta.exactChangePercent = truePrevClose > 0 ? ((realPrice - truePrevClose) / truePrevClose) * 100.0 : 0;
          meta.isRealTime = misSuccess; 
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
