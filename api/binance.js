// 這是 Vercel 的 Serverless Function 檔案
// 需放置於專案根目錄的 api 資料夾中，即: /api/binance.js
// 升級版：支援幣安合約、台股證交所、RSS 熱點新聞代理

export default async function handler(req, res) {
  // 設定 CORS 標頭，允許前端跨域請求 (解決瀏覽器 CORS 問題)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // 允許所有來源，如需安全可改為您的前端域名
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 處理 OPTIONS 預檢請求 (CORS 必須)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 從請求中取得參數
  const { action, symbol, limit = 120 } = req.query;

  try {
    // ==========================================
    // 1. 虛擬貨幣 (幣安 U本位合約 API)
    // ==========================================
    const BINANCE_BASE_URL = 'https://fapi.binance.com/fapi/v1';

    if (action === 'overview') {
      // 獲取首頁列表所需的：24hr報價 + 資金費率
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
      // 獲取 K 線數據
      const klineRes = await fetch(`${BINANCE_BASE_URL}/klines?symbol=${symbol}&interval=15m&limit=${limit}`);
      if (!klineRes.ok) throw new Error('獲取 K 線失敗');
      
      const data = await klineRes.json();
      return res.status(200).json(data);
    } 
    
    else if (action === 'price' && symbol) {
      // 獲取單一幣種的最新價格
      const priceRes = await fetch(`${BINANCE_BASE_URL}/ticker/price?symbol=${symbol}`);
      if (!priceRes.ok) throw new Error('獲取價格失敗');
      
      const data = await priceRes.json();
      return res.status(200).json(data);
    }

    // ==========================================
    // 2. 台灣股市 (證交所 Open API)
    // ==========================================
    else if (action === 'tw-stocks') {
      const twseRes = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
      if (!twseRes.ok) throw new Error('取得證交所數據失敗');
      
      const data = await twseRes.json();
      return res.status(200).json(data);
    }

    // ==========================================
    // 3. 熱點新聞 (Yahoo 股市 & Cointelegraph RSS)
    // ==========================================
    else if (action === 'news') {
      const feeds = [
        { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
        { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
      ];

      let allArticles = [];
      
      // 透過 rss2json 服務將 XML RSS 轉為 JSON
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

      // 依據時間由新到舊排序
      allArticles.sort((a, b) => b.rawDate - a.rawDate);
      return res.status(200).json(allArticles);
    } 
    
    // 無效的操作參數
    else {
      return res.status(400).json({ error: '無效的 action 參數或缺少必要欄位' });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: '內部伺服器錯誤', details: error.message });
  }
}
