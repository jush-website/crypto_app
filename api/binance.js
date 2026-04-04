// 這是 Vercel 的 Serverless Function 檔案
// 需放置於專案根目錄的 api 資料夾中，即: /api/binance.js

export default async function handler(req, res) {
  // 設定 CORS 標頭，允許前端跨域請求 (解決瀏覽器 CORS 問題)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // 允許所有來源，如果需要更安全可以改成你的前端域名
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
    // 幣安 U本位合約 API 基礎網址
    const BASE_URL = 'https://fapi.binance.com/fapi/v1';

    if (action === 'overview') {
      // 1. 獲取首頁列表所需的：24hr報價 + 資金費率
      const [tickerRes, fundingRes] = await Promise.all([
        fetch(`${BASE_URL}/ticker/24hr`),
        fetch(`${BASE_URL}/premiumIndex`)
      ]);

      if (!tickerRes.ok || !fundingRes.ok) {
        throw new Error('幣安 API 請求失敗');
      }

      const tickers = await tickerRes.json();
      const fundingRates = await fundingRes.json();

      return res.status(200).json({ tickers, fundingRates });
    } 
    
    else if (action === 'klines' && symbol) {
      // 2. 獲取 K 線數據 (預設為 15 分鐘線)
      const klineRes = await fetch(`${BASE_URL}/klines?symbol=${symbol}&interval=15m&limit=${limit}`);
      if (!klineRes.ok) throw new Error('獲取 K 線失敗');
      
      const data = await klineRes.json();
      return res.status(200).json(data);
    } 
    
    else if (action === 'price' && symbol) {
      // 3. 獲取單一幣種的最新價格 (實時跳動與模擬交易結算用)
      const priceRes = await fetch(`${BASE_URL}/ticker/price?symbol=${symbol}`);
      if (!priceRes.ok) throw new Error('獲取價格失敗');
      
      const data = await priceRes.json();
      return res.status(200).json(data);
    } 
    
    else {
      // 缺少參數或無效的操作
      return res.status(400).json({ error: '無效的 action 或缺少 symbol 參數' });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: '內部伺服器錯誤', details: error.message });
  }
}
