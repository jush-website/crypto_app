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

      // 2. 【核心革命：直連台灣證交所 MIS 即時 API，帶 Cookie 破解阻擋】
      let misSuccess = false;
      try {
          // 先取得 Session Cookie 破解 TWSE 防爬蟲機制
          const sessionRes = await fetch('https://mis.twse.com.tw/stock/index.jsp', { 
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
          });
          
          // 擷取 Set-Cookie 標頭
          const rawCookies = sessionRes.headers.get('set-cookie');
          let cookieString = '';
          if (rawCookies) {
              // 解析出 JSESSIONID 以供後續請求使用
              cookieString = rawCookies.split(',').map(c => c.split(';')[0]).join('; ');
          }
          
          const timestamp = Date.now();
          const misUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${symbol}.tw|otc_${symbol}.tw&json=1&delay=0&_=${timestamp}`;
          
          const misFetchHeaders = { 
              'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7', 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          };
          // 夾帶通行證
          if (cookieString) {
              misFetchHeaders['Cookie'] = cookieString;
          }

          const misRes = await fetch(misUrl, { headers: misFetchHeaders });
          const misData = await misRes.json();
          
          if (misData?.msgArray?.length > 0) {
              const stockInfo = misData.msgArray[0];
              const prevClose = Number(stockInfo.y); // y: 真實昨收價
              
              // 判斷盤中成交價，若尚無成交(z為'-')則看開盤價或昨收
              let realPrice = prevClose;
              if (stockInfo.z && stockInfo.z !== '-') {
                  realPrice = Number(stockInfo.z);
              } else if (stockInfo.o && stockInfo.o !== '-') {
                  realPrice = Number(stockInfo.o);
              }

              const volumeShares = Number(stockInfo.v || 0) * 1000; // v 為張數，換算成股數
              const high = stockInfo.h !== '-' ? Number(stockInfo.h) : realPrice;
              const low = stockInfo.l !== '-' ? Number(stockInfo.l) : realPrice;
              const open = stockInfo.o !== '-' ? Number(stockInfo.o) : realPrice;

              if (data?.chart?.result?.[0]?.meta) {
                  data.chart.result[0].meta.regularMarketPrice = realPrice;
                  data.chart.result[0].meta.previousClose = prevClose; // 覆蓋錯誤的 chartPreviousClose
                  data.chart.result[0].meta.regularMarketVolume = volumeShares;
                  data.chart.result[0].meta.regularMarketDayHigh = high;
                  data.chart.result[0].meta.regularMarketDayLow = low;
                  data.chart.result[0].meta.regularMarketOpen = open;
                  // 精算即時漲跌幅
                  data.chart.result[0].meta.exactChangePercent = prevClose > 0 ? ((realPrice - prevClose) / prevClose) * 100.0 : 0;
                  data.chart.result[0].meta.isRealTime = true; // 標記為真正的 0 延遲數據
              }
              misSuccess = true;
          }
      } catch(e) {
          console.error("MIS fetch error", e);
      }

      // 3. 若 MIS 失敗 (例如非交易時段或被擋)，強制使用 Yahoo V7 Quote API 取得真昨收
      if (!misSuccess) {
          try {
              const quoteRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}${suffix}`, { headers });
              const quoteData = await quoteRes.json();
              const quote = quoteData?.quoteResponse?.result?.[0];
              
              if (quote && data?.chart?.result?.[0]?.meta) {
                  data.chart.result[0].meta.regularMarketPrice = quote.regularMarketPrice;
                  // 取得 V7 API 回傳的精準昨日收盤價，覆蓋 V8 Chart 的半年錯誤收盤價
                  data.chart.result[0].meta.previousClose = quote.regularMarketPreviousClose;
                  data.chart.result[0].meta.regularMarketVolume = quote.regularMarketVolume;
                  data.chart.result[0].meta.exactChangePercent = quote.regularMarketChangePercent;
                  data.chart.result[0].meta.regularMarketDayHigh = quote.regularMarketDayHigh;
                  data.chart.result[0].meta.regularMarketDayLow = quote.regularMarketDayLow;
                  data.chart.result[0].meta.regularMarketOpen = quote.regularMarketOpen;
              }
          } catch(e) {}
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
