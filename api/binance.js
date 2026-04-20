export default async function handler(req, res) {
  // 強制抹除所有 CDN 與瀏覽器快取，保證每次請求都是最新
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, symbol, limit = 120, interval = '15m' } = req.query;

  // 統一防快取設定與 Request Headers (加入 Origin 與 Referer 模擬正常用戶，防阻擋)
  const fetchConfig = { 
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://tw.stock.yahoo.com',
      'Referer': 'https://tw.stock.yahoo.com/'
    },
    cache: 'no-store' // 徹底防範 Next.js / Vercel Edge 擅自快取
  };

  // 具備防崩潰機制的共用請求函數
  const fetchWithCatch = async (url) => {
    try {
        const r = await fetch(url, fetchConfig);
        if (!r.ok) return null;
        return await r.json();
    } catch (e) {
        return null;
    }
  };

  // 🔥 全新：Yahoo 最強底層即時報價引擎 (全球行情核心通道 v7/quote)
  // 捨棄會被 Vercel IP 阻擋的台灣證交所 API，以及會卡頓凍結的 v8/chart API
  const fetchRealtimeQuote = async (symbolsArray) => {
      const twSymbols = symbolsArray.map(s => `${s}.TW`).join(',');
      const twoSymbols = symbolsArray.map(s => `${s}.TWO`).join(',');
      const results = {};

      const fetchAndParse = async (syms) => {
          if (!syms) return;
          // v7/finance/quote 是最穩定的即時報價介面，不會發生 K 線陣列解析錯誤
          const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}&nocache=${Math.random()}`;
          const data = await fetchWithCatch(url);

          if (data?.quoteResponse?.result) {
              data.quoteResponse.result.forEach(q => {
                  if (q.regularMarketPrice) {
                      const baseSym = q.symbol.split('.')[0];
                      results[baseSym] = {
                          price: q.regularMarketPrice,
                          prevClose: q.regularMarketPreviousClose || q.regularMarketPrice,
                          vol: q.regularMarketVolume || 0,
                          time: q.regularMarketTime
                      };
                  }
              });
          }
      };

      // 併發請求上市與上櫃
      await Promise.all([
          fetchAndParse(twSymbols),
          fetchAndParse(twoSymbols)
      ]);

      return results;
  };

  try {
    const BINANCE_BASE_URL = 'https://fapi.binance.com/fapi/v1';

    if (action === 'overview') {
      const [tickerRes, fundingRes] = await Promise.all([
        fetch(`${BINANCE_BASE_URL}/ticker/24hr`, fetchConfig),
        fetch(`${BINANCE_BASE_URL}/premiumIndex`, fetchConfig)
      ]);
      const tickers = await tickerRes.json();
      const fundingRates = await fundingRes.json();
      return res.status(200).json({ tickers, fundingRates });
    } 
    else if (action === 'klines' && symbol) {
      const klineRes = await fetch(`${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, fetchConfig);
      return res.status(200).json(await klineRes.json());
    } 
    else if (action === 'price' && symbol) {
      const priceRes = await fetch(`${BINANCE_BASE_URL}/ticker/price?symbol=${symbol}`, fetchConfig);
      return res.status(200).json(await priceRes.json());
    }
    else if (action === 'tw-stocks') {
      const twseRes = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', fetchConfig);
      return res.status(200).json(await twseRes.json());
    }
    else if (action === 'tw-otc-stocks') {
      const tpexRes = await fetch('https://www.tpex.org.tw/openapi/v1/t1820', fetchConfig);
      return res.status(200).json(await tpexRes.json());
    }
    else if (action === 'tw-quote' && symbol) {
      // 呼叫最新 Quote 引擎
      const data = await fetchRealtimeQuote([symbol]);
      if (data[symbol]) {
          return res.status(200).json(data[symbol]);
      }
      return res.status(404).json({ error: 'Quote not found' });
    }
    else if (action === 'tw-quote-batch' && req.query.symbols) {
        const symbolsArray = req.query.symbols.split(',');
        if (symbolsArray.length === 0) return res.status(200).json({});

        // 呼叫最新 Quote 引擎進行大批量查詢
        const data = await fetchRealtimeQuote(symbolsArray);
        return res.status(200).json(data);
    }
    else if (action === 'tw-history' && symbol) {
      let data = await fetchWithCatch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d&nocache=${Math.random()}`);
      if (!data?.chart?.result) {
        data = await fetchWithCatch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=6mo&interval=1d&nocache=${Math.random()}`);
      }
      return res.status(200).json(data || {});
    }
    else if (action === 'news') {
      if (symbol) {
        const data = await fetchWithCatch(`https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}.TW&newsCount=10&_t=${Date.now()}`);
        return res.status(200).json(data?.news || []);
      } else {
        const feeds = [
          { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
          { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
        ];
        let allArticles = [];
        for (const feed of feeds) {
          try {
             const data = await fetchWithCatch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
             if (data && data.status === 'ok') {
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
