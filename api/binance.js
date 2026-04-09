// 建立全域記憶體快取，防止 Serverless 頻繁請求 OpenAPI 被封鎖
let openApiCache = [];
let cacheTime = 0;

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
      
      // 1. 先抓取基礎歷史 K 線 (Yahoo Chart)
      let yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d`, { headers });
      let data = await yfRes.json();
      let suffix = '.TW';
      
      if (!data?.chart?.result) {
        suffix = '.TWO';
        yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=6mo&interval=1d`, { headers });
        data = await yfRes.json();
      }

      // 2. 【第一重校準：直連台灣證交所 MIS 即時 API，帶 Cookie 破解阻擋】
      let misSuccess = false;
      try {
          const sessionRes = await fetch('https://mis.twse.com.tw/stock/index.jsp', { 
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
          });
          
          const rawCookies = sessionRes.headers.get('set-cookie');
          let cookieString = '';
          if (rawCookies) {
              cookieString = rawCookies.split(',').map(c => c.split(';')[0]).join('; ');
          }
          
          const timestamp = Date.now();
          const misUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw|otc_${symbol}.tw&json=1&delay=0&_=${timestamp}`;
          
          const misFetchHeaders = { 
              'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7', 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          };
          if (cookieString) misFetchHeaders['Cookie'] = cookieString;

          const misRes = await fetch(misUrl, { headers: misFetchHeaders });
          const misData = await misRes.json();
          
          if (misData?.msgArray?.length > 0) {
              const stockInfo = misData.msgArray[0];
              const prevClose = Number(stockInfo.y); 
              
              let realPrice = prevClose;
              if (stockInfo.z && stockInfo.z !== '-') realPrice = Number(stockInfo.z);
              else if (stockInfo.o && stockInfo.o !== '-') realPrice = Number(stockInfo.o);

              const volumeShares = Number(stockInfo.v || 0) * 1000; 
              const high = stockInfo.h !== '-' ? Number(stockInfo.h) : realPrice;
              const low = stockInfo.l !== '-' ? Number(stockInfo.l) : realPrice;
              const open = stockInfo.o !== '-' ? Number(stockInfo.o) : realPrice;

              if (data?.chart?.result?.[0]?.meta) {
                  data.chart.result[0].meta.regularMarketPrice = realPrice;
                  data.chart.result[0].meta.previousClose = prevClose; 
                  data.chart.result[0].meta.regularMarketVolume = volumeShares;
                  data.chart.result[0].meta.regularMarketDayHigh = high;
                  data.chart.result[0].meta.regularMarketDayLow = low;
                  data.chart.result[0].meta.regularMarketOpen = open;
                  data.chart.result[0].meta.exactChangePercent = prevClose > 0 ? ((realPrice - prevClose) / prevClose) * 100.0 : 0;
                  data.chart.result[0].meta.isRealTime = true; 
              }
              misSuccess = true;
          }
      } catch(e) {}

      // 3. 【第二重校準：導入官方 OpenAPI 進行交叉比對】
      // 若 MIS 失敗，或需驗證 Yahoo 資料是否暴走 (如 +73% bug)
      if (!misSuccess && data?.chart?.result?.[0]?.meta) {
          // Yahoo 備援
          try {
              const quoteRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}${suffix}`, { headers });
              const quoteData = await quoteRes.json();
              const quote = quoteData?.quoteResponse?.result?.[0];
              
              if (quote) {
                  data.chart.result[0].meta.regularMarketPrice = quote.regularMarketPrice;
                  data.chart.result[0].meta.previousClose = quote.regularMarketPreviousClose;
                  data.chart.result[0].meta.regularMarketVolume = quote.regularMarketVolume;
                  data.chart.result[0].meta.exactChangePercent = quote.regularMarketChangePercent;
                  data.chart.result[0].meta.regularMarketDayHigh = quote.regularMarketDayHigh;
                  data.chart.result[0].meta.regularMarketDayLow = quote.regularMarketDayLow;
                  data.chart.result[0].meta.regularMarketOpen = quote.regularMarketOpen;
              }
          } catch(e) {}

          // 使用 TWSE / TPEx OpenAPI 強制校準 (防禦 Yahoo 半年線錯誤)
          try {
              const now = Date.now();
              // 伺服器端快取 10 分鐘，避免請求過度頻繁
              if (openApiCache.length === 0 || now - cacheTime > 600000) { 
                  const [tse, otc] = await Promise.all([
                      fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL').then(r=>r.json()).catch(()=>[]),
                      fetch('https://www.tpex.org.tw/openapi/v1/t1820').then(r=>r.json()).catch(()=>[])
                  ]);
                  openApiCache = [...(Array.isArray(tse) ? tse : []), ...(Array.isArray(otc) ? otc : [])];
                  cacheTime = now;
              }

              if (openApiCache.length > 0) {
                  const stockOfficial = openApiCache.find(s => String(s.Code || s.SecuritiesCompanyCode) === String(symbol));
                  if (stockOfficial) {
                      const officialPrice = parseFloat(stockOfficial.ClosingPrice || stockOfficial.Close);
                      let changeStr = String(stockOfficial.Change || '0').replace(/\s+/g, '').replace('+', '').replace('X', '');
                      const match = changeStr.match(/-?\d+\.?\d*/);
                      let changeAmt = match ? parseFloat(match[0]) : 0;

                      if (!isNaN(officialPrice) && !isNaN(changeAmt) && officialPrice > 0) {
                          const meta = data.chart.result[0].meta;
                          const currentPrice = meta.regularMarketPrice || officialPrice;
                          const currentPrevClose = meta.previousClose;
                          
                          // 偵測異常：如果 Yahoo 給出的漲幅大於 12%（台股通常最多 10% 漲跌停），代表 Yahoo 給錯昨收價了
                          const isAbsurd = currentPrevClose > 0 && Math.abs((currentPrice - currentPrevClose) / currentPrevClose) > 0.12;
                          
                          if (isAbsurd || !currentPrevClose) {
                              // 利用 OpenAPI 反推精準的真實昨收價
                              let calculatedPrevClose = officialPrice - changeAmt;
                              // 若盤中時段，OpenAPI 的 ClosingPrice 其實就是昨收
                              if (Math.abs((currentPrice - officialPrice) / officialPrice) < 0.12) {
                                  calculatedPrevClose = officialPrice;
                              }
                              
                              meta.previousClose = calculatedPrevClose;
                              meta.exactChangePercent = ((currentPrice - calculatedPrevClose) / calculatedPrevClose) * 100.0;
                          }
                      }
                  }
              }
          } catch(e) {
              console.error("OpenAPI Cross-check error", e);
          }
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
