export default async function handler(req, res) {
  // 強制抹除快取，並允許您的前端無阻礙連線
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, symbol, limit = 120, interval = '15m', range = '6mo' } = req.query;

  // 爬蟲核心：偽裝成真實 Google Chrome 瀏覽器，突破反爬蟲機制
  const scraperHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache'
  };

  const fetchAsBrowser = async (url) => {
    try {
      const response = await fetch(url, { headers: scraperHeaders });
      if (!response.ok) return null;
      return await response.text();
    } catch (e) {
      return null;
    }
  };

  try {
    // ----------------------------------------------------
    // 1. 台股總覽爬蟲 (完全避開前端瀏覽器 CORS)
    // ----------------------------------------------------
    if (action === 'tw_list') {
      try {
        const [tseHtml, otcHtml] = await Promise.all([
          fetchAsBrowser('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
          fetchAsBrowser('https://www.tpex.org.tw/openapi/v1/t1820')
        ]);

        let resTse = [];
        let resOtc = [];
        
        try { if (tseHtml) resTse = JSON.parse(tseHtml); } catch(e) { console.error('TSE Parse Error'); }
        try { if (otcHtml) resOtc = JSON.parse(otcHtml); } catch(e) { console.error('OTC Parse Error'); }

        const combined = [];
        const processStockData = (item) => {
            const todayPrice = parseFloat(item.ClosingPrice || item.Close);
            let changeStr = String(item.Change || '0').replace(/\s+/g, '').replace('+', '').replace('X', '');
            const match = changeStr.match(/-?\d+\.?\d*/);
            let changeAmt = match ? parseFloat(match[0]) : 0;
            if (String(item.Change).includes('-')) changeAmt = -Math.abs(changeAmt);
            
            let percent = 0, yesterdayClose = todayPrice; 
            if (!isNaN(todayPrice) && !isNaN(changeAmt) && todayPrice !== 0) {
                yesterdayClose = todayPrice - changeAmt; 
                if (yesterdayClose > 0) percent = ((todayPrice - yesterdayClose) / yesterdayClose) * 100.0;
            }
            return { 
                symbol: String(item.Code || item.SecuritiesCompanyCode), 
                name: String(item.Name || item.CompanyName || item.SecuritiesCompanyName), 
                lastPrice: isNaN(todayPrice) ? '0.00' : todayPrice.toFixed(2), 
                priceChangePercent: percent.toFixed(2), 
                quoteVolume: parseInt(item.TradeVolume || item.Volume) || 0,
                officialPrevClose: yesterdayClose
            };
        };

        if (resTse.length > 0) combined.push(...resTse.filter(i => i && i.Code).map(processStockData));
        if (resOtc.length > 0) combined.push(...resOtc.filter(i => i && i.SecuritiesCompanyCode).map(processStockData));

        const filtered = combined.filter(i => /^[0-9A-Z]{4,6}$/.test(i.symbol)).sort((a, b) => b.quoteVolume - a.quoteVolume);
        return res.status(200).json(filtered);
      } catch (err) {
        return res.status(500).json({ error: '爬蟲抓取失敗' });
      }
    }

    // ----------------------------------------------------
    // 2. 即時報價爬蟲 (API 混搭 HTML Regex 解析)
    // ----------------------------------------------------
    else if (action === 'quote' && symbol) {
      try {
        // 策略 A: 先嘗試 Yahoo 原生 API
        const apiData = await fetchAsBrowser(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
        if (apiData) {
           const parsed = JSON.parse(apiData);
           if (parsed?.quoteResponse?.result?.length > 0) {
               return res.status(200).json(parsed);
           }
        }
      } catch(e) {}

      // 策略 B: API 被擋時，啟動終極 HTML 網頁爬蟲 (解析 Yahoo 網頁原始碼)
      try {
        const baseSym = symbol.split(',')[0].replace('.TW', '').replace('.TWO', '');
        const html = await fetchAsBrowser(`https://tw.stock.yahoo.com/quote/${baseSym}`);
        
        if (html) {
           // 利用 Regex 暴力萃取隱藏在網頁底層的 JSON 狀態
           const priceMatch = html.match(/"regularMarketPrice":\s*([\d\.]+)/);
           const prevMatch = html.match(/"regularMarketPreviousClose":\s*([\d\.]+)/);
           const volMatch = html.match(/"regularMarketVolume":\s*([\d\.]+)/);

           if (priceMatch) {
               return res.status(200).json({
                   quoteResponse: {
                       result: [{
                           symbol: symbol.split(',')[0],
                           regularMarketPrice: parseFloat(priceMatch[1]),
                           regularMarketPreviousClose: prevMatch ? parseFloat(prevMatch[1]) : 0,
                           regularMarketVolume: volMatch ? parseInt(volMatch[1]) : 0
                       }]
                   }
               });
           }
        }
      } catch(e) {}
      
      return res.status(200).json({});
    }

    // ----------------------------------------------------
    // 3. 歷史 K 線與財經新聞
    // ----------------------------------------------------
    else if (action === 'history' && symbol) {
      let html = await fetchAsBrowser(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=${range}&interval=1d`);
      let data = html ? JSON.parse(html) : null;
      if (!data?.chart?.result) {
          html = await fetchAsBrowser(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=${range}&interval=1d`);
          data = html ? JSON.parse(html) : {};
      }
      return res.status(200).json(data);
    }
    else if (action === 'news') {
      if (symbol) {
        const html = await fetchAsBrowser(`https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}.TW&newsCount=10`);
        const data = html ? JSON.parse(html) : {};
        return res.status(200).json(data?.news || []);
      } else {
        const feeds = [
          { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
          { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
        ];
        let allArticles = [];
        for (const feed of feeds) {
           const html = await fetchAsBrowser(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
           if (html) {
             const data = JSON.parse(html);
             if (data?.status === 'ok') {
               const items = data.items.map(item => ({
                 id: item.guid || item.link, title: item.title, link: item.link, 
                 time: new Date(item.pubDate).toLocaleString(), rawDate: new Date(item.pubDate).getTime(), 
                 source: feed.category === '加密貨幣' ? 'Cointelegraph' : 'Yahoo 股市', category: feed.category
               }));
               allArticles.push(...items);
             }
           }
        }
        allArticles.sort((a, b) => b.rawDate - a.rawDate);
        return res.status(200).json(allArticles);
      }
    }

    return res.status(400).json({ error: 'Invalid Request' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
