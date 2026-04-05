// 這是 Vercel 的 Serverless Function 檔案
// 需放置於專案根目錄的 api 資料夾中，即: /api/binance.js
// 升級版：支援幣安合約、台股證交所、台股歷史K線(Yahoo Finance)、RSS 熱點新聞代理

export default async function handler(req, res) {
  // 設定 CORS 標頭
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action, symbol, limit = 120 } = req.query;

  try {
    const BINANCE_BASE_URL = 'https://fapi.binance.com/fapi/v1';

    // 1. 虛擬貨幣
    if (action === 'overview') {
      const [tickerRes, fundingRes] = await Promise.all([
        fetch(`${BINANCE_BASE_URL}/ticker/24hr`),
        fetch(`${BINANCE_BASE_URL}/premiumIndex`)
      ]);
      if (!tickerRes.ok || !fundingRes.ok) throw new Error('幣安 API 請求失敗');
      const tickers = await tickerRes.json();
      const fundingRates = await fundingRes.json();
      return res.status(200).json({ tickers, fundingRates });
    } 
    else if (action === 'klines' && symbol) {
      const klineRes = await fetch(`${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=15m&limit=${limit}`);
      if (!klineRes.ok) throw new Error('獲取 K 線失敗');
      return res.status(200).json(await klineRes.json());
    } 
    else if (action === 'price' && symbol) {
      const priceRes = await fetch(`${BINANCE_BASE_URL}/ticker/price?symbol=${symbol}`);
      if (!priceRes.ok) throw new Error('獲取價格失敗');
      return res.status(200).json(await priceRes.json());
    }

    // 2. 台灣股市 (大盤與清單)
    else if (action === 'tw-stocks') {
      const twseRes = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
      if (!twseRes.ok) throw new Error('取得證交所數據失敗');
      return res.status(200).json(await twseRes.json());
    }

    // 3. 台灣股市 (個股歷史 K 線 - 來自 Yahoo Finance API)
    else if (action === 'tw-history' && symbol) {
      // 取得過去 6 個月的日 K 線
      const yfRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d`);
      if (!yfRes.ok) throw new Error('獲取歷史數據失敗');
      const data = await yfRes.json();
      return res.status(200).json(data);
    }

    // 4. 熱點新聞與個股新聞
    else if (action === 'news') {
      if (symbol) {
        // 特定個股新聞 (Yahoo Finance Search API)
        const yNewsRes = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}.TW&newsCount=10`);
        if (!yNewsRes.ok) throw new Error('獲取新聞失敗');
        const data = await yNewsRes.json();
        return res.status(200).json(data.news || []);
      } else {
        // 綜合熱點新聞
        const feeds = [
          { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
          { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
        ];
        let allArticles = [];
        for (const feed of feeds) {
          const rssRes = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
          const data = await rssRes.json();
          if (data.status === 'ok') {
            const items = data.items.map(item => ({
              id: item.guid || item.link,
              title: item.title,
              link: item.link,
              time: new Date(item.pubDate).toLocaleString(),
              rawDate: new Date(item.pubDate).getTime(),
              source: feed.category === '加密貨幣' ? 'Cointelegraph' : 'Yahoo 股市',
              category: feed.category
            }));
            allArticles = [...allArticles, ...items];
          }
        }
        allArticles.sort((a, b) => b.rawDate - a.rawDate);
        return res.status(200).json(allArticles);
      }
    } 
    else {
      return res.status(400).json({ error: '無效的 action 參數或缺少必要欄位' });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: '內部伺服器錯誤', details: error.message });
  }
}
