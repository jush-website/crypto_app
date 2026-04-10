export default async function handler(req, res) {
  // 【核心革命】：強制抹除所有 CDN 與瀏覽器快取，保證每次請求都是最新報價
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, symbol, limit = 120, interval = '15m' } = req.query;

  try {
    const BINANCE_BASE_URL = 'https://fapi.binance.com/fapi/v1';
    const yahooHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };

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
    // 【全新極速報價引擎】：專門為前端提供秒秒跳動的即時價格
    else if (action === 'tw-quote' && symbol) {
      let quoteRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.TW`, { headers: yahooHeaders });
      let quoteData = await quoteRes.json();
      let quote = quoteData?.quoteResponse?.result?.[0];
      
      if (!quote) {
          quoteRes = await fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbol}.TWO`, { headers: yahooHeaders });
          quoteData = await quoteRes.json();
          quote = quoteData?.quoteResponse?.result?.[0];
      }
      
      if (quote) {
          return res.status(200).json({
              price: quote.regularMarketPrice,
              prevClose: quote.regularMarketPreviousClose,
              vol: quote.regularMarketVolume,
              time: quote.regularMarketTime
          });
      }
      return res.status(404).json({ error: 'Quote not found' });
    }
    // 【全新批量極速掃描】：雷達全域掃描專用，一次獲取 50 檔股票的即時價格，0 延遲
    else if (action === 'tw-quote-batch' && req.query.symbols) {
        const symbolsArray = req.query.symbols.split(',');
        const twList = symbolsArray.map(s => `${s}.TW`).join(',');
        const twoList = symbolsArray.map(s => `${s}.TWO`).join(',');
        
        const [resTw, resTwo] = await Promise.all([
            fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${twList}`, { headers: yahooHeaders }),
            fetch(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${twoList}`, { headers: yahooHeaders })
        ]);
        const dataTw = await resTw.json().catch(()=>({}));
        const dataTwo = await resTwo.json().catch(()=>({}));
        
        const results = {};
        const processQuote = (q) => {
            if (q && q.symbol) {
                const sym = q.symbol.split('.')[0];
                results[sym] = {
                    price: q.regularMarketPrice,
                    vol: q.regularMarketVolume
                };
            }
        };
        dataTw?.quoteResponse?.result?.forEach(processQuote);
        dataTwo?.quoteResponse?.result?.forEach(processQuote);
        
        return res.status(200).json(results);
    }
    // K 線歷史圖表專用
    else if (action === 'tw-history' && symbol) {
      let yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d`, { headers: yahooHeaders });
      let data = await yfRes.json();
      
      if (!data?.chart?.result) {
        yfRes = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=6mo&interval=1d`, { headers: yahooHeaders });
        data = await yfRes.json();
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
