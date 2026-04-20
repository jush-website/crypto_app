<<<<
// 🔥 處理歷史 K 線，並融合「即時報價」進行動態 K 線補丁
function parseYahooData(data, officialPrevClose, quoteData = null) {
  if (!data?.chart?.result?.[0]) return null;
  const result = data.chart.result[0];
  const meta = result.meta;
  if (!meta) return null;

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  
  let validKlines = [];
  for (let i = 0; i < timestamps.length; i++) {
      if (quote.close && quote.close[i] != null) {
          validKlines.push({ 
              time: timestamps[i] * 1000, 
              open: Number(quote.open[i]), 
              high: Number(quote.high[i]), 
              low: Number(quote.low[i]), 
              close: Number(quote.close[i]), 
              volume: Number(quote.volume[i] || 0) 
          });
      }
  }

  let todayPrice = 0;
  let todayVol = 0;
  let trueYesterdayClose = 0;

  // 動態 K 線補丁：若有取得即時報價，自動修補或新增今日 K 線 (解決跨週末 4/17 延遲問題)
  if (quoteData && quoteData.price) {
      const livePrice = quoteData.price;
      const liveVol = quoteData.vol;
      const opt = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
      // Yahoo 的 time 是秒數，轉為毫秒後取日期
      const marketDateStr = new Date((quoteData.time || Date.now() / 1000) * 1000).toLocaleDateString('zh-TW', opt);

      if (validKlines.length > 0) {
          const lastK = validKlines[validKlines.length - 1];
          const lastKDateStr = new Date(lastK.time).toLocaleDateString('zh-TW', opt);

          if (lastKDateStr === marketDateStr) {
              // 覆寫今日未完成的 K 線
              lastK.close = livePrice;
              lastK.volume = Math.max(lastK.volume, liveVol);
              lastK.high = Math.max(lastK.high, livePrice);
              lastK.low = Math.min(lastK.low, livePrice);
              todayPrice = livePrice;
              todayVol = lastK.volume;
              if (validKlines.length >= 2) trueYesterdayClose = validKlines[validKlines.length - 2].close;
          } else {
              // 新增今日 K 線 (當日線陣列還停留在上週五時觸發)
              trueYesterdayClose = lastK.close;
              todayPrice = livePrice;
              todayVol = liveVol;
              validKlines.push({
                  time: (quoteData.time || Date.now() / 1000) * 1000,
                  open: meta.regularMarketOpen || livePrice, 
                  high: meta.regularMarketDayHigh || livePrice,
                  low: meta.regularMarketDayLow || livePrice,
                  close: livePrice,
                  volume: liveVol
              });
          }
      }
  } else {
      const lastK = validKlines.length > 0 ? validKlines[validKlines.length - 1] : null;
      todayPrice = lastK ? lastK.close : Number(meta.regularMarketPrice || 0);
      todayVol = lastK ? lastK.volume : Number(meta.regularMarketVolume || 0);
      if (validKlines.length >= 2) trueYesterdayClose = validKlines[validKlines.length - 2].close;
  }

  const yesterdayClose = trueYesterdayClose > 0 
      ? trueYesterdayClose 
      : ((officialPrevClose && officialPrevClose > 0) ? Number(officialPrevClose) : Number(meta.previousClose || 0));

  let change = 0;
  if (yesterdayClose > 0) {
      change = ((todayPrice - yesterdayClose) / yesterdayClose) * 100.0;
  }

  return { price: todayPrice, change, vol: todayVol, yesterdayClose, klines: validKlines };
}
====
// 🔥 處理歷史 K 線，並融合「即時報價」進行動態 K 線補丁
function parseYahooData(data, officialPrevClose, quoteData = null) {
  if (!data?.chart?.result?.[0]) return null;
  const result = data.chart.result[0];
  const meta = result.meta;
  if (!meta) return null;

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  
  let validKlines = [];
  for (let i = 0; i < timestamps.length; i++) {
      if (quote.close && quote.close[i] != null) {
          validKlines.push({ 
              time: timestamps[i] * 1000, 
              open: Number(quote.open[i]), 
              high: Number(quote.high[i]), 
              low: Number(quote.low[i]), 
              close: Number(quote.close[i]), 
              volume: Number(quote.volume[i] || 0) 
          });
      }
  }

  let todayPrice = 0;
  let todayVol = 0;
  let trueYesterdayClose = 0;

  // 🔥 強制取得台灣當前真實日期 (徹底解決跨週末與 API 時間戳錯誤的問題)
  const opt = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
  const todayStr = new Date().toLocaleDateString('zh-TW', opt);

  // 動態 K 線補丁：若有取得即時報價，自動修補或強制新增今日 K 線
  if (quoteData && quoteData.price > 0) {
      const livePrice = quoteData.price;
      const liveVol = quoteData.vol || 0;

      if (validKlines.length > 0) {
          const lastK = validKlines[validKlines.length - 1];
          const lastKDateStr = new Date(lastK.time).toLocaleDateString('zh-TW', opt);

          if (lastKDateStr === todayStr) {
              // 今日 K 線已經存在，直接覆寫更新最新即時市價
              lastK.close = livePrice;
              lastK.volume = Math.max(lastK.volume, liveVol);
              lastK.high = Math.max(lastK.high, livePrice);
              lastK.low = Math.min(lastK.low, livePrice);
              todayPrice = livePrice;
              todayVol = lastK.volume;
              if (validKlines.length >= 2) trueYesterdayClose = validKlines[validKlines.length - 2].close;
          } else {
              // 今日 K 線尚未生成 (跨週末、或盤中延遲)，強制手工畫出最新的一根 K 棒！
              trueYesterdayClose = lastK.close;
              todayPrice = livePrice;
              todayVol = liveVol;
              validKlines.push({
                  time: Date.now(), // 直接標記為此時此刻
                  open: meta.regularMarketOpen || livePrice, 
                  high: Math.max(meta.regularMarketDayHigh || livePrice, livePrice),
                  low: Math.min(meta.regularMarketDayLow || livePrice, livePrice),
                  close: livePrice,
                  volume: liveVol
              });
          }
      }
  } else {
      // 無即時報價時的備用退回機制
      const lastK = validKlines.length > 0 ? validKlines[validKlines.length - 1] : null;
      todayPrice = lastK ? lastK.close : Number(meta.regularMarketPrice || 0);
      todayVol = lastK ? lastK.volume : Number(meta.regularMarketVolume || 0);
      if (validKlines.length >= 2) trueYesterdayClose = validKlines[validKlines.length - 2].close;
  }

  const yesterdayClose = trueYesterdayClose > 0 
      ? trueYesterdayClose 
      : ((officialPrevClose && officialPrevClose > 0) ? Number(officialPrevClose) : Number(meta.previousClose || 0));

  let change = 0;
  if (yesterdayClose > 0) {
      change = ((todayPrice - yesterdayClose) / yesterdayClose) * 100.0;
  }

  return { price: todayPrice, change, vol: todayVol, yesterdayClose, klines: validKlines };
}
>>>>
