export default async function handler(req, res) {
  // 強制抹除所有快取，並設置 CORS 標頭允許前端存取
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, symbol, limit = 120, interval = '15m', range = '6mo' } = req.query;

  // 封裝具有 Browser 特徵的 Fetch，突破 Yahoo 等伺服器的防爬蟲機制
  const fetchWithBrowser = async (url) => {
    try {
      const response = await fetch(url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  };

  try {
    // ----------------------------------------------------
    // 1. 台股總覽 (TW List) - 官方 OpenAPI 無參數直連
    // ----------------------------------------------------
    if (action === 'tw_list') {
      const [resTse, resOtc] = await Promise.all([
        fetchWithBrowser('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
        fetchWithBrowser('https://www.tpex.org.tw/openapi/v1/t1820')
      ]);

      const arrTse = Array.isArray(resTse) ? resTse : [];
      const arrOtc = Array.isArray(resOtc) ? resOtc : [];
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

      if (arrTse.length > 0) combined.push(...arrTse.filter(i => i && i.Code).map(processStockData));
      if (arrOtc.length > 0) combined.push(...arrOtc.filter(i => i && i.SecuritiesCompanyCode).map(processStockData));

      const filtered = combined.filter(i => /^[0-9A-Z]{4,6}$/.test(i.symbol)).sort((a, b) => b.quoteVolume - a.quoteVolume);
      return res.status(200).json(filtered);
    }

    // ----------------------------------------------------
    // 2. 即時報價 (Yahoo Quote)
    // ----------------------------------------------------
    else if (action === 'quote' && symbol) {
      const data = await fetchWithBrowser(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
      return res.status(200).json(data || {});
    }

    // ----------------------------------------------------
    // 3. 歷史 K 線 (Yahoo Chart)
    // ----------------------------------------------------
    else if (action === 'history' && symbol) {
      let data = await fetchWithBrowser(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=${range}&interval=1d`);
      if (!data?.chart?.result) {
          data = await fetchWithBrowser(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TWO?range=${range}&interval=1d`);
      }
      return res.status(200).json(data || {});
    }

    // ----------------------------------------------------
    // 4. 財經新聞 (Yahoo News & RSS)
    // ----------------------------------------------------
    else if (action === 'news') {
      if (symbol) {
        const data = await fetchWithBrowser(`https://query2.finance.yahoo.com/v1/finance/search?q=${symbol}.TW&newsCount=10`);
        return res.status(200).json(data?.news || []);
      } else {
        const feeds = [
          { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
          { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
        ];
        let allArticles = [];
        for (const feed of feeds) {
           const data = await fetchWithBrowser(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
           if (data?.status === 'ok') {
             const items = data.items.map(item => ({
               id: item.guid || item.link, title: item.title, link: item.link, 
               time: new Date(item.pubDate).toLocaleString(), rawDate: new Date(item.pubDate).getTime(), 
               source: feed.category === '加密貨幣' ? 'Cointelegraph' : 'Yahoo 股市', category: feed.category
             }));
             allArticles.push(...items);
           }
        }
        allArticles.sort((a, b) => b.rawDate - a.rawDate);
        return res.status(200).json(allArticles);
      }
    }

    // ----------------------------------------------------
    // 5. 虛擬貨幣 (Binance)
    // ----------------------------------------------------
    else if (action === 'crypto_tickers') {
      const data = await fetchWithBrowser('https://fapi.binance.com/fapi/v1/ticker/24hr');
      return res.status(200).json(data || []);
    } 
    else if (action === 'funding_rates') {
      const data = await fetchWithBrowser('https://fapi.binance.com/fapi/v1/premiumIndex');
      return res.status(200).json(data || []);
    }
    else if (symbol) {
      const data = await fetchWithBrowser(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      return res.status(200).json(data || []);
    }

    return res.status(400).json({ error: 'Invalid Request' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
