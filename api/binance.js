// 這是 Vercel 的 Serverless Function 檔案
// 需放置於專案根目錄的 api 資料夾中，即: /api/binance.js

export default async function handler(req, res) {
  // 1. 設定 CORS 標頭，允許前端跨域請求 (解決瀏覽器 CORS 問題)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // 允許所有來源
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 處理 OPTIONS 預檢請求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. 根據前端傳來的 action 決定要向幣安請求什麼數據
  const { action, symbol } = req.query;

  try {
    const BASE_URL = 'https://fapi.binance.com/fapi/v1';

    if (action === 'overview') {
      // 獲取首頁列表所需的：24hr報價 + 資金費率
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
      // 獲取 K 線數據 (15分鐘線，100根)
      const klineRes = await fetch(`${BASE_URL}/klines?symbol=${symbol}&interval=15m&limit=100`);
      if (!klineRes.ok) throw new Error('獲取 K 線失敗');
      
      const data = await klineRes.json();
      return res.status(200).json(data);
    } 
    
    else if (action === 'price' && symbol) {
      // 獲取單一幣種的最新價格 (實時跳動用)
      const priceRes = await fetch(`${BASE_URL}/ticker/price?symbol=${symbol}`);
      if (!priceRes.ok) throw new Error('獲取價格失敗');
      
      const data = await priceRes.json();
      return res.status(200).json(data);
    } 
    
    else {
      return res.status(400).json({ error: '無效的 action 或缺少 symbol 參數' });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: '內部伺服器錯誤', details: error.message });
  }
}