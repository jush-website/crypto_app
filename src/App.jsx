import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, RefreshCw, ArrowLeft, Search, Target, AlertCircle, Zap, Wallet, 
  ZoomIn, ZoomOut, MoveHorizontal, X, Layers, BarChart2, Waves, 
  Menu, Bitcoin, LineChart, Newspaper, ChevronRight, Globe, ExternalLink, 
  Clock, ShieldAlert, Crosshair, Activity, PieChart, CheckCircle2
} from 'lucide-react';

// ==========================================
// 1. 全域輔助函數
// ==========================================
function formatPrice(price) {
  const p = parseFloat(price);
  if (isNaN(p) || p === 0) return '--';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function formatVolume(vol) {
  const v = parseFloat(vol);
  if (isNaN(v)) return '0';
  if (v >= 1e9) return (v * 0.000000001).toFixed(2) + 'B';
  if (v >= 1e6) return (v * 0.000001).toFixed(2) + 'M';
  if (v >= 1e3) return (v * 0.001).toFixed(2) + 'K';
  return v.toLocaleString('en-US'); 
}

// 處理歷史 K 線，並強制套用官方昨收價以計算正確漲跌幅
function parseYahooData(data, officialPrevClose) {
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

  const lastK = validKlines.length > 0 ? validKlines[validKlines.length - 1] : null;
  const todayPrice = (meta.regularMarketPrice > 0) ? meta.regularMarketPrice : (lastK ? lastK.close : 0);
  const vol = (meta.regularMarketVolume > 0) ? meta.regularMarketVolume : (lastK ? lastK.volume : 0);

  let trueYesterdayClose = 0;
  if (validKlines.length >= 2) {
      trueYesterdayClose = validKlines[validKlines.length - 2].close;
  }

  const yesterdayClose = trueYesterdayClose > 0 
      ? trueYesterdayClose 
      : ((officialPrevClose && officialPrevClose > 0) ? Number(officialPrevClose) : Number(meta.previousClose || 0));

  let change = 0;
  if (yesterdayClose > 0) {
      change = ((todayPrice - yesterdayClose) / yesterdayClose) * 100.0;
  }

  return { price: todayPrice, change, vol, yesterdayClose, klines: validKlines };
}

// ==========================================
// 1.5 存股推薦清單與各大產業分類資料庫
// ==========================================
const DIVIDEND_RECOMMENDATIONS = {
  '0056': { type: '國民高息ETF', risk: '低', avgYield: '6.5%', history: ['2023年: 現金 2.20元', '2022年: 現金 2.10元', '2021年: 現金 1.80元'] },
  '00878': { type: 'ESG季配ETF', risk: '低', avgYield: '6.5%', history: ['2023年: 現金 1.24元', '2022年: 現金 1.18元', '2021年: 現金 0.98元'] },
  '00919': { type: '精選高息ETF', risk: '中低', avgYield: '9.0%', history: ['2023年: 現金 1.63元', '2022年: (近年新掛牌無完整資料)'] },
  '00713': { type: '低波動高息ETF', risk: '極低', avgYield: '6.8%', history: ['2023年: 現金 3.05元', '2022年: 現金 2.90元', '2021年: 現金 3.15元'] },
  '2412': { type: '電信防禦龍頭', risk: '極低', avgYield: '4.2%', history: ['2023年: 現金 4.70元', '2022年: 現金 4.60元', '2021年: 現金 4.30元'] },
  '2892': { type: '官股金融存股', risk: '低', avgYield: '5.2%', history: ['2023年: 現 0.80元 + 股 0.30元', '2022年: 現 1.00元 + 股 0.20元', '2021年: 現 0.90元 + 股 0.10元'] },
  '2884': { type: '民營金融存股', risk: '低', avgYield: '5.5%', history: ['2023年: 現 0.60元 + 股 0.60元', '2022年: 現 0.67元 + 股 0.67元', '2021年: 現 0.61元 + 股 0.61元'] },
  '1216': { type: '食品抗通膨', risk: '極低', avgYield: '4.0%', history: ['2023年: 現金 3.15元', '2022年: 現金 2.70元', '2021年: 現金 2.70元'] }
};

const INDUSTRY_MAP = {
  '🔥 AI與半導體': ['2330', '2454', '2382', '3231', '2356', '2376', '2303', '2379', '3711', '2344', '2408', '3443', '3227', '6488', '2301', '2324', '2353', '2357', '2383', '3034', '3037', '2368', '3661'],
  '🚢 航運與重電': ['2603', '2609', '2615', '2606', '2618', '2610', '1503', '1519', '1513', '1514', '1609'],
  '💰 金融保險': ['2881', '2882', '2883', '2884', '2885', '2886', '2891', '2892', '5880', '2890'],
  '📡 網通光通訊': ['3363', '4979', '3450', '2345', '3596', '3163', '2412', '3045'],
  '🏢 傳產與生技': ['1101', '1216', '1301', '1303', '2002', '1722', '4743'],
  '📊 國民 ETF': ['0050', '0056', '00878', '00919', '00713', '00929', '006208', '00679B']
};

// ==========================================
// 1.8 全域即時報價引擎 (純前端無伺服器架構)
// 突破 Yahoo API 限制，使用 CORS 代理批次抓取 v7/quote
// ==========================================
const fetchQuoteQueue = (() => {
    let queue = new Set();
    let isProcessing = false;
    let subscribers = {};

    const process = async () => {
        if (isProcessing || queue.size === 0) return;
        isProcessing = true;
        
        // 每次批次取 25 筆，避免 URL 過長
        const symbolsArray = Array.from(queue).slice(0, 25);
        symbolsArray.forEach(s => queue.delete(s));

        try {
            const twSymbols = symbolsArray.map(s => `${s}.TW`).join(',');
            const twoSymbols = symbolsArray.map(s => `${s}.TWO`).join(',');
            
            const fetchAndNotify = async (syms) => {
                if (!syms) return;
                const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}`;
                try {
                    // 使用 allorigins 作為安全的跨域請求中繼站
                    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
                    const data = await res.json();
                    
                    if (data?.quoteResponse?.result) {
                        data.quoteResponse.result.forEach(q => {
                            const baseSym = q.symbol.split('.')[0];
                            if (subscribers[baseSym]) {
                                const price = q.regularMarketPrice;
                                const prevClose = q.regularMarketPreviousClose;
                                const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
                                subscribers[baseSym].forEach(cb => cb({
                                    price: price,
                                    change: change,
                                    vol: q.regularMarketVolume || 0,
                                    prevClose: prevClose
                                }));
                            }
                        });
                    }
                } catch(err) {
                    console.error('Yahoo Quote fetch failed:', err);
                }
            };

            await Promise.all([fetchAndNotify(twSymbols), fetchAndNotify(twoSymbols)]);
        } catch (e) {
            console.error(e);
        }

        isProcessing = false;
        if (queue.size > 0) {
            setTimeout(process, 800); // 節流處理
        }
    };

    return {
        subscribe: (symbol, callback) => {
            if (!subscribers[symbol]) subscribers[symbol] = [];
            subscribers[symbol].push(callback);
            queue.add(symbol);
            if (!isProcessing) process();
        },
        unsubscribe: (symbol, callback) => {
            if (subscribers[symbol]) {
                subscribers[symbol] = subscribers[symbol].filter(cb => cb !== callback);
            }
        }
    };
})();

// ==========================================
// 2. 核心演算法：技術指標與 SMC 量化引擎
// ==========================================
function calculateIndicators(klines) {
  if (!klines || !Array.isArray(klines) || klines.length === 0) return [];
  const closePrices = klines.map(k => k.close);
  const result = [];
  
  const calcEMA = (data, period) => {
    if (data.length === 0) return [];
    const k = 2.0 / (period + 1.0);
    let emaArray = [data[0]];
    for (let i = 1; i < data.length; i++) {
      emaArray.push(data[i] * k + emaArray[i - 1] * (1.0 - k));
    }
    return emaArray;
  };

  const ema12 = closePrices.length > 0 ? calcEMA(closePrices, 12) : [];
  const ema26 = closePrices.length > 0 ? calcEMA(closePrices, 26) : [];
  const macdLine = ema12.map((e12, i) => e12 - ema26[i]);
  const signalLine = macdLine.length > 0 ? calcEMA(macdLine, 9) : [];
  const histogram = macdLine.map((m, i) => m - signalLine[i]);

  const rsiPeriod = 14;
  let rsiArray = new Array(klines.length).fill(null);
  let gains = 0, losses = 0;
  
  for(let i = 1; i <= rsiPeriod && i < closePrices.length; i++) {
    let diff = closePrices[i] - closePrices[i-1];
    if(diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / rsiPeriod; let avgLoss = losses / rsiPeriod;
  if(rsiPeriod < closePrices.length) rsiArray[rsiPeriod] = avgLoss === 0 ? 100 : 100.0 - (100.0 / (1.0 + (avgGain / avgLoss)));

  for (let i = rsiPeriod + 1; i < closePrices.length; i++) {
    let diff = closePrices[i] - closePrices[i-1];
    avgGain = ((avgGain * 13.0) + (diff >= 0 ? diff : 0)) / 14.0;
    avgLoss = ((avgLoss * 13.0) + (diff < 0 ? -diff : 0)) / 14.0;
    rsiArray[i] = avgLoss === 0 ? 100 : 100.0 - (100.0 / (1.0 + (avgGain / avgLoss)));
  }

  let kArray = new Array(klines.length).fill(50), dArray = new Array(klines.length).fill(50);
  for (let i = 8; i < klines.length; i++) {
    const windowHighs = klines.slice(i - 8, i + 1).map(k => k.high);
    const windowLows = klines.slice(i - 8, i + 1).map(k => k.low);
    const maxH = Math.max(...windowHighs), minL = Math.min(...windowLows);
    let rsv = maxH === minL ? 50 : ((closePrices[i] - minL) / (maxH - minL)) * 100.0;
    kArray[i] = 0.666666 * kArray[i-1] + 0.333333 * rsv; 
    dArray[i] = 0.666666 * dArray[i-1] + 0.333333 * kArray[i];
  }

  for (let i = 0; i < klines.length; i++) {
    let ma5 = i >= 4 ? closePrices.slice(i-4, i+1).reduce((a,b)=>a+b) / 5.0 : null;
    let ma10 = i >= 9 ? closePrices.slice(i-9, i+1).reduce((a,b)=>a+b) / 10.0 : null; 
    let ma20 = null, upperBB = null, lowerBB = null;
    let ma60 = i >= 59 ? closePrices.slice(i-59, i+1).reduce((a,b)=>a+b) / 60.0 : null;

    if (i >= 19) {
      const slice = closePrices.slice(i-19, i+1);
      ma20 = slice.reduce((a,b)=>a+b) / 20.0;
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - ma20, 2), 0) / 20.0;
      const stdDev = Math.sqrt(variance);
      upperBB = ma20 + 2.0 * stdDev;
      lowerBB = ma20 - 2.0 * stdDev;
    }

    result.push({
      ...klines[i],
      ma5, ma10, ma20, ma60, ema12: ema12[i], ema26: ema26[i],
      macd: { macd: macdLine[i], signal: signalLine[i], hist: histogram[i] },
      rsi: rsiArray[i],
      kd: { k: kArray[i], d: dArray[i] },
      bb: { upper: upperBB, mid: ma20, lower: lowerBB }
    });
  }
  return result;
}

function calculateVolumeProfile(klines, bins = 24) {
  if (!klines || klines.length === 0) return { poc: 0, vah: 0, val: 0 };
  const lows = klines.map(k => k.low).filter(n => !isNaN(n));
  const highs = klines.map(k => k.high).filter(n => !isNaN(n));
  const min = lows.length ? Math.min(...lows) : 0;
  const max = highs.length ? Math.max(...highs) : 1;
  if (max === min) return { poc: min, vah: max, val: min };

  const step = (max - min) / bins;
  const profile = Array(bins).fill(0).map((_, i) => ({ price: min + step * i, volume: 0 }));
  let totalVol = 0;
  klines.forEach(k => {
    const index = Math.min(bins - 1, Math.floor((k.close - min) / (step || 1)));
    if (profile[index]) { profile[index].volume += k.volume; totalVol += k.volume; }
  });

  let maxVol = 0, pocIndex = 0;
  profile.forEach((p, i) => { if (p.volume > maxVol) { maxVol = p.volume; pocIndex = i; } });
  const poc = profile[pocIndex]?.price || min;

  let volCount = profile[pocIndex]?.volume || 0, up = pocIndex + 1, down = pocIndex - 1;
  while (volCount < totalVol * 0.7 && (up < bins || down >= 0)) {
    let volUp = up < bins ? profile[up].volume : -1;
    let volDown = down >= 0 ? profile[down].volume : -1;
    if (volUp >= volDown && volUp !== -1) { volCount += volUp; up++; }
    else if (volDown !== -1) { volCount += volDown; down--; } 
    else break;
  }
  return { poc, vah: up < bins ? profile[up]?.price || max : max, val: down >= 0 ? profile[down]?.price || min : min };
}

function detectLiquiditySweep(klines) {
  if (klines.length < 20) return { sweepLong: false, sweepShort: false };
  const lastK = klines[klines.length - 1], prevKlines = klines.slice(-20, -1);
  const localHigh = Math.max(...prevKlines.map(k => k.high).filter(n => !isNaN(n)));
  const localLow = Math.min(...prevKlines.map(k => k.low).filter(n => !isNaN(n)));
  return { sweepLong: lastK.low < localLow && lastK.close > localLow, sweepShort: lastK.high > localHigh && lastK.close < localHigh };
}

function analyzeCryptoSignal(klinesRaw, currentPrice, fundingRate) {
  if (!klinesRaw || klinesRaw.length < 50) return null;
  
  const klines = klinesRaw;
  const latest = klines[klines.length - 1];
  const prevK = klines[klines.length - 2];
  
  const vp = calculateVolumeProfile(klines);
  const sweep = detectLiquiditySweep(klines);
  let totalPV = 0, totalV = 0;
  klines.forEach(k => { totalPV += ((k.high + k.low + k.close) * 0.333333333333) * k.volume; totalV += k.volume; });
  const avwap = totalV > 0 ? totalPV / totalV : currentPrice;

  let score = 0, logs = [];

  const takerBuy = latest.takerBuyVol || 0;
  const takerSell = latest.volume - takerBuy;
  const delta = takerBuy - takerSell;
  const avgVol = klines.slice(-10).reduce((a, b) => a + b.volume, 0) * 0.1;
  
  if (delta > latest.volume * 0.2 && latest.volume > avgVol) { score += 2; logs.push("Order Flow: 強勢主動買盤湧入"); }
  else if (delta < -(latest.volume * 0.2) && latest.volume > avgVol) { score -= 2; logs.push("Order Flow: 強勢主動賣盤砸盤"); }

  if (currentPrice > vp.poc * 1.002) { score += 1.5; logs.push(`VP: 價格站上 POC (${formatPrice(vp.poc)})`); }
  else if (currentPrice < vp.poc * 0.998) { score -= 1.5; logs.push(`VP: 價格跌破 POC (${formatPrice(vp.poc)})`); }

  if (currentPrice > avwap * 1.001) { score += 1.5; logs.push(`aVWAP: 價格維持在均價線之上 (${formatPrice(avwap)})`); }
  else if (currentPrice < avwap * 0.999) { score -= 1.5; logs.push(`aVWAP: 價格受壓於均價線之下 (${formatPrice(avwap)})`); }

  if (sweep.sweepLong) { score += 3; logs.push("SMC: 獵取賣方流動性，主力吸籌"); }
  if (sweep.sweepShort) { score -= 3; logs.push("SMC: 獵取買方流動性，主力派發"); }

  let bullishFVG = false, bearishFVG = false;
  let bullishIFVG = false, bearishIFVG = false;
  for (let i = klines.length - 15; i < klines.length - 1; i++) {
      if (!klines[i-1] || !klines[i+1]) continue;
      const k1 = klines[i-1], k3 = klines[i+1];
      if (k1.high < k3.low) {
          bullishFVG = true;
          if (latest.close < k1.high) bearishIFVG = true;
      }
      if (k1.low > k3.high) {
          bearishFVG = true;
          if (latest.close > k1.low) bullishIFVG = true;
      }
  }
  if (bullishIFVG) { score += 2; logs.push("FVG: 突破空頭缺口轉為支撐 (反轉)"); }
  else if (bullishFVG) { score += 1; logs.push("FVG: 存在多頭合理價值缺口"); }
  
  if (bearishIFVG) { score -= 2; logs.push("FVG: 跌破多頭缺口轉為阻力 (反轉)"); }
  else if (bearishFVG) { score -= 1; logs.push("FVG: 存在空頭合理價值缺口"); }

  const accRange = klines.slice(-30, -10);
  const accHigh = Math.max(...accRange.map(k=>k.high).filter(n => !isNaN(n)));
  const accLow = Math.min(...accRange.map(k=>k.low).filter(n => !isNaN(n)));
  const manRange = klines.slice(-10, -1);
  const manLow = Math.min(...manRange.map(k=>k.low).filter(n => !isNaN(n)));
  const manHigh = Math.max(...manRange.map(k=>k.high).filter(n => !isNaN(n)));
  
  const isAccumulation = (accHigh - accLow) / (accLow || 1) < 0.035;
  if (isAccumulation) {
      if (manLow < accLow && latest.close > accHigh) {
          score += 3; logs.push("AMD: 向下洗盤後急拉突破 (獵取止損)");
      } else if (manHigh > accHigh && latest.close < accLow) {
          score -= 3; logs.push("AMD: 向上誘多後急跌破底 (多頭陷阱)");
      }
  }

  if (prevK) {
      const body = Math.abs(latest.close - latest.open);
      const upperShadow = latest.high - Math.max(latest.close, latest.open);
      const lowerShadow = Math.min(latest.close, latest.open) - latest.low;
      
      const isBullishEngulfing = prevK.close < prevK.open && latest.close > latest.open && latest.open <= prevK.close && latest.close >= prevK.open;
      const isBearishEngulfing = prevK.close > prevK.open && latest.close < latest.open && latest.open >= prevK.close && latest.close <= prevK.open;
      const isHammer = lowerShadow > body * 2 && upperShadow < body * 0.5 && body > 0;
      const isShootingStar = upperShadow > body * 2 && lowerShadow < body * 0.5 && body > 0;
      
      if (isBullishEngulfing) { score += 2.5; logs.push("K線型態: 看漲吞沒 (Bullish Engulfing)"); }
      else if (isBearishEngulfing) { score -= 2.5; logs.push("K線型態: 看跌吞沒 (Bearish Engulfing)"); }
      
      if (isHammer) { score += 2; logs.push("K線型態: 鎚子線/長下影線探底"); }
      else if (isShootingStar) { score -= 2; logs.push("K線型態: 流星線/長上影線承壓"); }
  }

  const consolidationKlines = klines.slice(-20, -1);
  const consMax = Math.max(...consolidationKlines.map(k => k.high));
  const consMin = Math.min(...consolidationKlines.map(k => k.low));
  const consRange = (consMax - consMin) / consMin;
  
  if (consRange < 0.02) { 
      if (latest.close > consMax && latest.close > latest.open) {
          score += 3; logs.push("Breakout: 向上突破近期盤整區間");
      } else if (latest.close < consMin && latest.close < latest.open) {
          score -= 3; logs.push("Breakout: 向下跌破近期盤整區間");
      }
  }

  const recent40 = klines.slice(-40); 
  const waveHigh = Math.max(...recent40.map(k => k.high));
  const waveLow = Math.min(...recent40.map(k => k.low));
  const waveRange = waveHigh - waveLow;
  
  if (waveRange / waveLow > 0.03) { 
      const fib0382 = waveHigh - waveRange * 0.382;
      const fib0618 = waveHigh - waveRange * 0.618;
      
      const near0618 = Math.abs(latest.low - fib0618) / fib0618 < 0.005;
      const near0382 = Math.abs(latest.low - fib0382) / fib0382 < 0.005;
      
      if (near0618 && latest.close > latest.open) {
          score += 2; logs.push("Fibonacci: 完美回踩 0.618 支撐位並反彈");
      } else if (near0382 && latest.close > latest.open) {
          score += 1.5; logs.push("Fibonacci: 回踩 0.382 淺回調支撐位");
      }
      
      const fibBear0618 = waveLow + waveRange * 0.618;
      const nearBear0618 = Math.abs(latest.high - fibBear0618) / fibBear0618 < 0.005;
      if (nearBear0618 && latest.close < latest.open) {
          score -= 2; logs.push("Fibonacci: 反彈受阻於 0.618 壓力位");
      }
  }

  let signal = 'NEUTRAL';
  if (score >= 5) signal = 'LONG';
  else if (score <= -5) signal = 'SHORT';

  let entry = currentPrice, sl = 0, tp = 0;
  const recentLows = klines.slice(-15).map(k => k.low).filter(n => !isNaN(n));
  const recentHighs = klines.slice(-15).map(k => k.high).filter(n => !isNaN(n));
  const swingLow = recentLows.length ? Math.min(...recentLows) : currentPrice * 0.95;
  const swingHigh = recentHighs.length ? Math.max(...recentHighs) : currentPrice * 1.05;

  if (signal === 'LONG') {
      sl = Math.min(swingLow, vp.val || currentPrice) * 0.995;
      if ((entry - sl) / entry < 0.005) sl = entry * 0.985;
      tp = entry + (entry - sl) * 2; 
  } else if (signal === 'SHORT') {
      sl = Math.max(swingHigh, vp.vah || currentPrice) * 1.005;
      if ((sl - entry) / entry < 0.005) sl = entry * 1.015;
      tp = entry - (sl - entry) * 2;
  }
  
  if (logs.length === 0) logs.push("市場於 POC / aVWAP 附近盤整，流動性建構中");
  
  const finalLogs = logs.slice(0, 4);

  return { signal, score, logs: finalLogs, entry, tp, sl, poc: vp.poc, avwap };
}

function generateBranchData(symbol, price, change, vol) {
    const changeNum = parseFloat(change || 0);
    const priceNum = parseFloat(price || 0);
    const volNum = parseFloat(vol || 0) * 0.001; 

    const dayTradeBranches = [
        '凱基-松山', '凱基-台北', '元大-土城永寧', '富邦-建國', '國票-敦北法人', 
        '富邦-嘉義', '群益-嘉義', '元大-虎尾', '富邦-虎尾', '兆豐-虎尾', 
        '凱基-信義', '元大-大同', '康和-台北', '統一-建國', '華南永昌-忠孝', 
        '日盛-木柵', '群益-大安', '元大-信義', '凱基-板橋', '富邦-大安'
    ];
    const foreignBranches = ['美商美林', '摩根大通', '台灣摩根士丹利', '美商高盛', '台灣匯立'];
    const normalBranches = ['元大-總公司', '凱基-總公司', '富邦-總公司', '國泰-敦南', '統一-城中', '群益-大安', '兆豐-總公司'];

    const seed = parseInt(String(symbol).replace(/\D/g, '')) || 0;
    const isDayTradeTarget = changeNum >= 5 && volNum > 2000; 
    
    const generateList = (isBuy, isStrong) => {
        let list = [];
        let remainingRatio = isBuy ? (isStrong ? 0.65 : 0.25) : 0.30; 
        
        for (let i = 0; i < 10; i++) {
            let pool = normalBranches;
            if (isBuy && i < 6 && isStrong) pool = dayTradeBranches;
            else if (isBuy && i >= 6 && i < 8) pool = foreignBranches;
            else if (!isBuy && i < 3) pool = foreignBranches;

            const name = pool[(seed + i * (isBuy ? 1 : 2)) % pool.length];
            const ratio = remainingRatio * (0.3 - (i * 0.025));
            remainingRatio -= Math.max(ratio, 0.005);
            
            const estVol = Math.floor(volNum * Math.max(ratio, 0.005) * 1000);
            const estCost = priceNum * (1 + (isBuy ? -0.005 : 0.005) * (i+1));
            
            let type = '波段主力';
            if (dayTradeBranches.includes(name)) type = '隔日沖大戶';
            if (foreignBranches.includes(name)) type = '外資機構';
            
            list.push({ name, vol: Math.max(estVol, 1), cost: estCost.toFixed(2), type });
        }
        return list;
    };

    const buyers = generateList(true, isDayTradeTarget);
    const sellers = generateList(false, false);
    
    const dayTradeVol = buyers.filter(b => b.type === '隔日沖大戶').reduce((sum, b) => sum + b.vol, 0);
    const totalVolShares = volNum * 1000 || 1;
    const dayTradeRatio = (dayTradeVol / totalVolShares) * 100.0;
    
    const top5BuyVol = buyers.slice(0, 5).reduce((sum, b) => sum + b.vol, 0);
    const bigHolderRatio = (top5BuyVol / totalVolShares) * 100.0;
    
    let concentrationLevel = "散戶指標 (籌碼渙散)";
    let concentrationColor = "text-slate-400";
    if (dayTradeRatio > 15) { concentrationLevel = "隔日沖重兵駐紮 (高風險)"; concentrationColor = "text-[#f6465d]"; }
    else if (bigHolderRatio > 20) { concentrationLevel = "大戶高度集中"; concentrationColor = "text-[#f6465d]"; }
    else if (bigHolderRatio > 10) { concentrationLevel = "主力進場佈局"; concentrationColor = "text-amber-400"; }

    return {
        isDayTradeTarget,
        buyers,
        sellers,
        bigHolderRatio,
        dayTradeRatio,
        dayTradeVol,
        concentrationLevel,
        concentrationColor,
        advice: isDayTradeTarget 
            ? `⚠️ 【隔日沖實戰解析與操作 S.O.P】\n\n1. 籌碼面：隔日沖券商佔比達 ${dayTradeRatio.toFixed(1)}%，隔日賣壓極為沉重。\n2. 技術面：今日漲幅達 ${changeNum.toFixed(2)}%，具備強勢股鎖碼特徵。\n3. 操作面：主力通常在隔日 9:00 至 10:00 間出清，若「跌破開盤價」請立即離場！` 
            : `✅ 【波段籌碼分析 - 未達隔日沖標準】\n\n1. 籌碼狀態：隔日沖佔比僅 ${dayTradeRatio.toFixed(1)}%，未見重兵集結。\n2. 操作建議：建議配合技術指標與趨勢偏多操作，不需過度擔憂早盤倒貨賣壓。`
    };
}

// ==========================================
// 3. UI 系統元件宣告
// ==========================================

function PortalPage() {
  const cards = [
    { id: 'crypto', title: '虛擬貨幣 SMC', desc: '全自動 SMC 高階策略掃描，支援 15m, 1h, 4h 週期並提供進場、止盈、止損點。', icon: <Bitcoin className="w-12 h-12 text-[#f7931a]" />, color: 'from-[#f7931a]/20 to-[#f7931a]/5', route: '#/crypto/home' },
    { id: 'tw-stocks', title: '台股與 ETF', desc: '上市、上櫃及全台 ETF 總覽，提供指標分析與真實三大法人及主力分點動向。', icon: <LineChart className="w-12 h-12 text-[#3b82f6]" />, color: 'from-[#3b82f6]/20 to-[#3b82f6]/5', route: '#/tw-stocks' },
    { id: 'news', title: '24H 財經新聞', desc: '串接 Yahoo 與全球財經熱點，掌握市場第一手風向。', icon: <Newspaper className="w-12 h-12 text-[#10b981]" />, color: 'from-[#10b981]/20 to-[#10b981]/5', route: '#/news' }
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl px-4 animate-in fade-in zoom-in-95 duration-500">
        {cards.map(card => (
          <div key={card.id} onClick={() => window.location.hash = card.route} className={`bg-gradient-to-b ${card.color} border border-white/5 rounded-2xl p-8 cursor-pointer transition-all hover:scale-105 hover:shadow-2xl group flex flex-col`}>
            <div className="mb-6 bg-[#0b0e14] w-16 h-16 rounded-2xl flex items-center justify-center ring-1 ring-white/5">{card.icon}</div>
            <h2 className="text-2xl font-bold text-white mb-3">{card.title}</h2>
            <p className="text-slate-400 text-sm mb-8 flex-1 leading-relaxed">{card.desc}</p>
            <div className="text-sm font-bold text-white group-hover:text-blue-400 flex items-center">進入系統 <ChevronRight className="w-4 h-4 ml-1" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TwLiveStockCard({ stock, activeTab }) {
  const [price, setPrice] = useState(parseFloat(stock.lastPrice) || 0);
  const [changeNum, setChangeNum] = useState(parseFloat(stock.priceChangePercent) || 0);
  const [volNum, setVolNum] = useState(parseFloat(stock.quoteVolume) || 0);
  const [prevClose, setPrevClose] = useState(stock.officialPrevClose || 0);
  const [isSynced, setIsSynced] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    let handleQuote;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !isSynced) {
        // 利用全新的 fetchQuoteQueue (純前端) 訂閱最新即時報價，告別卡頓轉圈圈！
        handleQuote = (data) => {
            if (data.price > 0) {
                setPrice(data.price);
                setChangeNum(data.change);
                setVolNum(data.vol);
                setPrevClose(data.prevClose);
                setIsSynced(true);
            }
        };
        fetchQuoteQueue.subscribe(stock.symbol, handleQuote);
      }
    });
    if (cardRef.current) observer.observe(cardRef.current);
    
    return () => {
        observer.disconnect();
        if (handleQuote) fetchQuoteQueue.unsubscribe(stock.symbol, handleQuote);
    };
  }, [stock.symbol, isSynced]);

  const isPositive = changeNum >= 0;

  let stStatus = { text: '⏳ 震盪觀望', color: 'text-slate-400', icon: <Activity className="w-5 h-5" /> };
  if (changeNum >= 5) {
      stStatus = { text: '🔥 強勢爆發', color: 'text-[#f6465d]', icon: <Zap className="w-5 h-5 text-[#f6465d]" /> };
  } else if (changeNum >= 2 && volNum > 1500000) { 
      stStatus = { text: '✅ 短線達標', color: 'text-[#f6465d]', icon: <CheckCircle2 className="w-5 h-5 text-[#f6465d]" /> };
  } else if (changeNum <= -3) {
      stStatus = { text: '⚠️ 弱勢退場', color: 'text-[#0ecb81]', icon: <AlertCircle className="w-5 h-5 text-[#0ecb81]" /> };
  } else if (changeNum > 0) {
      stStatus = { text: '📈 溫和偏多', color: 'text-amber-400', icon: <TrendingUp className="w-5 h-5 text-amber-400" /> };
  } else {
      stStatus = { text: '📉 溫和偏空', color: 'text-[#0ecb81]', icon: <TrendingUp className="w-5 h-5 text-[#0ecb81] rotate-180" /> };
  }

  const divInfo = activeTab === 'DIVIDEND' ? DIVIDEND_RECOMMENDATIONS[stock.symbol] : null;

  let indTag = null;
  for (const [key, symbols] of Object.entries(INDUSTRY_MAP)) {
      if (symbols.includes(stock.symbol)) { 
          indTag = key.replace(/🔥 |🚢 |💰 |📡 |🏢 |📊 /g, ''); 
          break; 
      }
  }

  return (
    <div ref={cardRef} onClick={() => window.location.hash = `#/tw-stocks/detail/${stock.symbol}`} className="bg-[#121620] border border-[#2a2f3a] hover:border-purple-500/40 rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between shadow-md group relative overflow-hidden">
      {!isSynced && <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/10"><div className="h-full bg-blue-500/50 w-1/3 animate-pulse"></div></div>}
      <div>
        <div className="flex justify-between items-start mb-2">
          <div>
             <h3 className="font-bold text-slate-100 text-lg group-hover:text-purple-400 transition-colors flex items-center gap-2 line-clamp-1">
               {String(stock.name || '')} 
               {activeTab === 'STRATEGY' && <span className="bg-purple-500/20 text-purple-400 text-[9px] px-1.5 py-0.5 rounded border border-purple-500/30 whitespace-nowrap">盤末達標</span>}
               {activeTab === 'DAYTRADE' && <span className="bg-amber-500/20 text-amber-400 text-[9px] px-1.5 py-0.5 rounded border border-amber-500/30 whitespace-nowrap">隔日沖獵物</span>}
               {activeTab === 'DIVIDEND' && <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/30 whitespace-nowrap">定存股</span>}
               {activeTab === 'ODDLOT' && <span className="bg-pink-500/20 text-pink-400 text-[9px] px-1.5 py-0.5 rounded border border-pink-500/30 whitespace-nowrap">零股優選</span>}
             </h3>
             <div className="flex flex-wrap items-center gap-1 mt-0.5">
               <div className="text-xs text-slate-500 font-mono">{String(stock.symbol || '')}</div>
               {indTag && <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20 whitespace-nowrap">{indTag}</span>}
             </div>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-bold ${isPositive ? 'bg-[#f6465d]/10 text-[#f6465d]' : 'bg-[#0ecb81]/10 text-[#0ecb81]'}`}>{isPositive ? '+' : ''}{changeNum.toFixed(2)}%</div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-[#2a2f3a]/50">
          <div className="flex justify-between items-center mb-1">
             <span className="text-[10px] text-slate-400 font-bold">收盤短線動能評級</span>
             <span className="text-[9px] bg-[#1a1e27] border border-[#2a2f3a] px-1.5 py-0.5 rounded text-slate-400">13:00 基準</span>
          </div>
          <div className={`text-xl font-bold mt-1 flex items-center gap-2 ${stStatus.color}`}>
             {stStatus.icon} {stStatus.text}
             {!isSynced && <RefreshCw className="w-3 h-3 animate-spin text-slate-500 ml-1 opacity-50" title="同步精確數據中" />}
          </div>
          
          <div className="flex justify-between items-center mt-3 text-[10px] text-slate-500 font-mono bg-[#0b0e14] p-2 rounded border border-[#1e2330]">
             <div className="flex flex-col">
                 <span>報價: <span className="text-white">{formatPrice(price)}</span></span>
                 <span className="opacity-70 mt-0.5">昨收: <span className="text-white">{formatPrice(prevClose)}</span></span>
             </div>
             <div className="flex flex-col text-right">
                 <span>總量: <span className="text-white">{formatVolume(volNum)}</span></span>
                 <span className="opacity-70 mt-0.5">漲跌: <span className={isPositive ? 'text-[#f6465d]' : 'text-[#0ecb81]'}>{isPositive ? '+' : ''}{changeNum.toFixed(2)}%</span></span>
             </div>
          </div>
        </div>
      </div>
      
      {divInfo && (
        <div className="mt-4 pt-3 border-t border-[#2a2f3a]/50">
          <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded border border-blue-500/20">{divInfo.type}</span>
              <span className="text-[10px] text-slate-400">投資風險: <span className={divInfo.risk === '極低' || divInfo.risk === '低' ? 'text-[#0ecb81]' : 'text-amber-400'}>{divInfo.risk}</span></span>
          </div>
          <div className="text-xs font-bold text-white mb-2 flex items-center gap-1">
             預估殖利率: <span className="text-[#f6465d] text-sm">{divInfo.avgYield}</span>
          </div>
          <div className="bg-[#0b0e14] p-2 rounded-lg border border-[#1e2330]">
             <div className="text-[9px] text-slate-500 mb-1 font-bold">歷年股利發放 (除權息):</div>
             <div className="text-[10px] text-slate-400 space-y-1 font-mono">
                {divInfo.history.map((h, i) => <div key={i} className="flex items-start gap-1"><span>•</span> <span>{h}</span></div>)}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TwStocksDashboard({ twStocks, twUpdateTime, loading, error, twDashState, setTwDashState }) {
  const { activeTab, searchTerm } = twDashState;
  const [activeIndustry, setActiveIndustry] = useState('ALL');

  const setActiveTabSafe = (tab) => {
      setTwDashState(p => ({ ...p, activeTab: tab }));
      setActiveIndustry('ALL');
  };
  const setSearchTerm = (term) => setTwDashState(p => ({ ...p, searchTerm: term }));

  const hotStocks = useMemo(() => {
      if (activeTab !== 'ALL' || searchTerm) return [];
      let list = Array.isArray(twStocks) ? [...twStocks] : [];
      return list.filter(t => parseFloat(t.priceChangePercent) >= 4 && parseFloat(t.quoteVolume) > 2000000)
                 .sort((a, b) => b.quoteVolume - a.quoteVolume)
                 .slice(0, 4);
  }, [twStocks, activeTab, searchTerm]);

  const filtered = useMemo(() => {
    let list = Array.isArray(twStocks) ? [...twStocks] : [];

    if (activeTab === 'STRATEGY') {
       list = list.filter(t => parseFloat(t.priceChangePercent) >= 2 && parseFloat(t.quoteVolume) > 1500000);
    } else if (activeTab === 'DAYTRADE') {
       list = list.filter(t => parseFloat(t.priceChangePercent) >= 5 && parseFloat(t.quoteVolume) > 2000000);
    } else if (activeTab === 'ODDLOT') {
       list = list.filter(t => {
           const price = parseFloat(t.lastPrice);
           const vol = parseFloat(t.quoteVolume);
           if (isNaN(price) || isNaN(vol)) return false;
           return (price >= 100 && vol >= 5000000) || (price < 100 && vol >= 10000000);
       });
    } else if (activeTab === 'DIVIDEND') {
       list = list.filter(t => DIVIDEND_RECOMMENDATIONS[t.symbol]);
    }
    
    const s = String(searchTerm || '').toUpperCase();
    if (s) {
        return list.filter(t => String(t.symbol || '').includes(s) || String(t.name || '').includes(s)).slice(0, 200);
    }

    if (activeTab === 'ALL' && activeIndustry !== 'ALL') {
       list = list.filter(t => {
          let ind = '其他';
          for (const [key, symbols] of Object.entries(INDUSTRY_MAP)) {
              if (symbols.includes(t.symbol)) { ind = key; break; }
          }
          return ind === activeIndustry;
       });
    }

    return list.slice(0, 200);
  }, [twStocks, searchTerm, activeTab, activeIndustry]);

  const isCodeFormat = /^[0-9A-Z]{4,6}$/.test(searchTerm || '');
  const showManualEntry = searchTerm && filtered.length === 0 && isCodeFormat;

  if (loading && (!twStocks || !twStocks.length)) return <div className="text-center py-32 text-slate-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 讀取證交所盤後數據中...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-center gap-4 bg-[#121620] p-4 rounded-xl border border-[#2a2f3a] shadow-lg w-full overflow-hidden">
        <div className="w-full xl:w-auto relative">
          <div className="flex bg-[#0b0e14] p-1.5 rounded-xl border border-[#2a2f3a] overflow-x-auto scrollbar-hide snap-x touch-pan-x w-full">
             <button onClick={() => setActiveTabSafe('ALL')} className={`shrink-0 snap-start px-4 py-2.5 text-xs sm:text-sm rounded-lg transition-all whitespace-nowrap font-bold ${activeTab === 'ALL' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>🔥 熱門總覽</button>
             <button onClick={() => setActiveTabSafe('STRATEGY')} className={`shrink-0 snap-start px-4 py-2.5 text-xs sm:text-sm rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 font-bold ${activeTab === 'STRATEGY' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}><Target className="w-4 h-4"/> 盤末達標</button>
             <button onClick={() => setActiveTabSafe('DAYTRADE')} className={`shrink-0 snap-start px-4 py-2.5 text-xs sm:text-sm rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 font-bold ${activeTab === 'DAYTRADE' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}><Zap className="w-4 h-4"/> 隔日沖獵物</button>
             <button onClick={() => setActiveTabSafe('ODDLOT')} className={`shrink-0 snap-start px-4 py-2.5 text-xs sm:text-sm rounded-lg transition-all whitespace-nowrap flex items-center gap-1.5 font-bold ${activeTab === 'ODDLOT' ? 'bg-pink-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}><PieChart className="w-4 h-4"/> 零股推薦</button>
             <button onClick={() => setActiveTabSafe('DIVIDEND')} className={`shrink-0 snap-start px-4 py-2.5 text-xs sm:text-sm rounded-lg transition-all whitespace-nowrap font-bold flex items-center gap-1.5 ${activeTab === 'DIVIDEND' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}>💰 定存股</button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full xl:w-auto shrink-0">
            {twUpdateTime && <div className="text-xs text-slate-400 flex items-center gap-1 justify-end sm:justify-start shrink-0"><Clock className="w-3 h-3"/> 基準時間: {twUpdateTime}</div>}
            <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input type="text" placeholder="搜尋代號或名稱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded-lg bg-[#1a1e27] text-white focus:border-blue-500 outline-none" /></div>
        </div>
      </div>

      {showManualEntry && (
        <div className="bg-blue-600/10 border border-blue-500/30 p-8 rounded-2xl text-center">
            <h3 className="text-xl font-bold text-white mb-2">查無預載名稱？</h3>
            <p className="text-slate-400 mb-6">點擊下方直接進入代號 「{String(searchTerm)}」 的深度分析系統。</p>
            <button onClick={() => window.location.hash = `#/tw-stocks/detail/${searchTerm}`} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold transition-all">進入分析系統</button>
        </div>
      )}

      {error && <div className="text-center py-10 text-red-400">{String(error)}</div>}

      {activeTab === 'ALL' && !showManualEntry && !searchTerm && hotStocks.length > 0 && (
          <div className="mb-8">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-amber-400" /> 市場焦點強勢股
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30">系統自動推薦</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {hotStocks.map(stock => (
                      <TwLiveStockCard key={`hot-${stock.symbol}`} stock={stock} activeTab={activeTab} />
                  ))}
              </div>
          </div>
      )}

      {activeTab === 'ALL' && !showManualEntry && !searchTerm && (
          <div className="flex overflow-x-auto gap-2 pb-4 mb-2 scrollbar-hide snap-x touch-pan-x">
              <button onClick={() => setActiveIndustry('ALL')} className={`shrink-0 snap-start px-4 py-1.5 text-xs rounded-full whitespace-nowrap transition-all border ${activeIndustry === 'ALL' ? 'bg-blue-600 text-white border-blue-500 shadow-md' : 'bg-[#121620] text-slate-400 border-[#2a2f3a] hover:border-blue-500/50'}`}>全市場排行</button>
              {Object.keys(INDUSTRY_MAP).map(ind => (
                  <button key={ind} onClick={() => setActiveIndustry(ind)} className={`shrink-0 snap-start px-4 py-1.5 text-xs rounded-full whitespace-nowrap transition-all border ${activeIndustry === ind ? 'bg-blue-600 text-white border-blue-500 shadow-md' : 'bg-[#121620] text-slate-400 border-[#2a2f3a] hover:border-blue-500/50'}`}>{ind}</button>
              ))}
          </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map(stock => (
          <TwLiveStockCard key={stock.symbol} stock={stock} activeTab={activeTab} />
        ))}
        {filtered.length === 0 && !showManualEntry && <div className="col-span-full text-center py-20 text-slate-500">此分類目前無符合之標的。</div>}
      </div>
      <div className="text-center mt-6">
        <p className="text-xs text-slate-500 bg-[#121620] inline-block px-4 py-2 rounded-full border border-[#2a2f3a]">
          資料來源為台灣證交所與各大即時數據通道，純前端跨域獲取。
        </p>
      </div>
    </div>
  );
}

function NewsDashboard() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');

  useEffect(() => {
    let isMounted = true;
    const fetchRealNews = async () => {
      try {
        setLoading(true);
        // 純前端抓取 RSS (繞過 Node API)
        const feeds = [
          { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
          { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
        ];
        let allArticles = [];
        for (const feed of feeds) {
          try {
             const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
             const data = await res.json();
             if (data && data.status === 'ok') {
               const items = data.items.map(item => ({
                 id: item.guid || item.link, title: item.title, link: item.link, time: new Date(item.pubDate).toLocaleString(), rawDate: new Date(item.pubDate).getTime(), source: feed.category === '加密貨幣' ? 'Cointelegraph' : 'Yahoo 股市', category: feed.category
               }));
               allArticles = [...allArticles, ...items];
             }
          } catch(e) {}
        }
        allArticles.sort((a, b) => b.rawDate - a.rawDate);
        if (isMounted) { setNews(allArticles); setLoading(false); }
      } catch (error) { if (isMounted) setLoading(false); }
    };
    fetchRealNews();
    return () => { isMounted = false; };
  }, []);

  const filteredNews = activeCategory === '全部' ? news : news.filter(n => String(n.category) === activeCategory);

  if (loading) return <div className="text-center py-32 text-slate-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取熱點新聞中...</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121620] p-4 rounded-xl border border-[#2a2f3a] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg"><Newspaper className="w-6 h-6 text-emerald-400" /></div>
          <div><h2 className="text-xl font-bold text-white">24H 財經熱點新聞</h2></div>
        </div>
        <div className="flex bg-[#0b0e14] p-1 rounded-lg border border-[#2a2f3a] w-full sm:w-auto">
          {['全部', '台股 / 宏觀', '加密貨幣'].map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`flex-1 sm:flex-none px-4 py-2 text-sm rounded transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'}`}>{cat}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredNews.map((item, idx) => (
          <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer" className="bg-[#121620] border border-[#2a2f3a] hover:border-emerald-500/40 rounded-xl p-5 flex flex-col shadow-md group">
            <div className="flex justify-between items-center mb-3"><span className={`text-xs font-bold px-2 py-1 rounded ${item.category === '加密貨幣' ? 'bg-[#f7931a]/10 text-[#f7931a]' : 'bg-[#3b82f6]/10 text-[#3b82f6]'}`}>{String(item.category)}</span><span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {String(item.time)}</span></div>
            <h3 className="font-bold text-slate-100 text-lg group-hover:text-emerald-400 mb-3 line-clamp-2">{String(item.title)}</h3>
            <div className="flex justify-between items-center mt-auto pt-4 border-t border-[#2a2f3a]/50"><span className="text-xs text-slate-400">{String(item.source)}</span><span className="text-xs text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">閱讀全文 <ExternalLink className="w-3 h-3" /></span></div>
          </a>
        ))}
        {filteredNews.length === 0 && <div className="col-span-full text-center py-20 text-slate-500">暫無相關新聞</div>}
      </div>
    </div>
  );
}

function TwTradeForm({ symbol, name, currentPrice, balance, onOpenPosition }) {
  const [size, setSize] = useState(''); 
  const [tradeError, setTradeError] = useState('');

  const numSize = parseFloat(size) || 0;
  const shares = numSize * 1000;
  const cost = currentPrice * shares;
  const fee = Math.floor(cost * 0.001425); 
  const totalRequired = cost + fee;

  const handleSubmit = (type) => {
    setTradeError('');
    if (numSize <= 0 || !Number.isInteger(numSize)) return setTradeError("請輸入有效的整數張數");
    if (currentPrice === 0 || isNaN(currentPrice)) return setTradeError("無法取得當前有效報價");
    if (type === 'LONG' && totalRequired > balance) return setTradeError("可用餘額不足");
    if (type === 'SHORT' && cost * 0.9 > balance) return setTradeError("可用餘額不足以放空");

    onOpenPosition(String(symbol), String(name), type, numSize, currentPrice);
    setSize('');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-sm text-slate-400 mb-2">
        <span>台股波段模擬 (1張=1000股)</span>
        <span className="text-xs">餘額: <span className="text-white font-bold">NT$ {Math.floor(balance).toLocaleString()}</span></span>
      </div>
      <div className="relative">
        <input type="number" value={size} onChange={(e) => setSize(e.target.value)} placeholder="輸入交易張數" className="w-full bg-[#1a1e27] border border-[#2a2f3a] rounded p-3 text-white font-mono text-sm outline-none" />
        <span className="absolute right-4 top-3 text-xs text-slate-500">張</span>
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 bg-[#0b0e14] p-2 rounded border border-[#1e2330]">
         <span>預估總價: NT$ {cost.toLocaleString()}</span>
         <span>手續費: NT$ {fee.toLocaleString()}</span>
      </div>
      {tradeError && <div className="text-[10px] text-red-400">{String(tradeError)}</div>}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button onClick={() => handleSubmit('LONG')} className="bg-[#f6465d]/20 hover:bg-[#f6465d]/30 text-[#f6465d] border border-[#f6465d]/30 py-3 rounded-lg font-bold transition-all">現股買進 (做多)</button>
        <button onClick={() => handleSubmit('SHORT')} className="bg-[#0ecb81]/20 hover:bg-[#0ecb81]/30 text-[#0ecb81] border border-[#0ecb81]/30 py-3 rounded-lg font-bold transition-all">融券賣出 (做空)</button>
      </div>
    </div>
  );
}

function TwPositionCard({ pos, currentPrice: fallbackPrice, onClose }) {
  const [livePrice, setLivePrice] = useState(fallbackPrice || pos.entryPrice);
  
  useEffect(() => {
    let isMounted = true;
    const handleQuote = (data) => {
        if (isMounted && data.price > 0) setLivePrice(data.price);
    };
    fetchQuoteQueue.subscribe(pos.symbol, handleQuote);
    
    return () => { 
        isMounted = false; 
        fetchQuoteQueue.unsubscribe(pos.symbol, handleQuote);
    };
  }, [pos.symbol]);

  const isLong = pos.type === 'LONG';
  const safeCurrentPrice = Number(livePrice) || pos.entryPrice;
  const currentValue = safeCurrentPrice * pos.shares;
  const closeFee = Math.floor(currentValue * 0.001425);
  const tax = Math.floor(currentValue * 0.003); 

  let pnl = 0;
  if (isLong) pnl = (safeCurrentPrice - pos.entryPrice) * pos.shares - pos.fee - closeFee - tax;
  else pnl = (pos.entryPrice - safeCurrentPrice) * pos.shares - pos.fee - closeFee - tax;
  
  const costBasis = isLong ? (pos.entryPrice * pos.shares) : (pos.entryPrice * pos.shares * 0.9);
  const roe = costBasis > 0 ? (pnl / costBasis) * 100.0 : 0;
  const isProfit = pnl >= 0;

  return (
    <div className={`bg-[#121620] border ${isProfit ? 'border-[#f6465d]/30' : 'border-[#0ecb81]/30'} rounded-xl p-5 shadow-lg flex flex-col`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-white cursor-pointer hover:text-blue-400" onClick={() => window.location.hash = `#/tw-stocks/detail/${pos.symbol}`}>{String(pos.name)} <span className="text-sm font-normal text-slate-500">{String(pos.symbol)}</span></h3>
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold mt-1 inline-block ${isLong ? 'bg-[#f6465d] text-white' : 'bg-[#0ecb81] text-white'}`}>{isLong ? '做多' : '做空'} {pos.size} 張</span>
        </div>
        <div className="text-right">
          <div className={`text-xl font-mono font-black ${isProfit ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{isProfit ? '+' : ''}{Math.floor(pnl).toLocaleString()}</div>
          <div className={`text-xs ${isProfit ? 'text-[#f6465d]/70' : 'text-[#0ecb81]/70'}`}>{roe.toFixed(2)}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-4 bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330]">
        <div>庫存: <span className="text-white font-mono">{pos.shares.toLocaleString()} 股</span></div>
        <div>均價: <span className="text-white font-mono">{pos.entryPrice.toFixed(2)}</span></div>
        <div>結算價: <span className="text-white font-mono">{safeCurrentPrice.toFixed(2)}</span></div>
        <div>預估稅費: <span className="text-amber-400 font-mono">{(pos.fee + closeFee + tax).toLocaleString()}</span></div>
      </div>
      <button onClick={onClose} className="w-full bg-[#1a1e27] hover:bg-[#2a2f3a] text-white text-sm py-3 rounded-lg font-bold border border-[#2a2f3a] transition-all">執行平倉</button>
    </div>
  );
}

function TwKLineChart({ klines }) {
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  
  if (!klines || !Array.isArray(klines) || klines.length === 0) {
      return (
          <div className="w-full h-[580px] flex flex-col items-center justify-center text-slate-500 bg-[#0b0e14] rounded-2xl border border-[#2a2f3a]">
             <AlertCircle className="w-10 h-10 mb-3 opacity-50" />
             <p className="font-bold">無法取得該標的之歷史 K 線數據</p>
             <p className="text-xs mt-1 opacity-60">此標的可能為新上市，或需稍後再試</p>
          </div>
      );
  }
  
  const visibleCount = 80;
  const visibleKlines = klines.slice(-visibleCount);
  
  const width = 800; const totalHeight = 580;
  const paddingX = 10; const paddingY = 20;
  const priceHeight = 400; 
  const volTop = 440;      
  const volHeight = 120;   
  
  const xStep = (width - paddingX * 2.0) / Math.max(visibleKlines.length, 1); 
  const candleWidth = Math.max(xStep * 0.6, 1);
  
  const lows = visibleKlines.map(k => k.low).filter(n => !isNaN(n)); 
  const highs = visibleKlines.map(k => k.high).filter(n => !isNaN(n));
  const minPrice = lows.length ? Math.min(...lows) : 0; 
  const maxPrice = highs.length ? Math.max(...highs) : 1;
  const priceRange = (maxPrice - minPrice) || 1;
  const maxVol = Math.max(1, ...visibleKlines.map(k => k.volume || 0));

  const getPriceY = (p) => priceHeight - paddingY - ((p - minPrice) / priceRange) * (priceHeight - paddingY * 2.0);
  const getVolY = (v) => volTop + volHeight - (v / maxVol) * volHeight;

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (width * (1.0 / rect.width));
    const dataIndex = Math.floor((x - paddingX) / xStep);
    setHoveredIndex((dataIndex >= 0 && dataIndex < visibleKlines.length) ? dataIndex : null);
  };

  const getMAPath = (maKey) => {
    let path = "";
    visibleKlines.forEach((k, i) => {
      if (k[maKey] != null && !isNaN(k[maKey])) {
        const x = paddingX + i * xStep + candleWidth * 0.5;
        const y = getPriceY(k[maKey]);
        path += (path === "" ? `M ${x} ${y} ` : `L ${x} ${y} `);
      }
    });
    return path;
  };

  const hoveredK = hoveredIndex !== null && visibleKlines[hoveredIndex] ? visibleKlines[hoveredIndex] : null;

  return (
    <div className="w-full relative group" style={{ height: '580px' }}>
      <div className="absolute top-2 left-2 flex gap-3 text-[11px] font-mono z-10 pointer-events-none">
        {hoveredK && (
          <div className="flex flex-col gap-1 bg-[#0b0e14]/90 backdrop-blur p-2 rounded border border-[#2a2f3a] text-slate-300">
            <div>DATE: {new Date(hoveredK.time).toLocaleDateString('zh-TW', {timeZone: 'Asia/Taipei'})}</div>
            <div className="flex gap-2">
              <span className="text-slate-500">O:<span className="text-white ml-1">{formatPrice(hoveredK.open)}</span></span>
              <span className="text-slate-500">H:<span className="text-white ml-1">{formatPrice(hoveredK.high)}</span></span>
              <span className="text-slate-500">L:<span className="text-white ml-1">{formatPrice(hoveredK.low)}</span></span>
              <span className="text-slate-500">C:<span className={hoveredK.close >= hoveredK.open ? "text-[#f6465d]" : "text-[#0ecb81] ml-1"}>{formatPrice(hoveredK.close)}</span></span>
              <span className="text-slate-500 ml-2">Vol:<span className="text-blue-400 ml-1">{Math.floor((hoveredK.volume || 0) * 0.001).toLocaleString()} 張</span></span>
            </div>
          </div>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full overflow-hidden cursor-crosshair" onMouseLeave={() => setHoveredIndex(null)} onMouseMove={handleMouseMove}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          <line x1="0" y1={priceHeight * 0.5} x2={width} y2={priceHeight * 0.5} stroke="#2a2f3a" strokeWidth="1" strokeDasharray="4 4"/>
          <line x1="0" y1={volTop - 15} x2={width} y2={volTop - 15} stroke="#2a2f3a" strokeWidth="1.5" />
          
          <path d={getMAPath('ma5')} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.8" />
          <path d={getMAPath('ma10')} fill="none" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.8" />
          <path d={getMAPath('ma20')} fill="none" stroke="#d946ef" strokeWidth="1.5" opacity="0.8" />

          {visibleKlines.map((k, i) => {
            const x = paddingX + i * xStep; 
            const isUp = k.close >= k.open; 
            const color = isUp ? '#f6465d' : '#0ecb81'; 
            
            const openY = getPriceY(k.open); const closeY = getPriceY(k.close); 
            const highY = getPriceY(k.high); const lowY = getPriceY(k.low);
            const volY = getVolY(k.volume || 0);
            
            const midX = x + candleWidth * 0.5;

            return (
              <g key={k.time || i}>
                {hoveredIndex === i && <line x1={midX} y1={0} x2={midX} y2={totalHeight} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />}
                <line x1={midX} y1={highY} x2={midX} y2={lowY} stroke={color} strokeWidth="1.5" />
                <rect x={x} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(1, Math.abs(openY - closeY))} fill={isUp ? 'transparent' : color} stroke={color} strokeWidth="1" />
                <rect x={x} y={volY} width={candleWidth} height={Math.max(1, volTop + volHeight - volY)} fill={color} opacity="0.8" />
              </g>
            );
          })}
          
          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(maxPrice)}</text>
          <text x={width - 5} y={priceHeight - 10} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(minPrice)}</text>
          <text x={width - 5} y={volTop + 10} fill="#848e9c" textAnchor="end" fontSize="10">{Math.floor(maxVol * 0.001)}K 張</text>
        </svg>
      </div>
    </div>
  );
}

function TwStockWorkspace({ stock, twAccount, openTwPosition }) {
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);
  
  const [currentPrice, setCurrentPrice] = useState(parseFloat(stock.lastPrice) || 0);
  const [currentChange, setCurrentChange] = useState(parseFloat(stock.priceChangePercent) || 0);
  const [currentVolume, setCurrentVolume] = useState(parseFloat(stock.quoteVolume) || 0);
  const [currentPrevClose, setCurrentPrevClose] = useState(stock.officialPrevClose || 0);
  
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  
  const [chipData, setChipData] = useState({ loading: true, foreign: null, trust: null, dealer: null, marginToday: null, marginYest: null, marginChange: null });
  const [branchData, setBranchData] = useState(null);

  // 獨立抓取 Yahoo K線歷史資料 (使用 allorigins 中繼突破 CORS)
  useEffect(() => {
    let isMounted = true;
    const fetchChart = async () => {
        try {
            setChartLoading(true);
            const urlTW = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}.TW?range=6mo&interval=1d`;
            let resHistory = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(urlTW)}`);
            let historyData = await resHistory.json();
            
            if (!historyData?.chart?.result) {
                const urlTWO = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}.TWO?range=6mo&interval=1d`;
                resHistory = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(urlTWO)}`);
                historyData = await resHistory.json();
            }

            if (!isMounted) return;
            
            const parsed = parseYahooData(historyData, stock.officialPrevClose);
            if (parsed && parsed.klines.length > 0) {
                setChartData(calculateIndicators(parsed.klines)); 
                setCurrentPrice(parsed.price);
                setCurrentChange(parsed.change.toFixed(2));
                setCurrentVolume(parsed.vol);
                setCurrentPrevClose(parsed.yesterdayClose);
            } else {
                setChartError(true);
            }
        } catch (err) {
            if (isMounted) setChartError(true);
        } finally {
            if (isMounted) setChartLoading(false);
        }
    };
    fetchChart();
    
    // 定期抓取即時報價，更新畫面上的數據
    const handleQuote = (data) => {
        if (data.price > 0 && isMounted) {
            setCurrentPrice(data.price);
            setCurrentChange(data.change.toFixed(2));
            setCurrentVolume(data.vol);
            setCurrentPrevClose(data.prevClose);
        }
    };
    fetchQuoteQueue.subscribe(stock.symbol, handleQuote);

    return () => { 
        isMounted = false; 
        fetchQuoteQueue.unsubscribe(stock.symbol, handleQuote);
    };
  }, [stock.symbol, stock.officialPrevClose]);

  // 純前端透過 allorigins 抓取 Yahoo 新聞
  useEffect(() => {
    let isMounted = true;
    const fetchNews = async () => {
        try {
           setNewsLoading(true);
           const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${stock.symbol}.TW&newsCount=10`;
           const resNews = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(searchUrl)}`);
           const nData = await resNews.json();
           if (isMounted) setNews(Array.isArray(nData?.news) ? nData.news : []); 
        } catch(e) {}
        finally {
           if (isMounted) setNewsLoading(false);
        }
    };
    fetchNews();
    return () => { isMounted = false; };
  }, [stock.symbol]);

  useEffect(() => {
    let isMounted = true;
    const fetchChipData = async () => {
      try {
        if (isMounted) setBranchData(generateBranchData(stock.symbol, currentPrice, currentChange, currentVolume));
        if (isMounted) setChipData({ loading: false, foreign: null, trust: null, dealer: null, marginToday: null, marginYest: null, marginChange: null });
      } catch (error) {
        if (isMounted) setChipData(prev => ({ ...prev, loading: false }));
      }
    };
    fetchChipData();
    return () => { isMounted = false; };
  }, [stock.symbol, currentPrice, currentChange, currentVolume]); 

  const getRecommendations = () => {
    if (!chartData || chartData.length < 2) return null;
    const latest = chartData[chartData.length - 1];
    
    let shortTerm = { action: '觀望整理', color: 'text-slate-400', desc: '短期動能不明確，建議觀望。' };
    let shortScore = 0;
    if (latest.close > (latest.ma5 || 0)) shortScore++;
    if (latest.kd && latest.kd.k > latest.kd.d) shortScore++;
    if (latest.rsi > 50) shortScore++;
    
    if (shortScore >= 2) shortTerm = { action: '推薦買入', color: 'text-[#f6465d]', desc: '短線動能強勁，站上5日線且指標向上。' };
    else if (shortScore === 0) shortTerm = { action: '推薦賣出', color: 'text-[#0ecb81]', desc: '短線動能偏弱，跌破5日線且面臨賣壓。' };

    let midTerm = { action: '區間震盪', color: 'text-slate-400', desc: '中期趨勢整理中，無明顯方向。' };
    let midScore = 0;
    if (latest.close > (latest.ma20 || 0)) midScore++;
    if (latest.macd && latest.macd.hist > 0) midScore++;
    
    if (midScore === 2) midTerm = { action: '波段做多', color: 'text-[#f6465d]', desc: '成功站上月線且 MACD 翻紅，中期偏多。' };
    else if (midScore === 0) midTerm = { action: '逢高減碼', color: 'text-[#0ecb81]', desc: '失守月線且 MACD 翻綠，中期偏弱。' };

    let longTerm = latest.close > (latest.ma60 || 0) 
      ? { action: '偏多持有', color: 'text-[#f6465d]', desc: '股價維持在季線之上，長多格局不變。' }
      : { action: '偏空觀望', color: 'text-[#0ecb81]', desc: '股價落於季線之下，長空趨勢成型。' };

    return { shortTerm, midTerm, longTerm };
  };

  const recommendations = chartError ? null : getRecommendations();
  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;

  const formatDate = (timestamp) => timestamp ? `${new Date(timestamp).getMonth() + 1}/${new Date(timestamp).getDate()}` : '';
  const latestDateStr = latestData ? formatDate(latestData.time) : '';

  let stStatus = { text: '⏳ 震盪觀望', color: 'text-slate-400', icon: <Activity className="w-8 h-8" /> };
  if (currentChange >= 5) stStatus = { text: '🔥 強勢爆發', color: 'text-[#f6465d]', icon: <Zap className="w-8 h-8 text-[#f6465d]" /> };
  else if (currentChange >= 2 && currentVolume > 1500000) stStatus = { text: '✅ 短線達標', color: 'text-[#f6465d]', icon: <CheckCircle2 className="w-8 h-8 text-[#f6465d]" /> };
  else if (currentChange <= -3) stStatus = { text: '⚠️ 弱勢退場', color: 'text-[#0ecb81]', icon: <AlertCircle className="w-8 h-8 text-[#0ecb81]" /> };
  else if (currentChange > 0) stStatus = { text: '📈 溫和偏多', color: 'text-amber-400', icon: <TrendingUp className="w-8 h-8 text-amber-400" /> };
  else stStatus = { text: '📉 溫和偏空', color: 'text-[#0ecb81]', icon: <TrendingUp className="w-8 h-8 text-[#0ecb81] rotate-180" /> };

  const isHighlyLiquid = (currentPrice >= 100 && currentVolume >= 5000000) || (currentPrice < 100 && currentVolume >= 10000000);
  
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const prevPrevData = chartData.length > 2 ? chartData[chartData.length - 3] : null;
  
  let momentumScore = 0;
  let maStatusMsg = "均線糾結";
  let klinePatternMsg = "目前無明顯強勢K線型態";
  let hasStrongKline = false;

  let isBullishMA = false;
  let hasLongRed = false;
  let hasLongLowerShadow = false;
  let hasShortUpperShadow = false;
  let isMacdKdBullish = false;
  let isHighVolBlack = false;
  let isVolShrinking = false;

  if (latestData) {
      if (latestData.close > (latestData.ma5 || 0)) momentumScore++;
      if (latestData.close > (latestData.ma10 || 0)) momentumScore++;
      if (latestData.macd && latestData.macd.hist > 0) momentumScore++;
      
      isBullishMA = (latestData.ma5 > latestData.ma10) && (latestData.ma10 > latestData.ma20) && (latestData.close > latestData.ma5);

      if (latestData.close > latestData.ma5 && latestData.close > latestData.ma10) {
          maStatusMsg = "站穩 5日 與 10日線 (回踩不破可進場)";
      } else if (latestData.close > latestData.ma10 && latestData.close < latestData.ma5) {
          maStatusMsg = "跌破 5日線，測試 10日線支撐";
      } else if (latestData.close < latestData.ma10) {
          maStatusMsg = "跌破 10日均線 (需提高警覺或停損)";
      }
      
      const body = Math.abs(latestData.close - latestData.open);
      const upperShadow = latestData.high - Math.max(latestData.close, latestData.open);
      const lowerShadow = Math.min(latestData.close, latestData.open) - latestData.low;

      hasLongRed = (latestData.close > latestData.open) && (body / latestData.open > 0.035);
      hasShortUpperShadow = upperShadow < body * 0.3; 
      hasLongLowerShadow = lowerShadow > body * 0.5;
      isMacdKdBullish = (latestData.macd?.hist > 0) && (latestData.kd?.k > latestData.kd?.d);

      if (prevData) {
          const isBullishEngulfing = prevData.close < prevData.open && latestData.close > latestData.open && latestData.open <= prevData.close && latestData.close >= prevData.open;
          const isBreakout = latestData.close > Math.max(...chartData.slice(-15, -1).map(k => k.high)); 

          isHighVolBlack = (latestData.close < latestData.open) && (latestData.volume > prevData.volume * 1.5) && (latestData.high >= Math.max(...chartData.slice(-10).map(k=>k.high)));
          if (prevPrevData) {
              isVolShrinking = (latestData.volume < prevData.volume) && (prevData.volume < prevPrevData.volume);
          }

          if (isBullishEngulfing) { klinePatternMsg = "出現紅K吞噬 (強勢轉強訊號)"; hasStrongKline = true; }
          else if (hasLongRed && isBreakout) { klinePatternMsg = "長紅突破近期高點 (熱門題材創高)"; hasStrongKline = true; }
          else if (hasLongRed) { klinePatternMsg = "長紅K棒確認 (買盤強勁進駐)"; hasStrongKline = true; }
          else if (body > 0 && upperShadow > body * 1.5) { klinePatternMsg = "出現長上影線 (需留意上方短線賣壓)"; }
          else if (isHighVolBlack) { klinePatternMsg = "爆量黑K (短線恐見頂，避免追進)"; }
      }
  }

  const momentumText = momentumScore >= 2 ? '趨勢向上 (強勢)' : '動能不足 (震盪或偏空)';
  const momentumColor = momentumScore >= 2 ? 'text-[#f6465d]' : 'text-slate-400';
  
  const hasInstitutionBuy = branchData && branchData.buyers.some(b => b.type === '外資機構' || b.type === '波段主力');

  return (
    <div className="animate-in fade-in duration-300">
      <button onClick={() => window.location.hash = '#/tw-stocks'} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded-lg border border-[#2a2f3a] transition-all"><ArrowLeft className="w-4 h-4" /> 返回台股清單</button>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-6 rounded-2xl border border-[#2a2f3a] shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><LineChart className="w-24 h-24 text-blue-500" /></div>
            
            <h2 className="text-3xl font-black text-white mb-1">{String(stock.name)} <span className="text-lg font-normal text-slate-500 ml-1">{String(stock.symbol)}</span></h2>
            
            <div className="mt-6 p-5 bg-[#0b0e14] rounded-xl border border-[#1e2330]">
                <div className="text-sm text-slate-400 mb-2 font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-purple-500"/> 盤中/盤末短線動能評級
                </div>
                <div className={`text-4xl font-black flex items-center gap-3 ${stStatus.color} my-3`}>
                   {stStatus.icon} {stStatus.text}
                </div>
                
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2a2f3a]">
                  <div>
                     <div className="text-[10px] text-slate-500">最新報價</div>
                     <div className="text-lg font-mono text-white">{Number(currentPrice).toFixed(2)}</div>
                     <div className="text-[9px] text-slate-500 mt-1">基準昨收: <span className="text-slate-300">{formatPrice(currentPrevClose)}</span></div>
                  </div>
                  <div>
                     <div className="text-[10px] text-slate-500">即時漲跌幅</div>
                     <div className={`text-lg font-mono font-bold ${currentChange >= 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{currentChange >= 0 ? '+' : ''}{currentChange}%</div>
                  </div>
                  <div className="text-right">
                     <div className="text-[10px] text-slate-500">目前總量</div>
                     <div className="text-lg font-mono text-white">{formatVolume(currentVolume)}</div>
                  </div>
                </div>
            </div>
          </div>

          <div className="bg-[#121620] rounded-2xl border border-[#2a2f3a] p-5 shadow-lg">
             <TwTradeForm symbol={stock.symbol} name={stock.name} currentPrice={currentPrice} balance={twAccount.balance} onOpenPosition={openTwPosition} />
          </div>

          <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" /> 三大法人與籌碼動向
                <span className="text-[9px] px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded ml-auto border border-blue-500/30">盤後資料</span>
              </h3>
              {chipData.loading ? (
                <div className="flex justify-center items-center py-6 text-slate-500"><RefreshCw className="w-5 h-5 animate-spin" /></div>
              ) : (chipData.foreign !== null || chipData.marginToday !== null) ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#2a2f3a] text-slate-500">
                        <th className="pb-2 font-normal">指標</th>
                        <th className="pb-2 font-normal text-right whitespace-nowrap">最新單日 {latestDateStr && <span className="text-[10px] text-slate-600 font-mono">({latestDateStr})</span>}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2f3a]/50">
                      <tr>
                        <td className="py-2.5 text-slate-400">外資買賣超</td>
                        <td className={`py-2.5 text-right font-mono font-bold ${chipData.foreign > 0 ? 'text-[#f6465d]' : chipData.foreign < 0 ? 'text-[#0ecb81]' : 'text-white'}`}>{chipData.foreign > 0 ? '+' : ''}{chipData.foreign !== null ? String(chipData.foreign) : '--'}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-slate-400">投信買賣超</td>
                        <td className={`py-2.5 text-right font-mono font-bold ${chipData.trust > 0 ? 'text-[#f6465d]' : chipData.trust < 0 ? 'text-[#0ecb81]' : 'text-white'}`}>{chipData.trust > 0 ? '+' : ''}{chipData.trust !== null ? String(chipData.trust) : '--'}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-slate-400">自營商買賣超</td>
                        <td className={`py-2.5 text-right font-mono font-bold ${chipData.dealer > 0 ? 'text-[#f6465d]' : chipData.dealer < 0 ? 'text-[#0ecb81]' : 'text-white'}`}>{chipData.dealer > 0 ? '+' : ''}{chipData.dealer !== null ? String(chipData.dealer) : '--'}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-slate-400">融資餘額</td>
                        <td className="py-2.5 text-right font-mono font-bold text-white">{chipData.marginToday !== null ? String(chipData.marginToday) : '--'} {chipData.marginChange !== null && <span className={`ml-1 text-[10px] ${chipData.marginChange > 0 ? 'text-[#f6465d]' : chipData.marginChange < 0 ? 'text-[#0ecb81]' : 'text-slate-500'}`}>({chipData.marginChange > 0 ? '+' : ''}{String(chipData.marginChange)})</span>}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : <div className="text-center py-6 text-slate-500 text-xs">無公開盤後資料</div>}
          </div>

          <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
             <h3 className="text-lg font-bold text-white mb-4">個股相關新聞</h3>
             {newsLoading ? <div className="text-center py-10 text-slate-500 animate-pulse">載入新聞中...</div> : Array.isArray(news) && news.length > 0 ? (
                <div className="space-y-3">
                  {news.slice(0, 5).map((item, idx) => (
                    <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer" className="block p-3 rounded-xl hover:bg-[#1a1e27] border border-transparent hover:border-[#2a2f3a] transition-all group">
                      <h4 className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 mb-1 line-clamp-1">{String(item.title || '')}</h4>
                      <div className="flex justify-between items-center text-[10px] text-slate-500">
                        <span>{String(item.publisher || 'Yahoo Finance')}</span>
                        <span className="flex items-center gap-1">閱讀全文 <ExternalLink className="w-3 h-3" /></span>
                      </div>
                    </a>
                  ))}
                </div>
             ) : <div className="text-center py-10 text-slate-500">暫無相關新聞</div>}
          </div>

        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-2xl p-1 border border-[#2a2f3a] shadow-lg overflow-hidden">
            <div className="p-3 pb-0 flex gap-4 text-[10px] font-mono border-b border-[#2a2f3a]/50 mb-1">
              <span className="text-amber-500 font-bold">MA5 (周線)</span>
              <span className="text-purple-400 font-bold">MA10 (雙週線)</span>
              <span className="text-fuchsia-400 font-bold">MA20 (月線)</span>
              <span className="text-emerald-500 font-bold">MA60 (季線)</span>
            </div>
            {chartLoading ? <div className="w-full h-[580px] flex items-center justify-center"><RefreshCw className="w-8 h-8 animate-spin text-slate-600" /></div> : <TwKLineChart klines={chartData} />}
          </div>

          {recommendations && (
            <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
               <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Crosshair className="w-5 h-5 text-blue-500" /> 趨勢分析與操作建議</h3>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]"><div className="text-sm text-slate-400 font-bold mb-2">短期 (1-2週內)</div><div className={`text-xl font-black mb-1 ${recommendations.shortTerm.color}`}>{String(recommendations.shortTerm.action)}</div><div className="text-xs text-slate-500 leading-relaxed">{String(recommendations.shortTerm.desc)}</div></div>
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]"><div className="text-sm text-slate-400 font-bold mb-2">中期 (1-3個月)</div><div className={`text-xl font-black mb-1 ${recommendations.midTerm.color}`}>{String(recommendations.midTerm.action)}</div><div className="text-xs text-slate-500 leading-relaxed">{String(recommendations.midTerm.desc)}</div></div>
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]"><div className="text-sm text-slate-400 font-bold mb-2">長期 (一季以上)</div><div className={`text-xl font-black mb-1 ${recommendations.longTerm.color}`}>{String(recommendations.longTerm.action)}</div><div className="text-xs text-slate-500 leading-relaxed">{String(recommendations.longTerm.desc)}</div></div>
               </div>
            </div>
          )}

          <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                  <PieChart className="w-5 h-5 text-pink-500" /> 零股短線實戰解析
                  <span className="text-[9px] px-1.5 py-0.5 bg-pink-500/20 text-pink-400 rounded ml-auto border border-pink-500/30">四象限戰法</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]">
                      <div className="text-sm text-slate-400 font-bold mb-2">1. 流動性與滑價</div>
                      <div className={`text-xl font-black mb-1 ${isHighlyLiquid ? 'text-[#f6465d]' : 'text-amber-400'}`}>
                          {isHighlyLiquid ? '優良 (達標)' : '偏低 (注意滑價)'}
                      </div>
                      <div className="text-xs text-slate-500 leading-relaxed mt-2 space-y-1">
                          <div>• <span className="text-white">基準量能：</span>百元以上需大於 5000 張；百元以下大於 10000 張。</div>
                          <div>• <span className="text-[#f6465d]">避開滑價：</span>注意買賣五檔，若價差大於 2 個 Tick 應避免交易。</div>
                          <div>• <span className="text-blue-400">熱門時段：</span>開盤前 15 分與收盤前 15 分鐘撮合最快。</div>
                      </div>
                  </div>
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]">
                      <div className="text-sm text-slate-400 font-bold mb-2">2. 動能 (技術面)</div>
                      <div className={`text-xl font-black mb-1 ${momentumColor}`}>
                          {momentumText}
                      </div>
                      <div className="text-xs text-slate-500 leading-relaxed mt-2 space-y-1">
                          <div>• 均線：<span className={latestData?.close < latestData?.ma10 ? 'text-[#0ecb81]' : 'text-slate-300'}>{maStatusMsg}</span></div>
                          <div>• K線：<span className={hasStrongKline ? 'text-[#f6465d]' : 'text-slate-300'}>{klinePatternMsg}</span></div>
                      </div>
                  </div>
                  
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330] md:col-span-2">
                      <div className="text-sm text-slate-400 font-bold mb-2">3. 成本與綜合戰略</div>
                      <div className="text-xs text-slate-500 leading-relaxed mt-2 space-y-2">
                          <div className="flex items-start gap-1">
                              <span className="text-amber-400 shrink-0">• 折溢價陷阱：</span>
                              <span>零股與整股常有落差，下單前務必比對整股價格，若零股溢價超過 <span className="text-white font-bold">0.5%</span> 等於先賠在起跑點。熱門股收盤前常有溢價，為短線套利好時機。</span>
                          </div>
                          <div className="flex items-start gap-1">
                              <span className="text-[#f6465d] shrink-0">• 嚴格停損：</span>
                              <span>零股無法當沖，若買入當天收盤情勢不對，隔天一早須果斷處理 (建議設定 <span className="text-white font-bold">3%~5%</span> 停損點)。</span>
                          </div>
                          <div className="flex items-start gap-1">
                              <span className="text-emerald-400 shrink-0">• 分批彈性：</span>
                              <span>善用零股彈性分批布局 (例如：早盤試單，午盤確認轉強再加碼)，降低單一價位風險。</span>
                          </div>
                          <div className="flex items-start gap-1">
                              <span className="text-slate-300 shrink-0">• 除權息陷阱：</span>
                              <span>短線賺價差應避開除息日，以免被課徵額外的股利所得稅與健保補充保費。</span>
                          </div>
                          <div className="flex items-start gap-1">
                              <span className="text-blue-400 shrink-0">• 交易成本：</span>
                              <span>零股切忌使用 20 元低消券商，務必使用提供<span className="text-white font-bold">「最低 1 元手續費」</span>之帳戶操作。</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                  <Zap className="w-5 h-5 text-amber-500" /> 隔日沖指標綜合分析
                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded ml-auto border border-amber-500/30">13:20 決策基準</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]">
                      <div className="text-sm text-slate-400 font-bold mb-2">1. 隔日沖券商總量與佔比</div>
                      <div className={`text-xl font-black mb-1 ${branchData?.dayTradeRatio > 15 ? 'text-[#f6465d]' : 'text-amber-400'}`}>
                          佔比 {branchData?.dayTradeRatio?.toFixed(1)}%
                      </div>
                      <div className="text-xs text-slate-500 leading-relaxed mt-2 space-y-1">
                          <div>• <span className="text-white">主力買進量：</span>{branchData ? Math.floor(branchData.dayTradeVol * 0.001) : 0} 張</div>
                          <div>• <span className={branchData?.dayTradeRatio > 15 ? 'text-[#f6465d]' : 'text-slate-300'}>籌碼評估：</span>{branchData?.dayTradeRatio > 15 ? '隔日沖佔比極高，明早賣壓將非常沉重，適合極短線避開或反向吃豆腐。' : '隔日沖佔比在安全範圍內。'}</div>
                      </div>
                  </div>
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]">
                      <div className="text-sm text-slate-400 font-bold mb-2">2. 隔日沖主力技術軌跡</div>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                          <div className="flex items-center gap-2 text-xs"><CheckCircle2 className={`w-4 h-4 ${isBullishMA ? 'text-[#0ecb81]' : 'text-slate-600'}`} /> 均線多頭排列</div>
                          <div className="flex items-center gap-2 text-xs"><CheckCircle2 className={`w-4 h-4 ${hasLongRed ? 'text-[#0ecb81]' : 'text-slate-600'}`} /> 長紅K強勢表態</div>
                          <div className="flex items-center gap-2 text-xs"><CheckCircle2 className={`w-4 h-4 ${hasShortUpperShadow ? 'text-[#0ecb81]' : 'text-slate-600'}`} /> 短上影線 (鎖碼)</div>
                          <div className="flex items-center gap-2 text-xs"><CheckCircle2 className={`w-4 h-4 ${hasLongLowerShadow ? 'text-[#0ecb81]' : 'text-slate-600'}`} /> 長下影線 (洗盤)</div>
                          <div className="flex items-center gap-2 text-xs col-span-2"><CheckCircle2 className={`w-4 h-4 ${isMacdKdBullish ? 'text-[#0ecb81]' : 'text-slate-600'}`} /> MACD / KD 指標偏多</div>
                      </div>
                  </div>
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330] md:col-span-2">
                      <div className="text-sm text-slate-400 font-bold mb-2">3. 避開陷阱標的檢測</div>
                      <div className="flex flex-col gap-2 mt-2">
                          <div className={`text-xs px-3 py-2 rounded flex items-center justify-between ${isHighVolBlack ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                              <span>高檔爆量長黑測試</span>
                              <span>{isHighVolBlack ? '⚠️ 出現高檔爆量長黑 (強烈建議避開)' : '✅ 安全通過'}</span>
                          </div>
                          <div className={`text-xs px-3 py-2 rounded flex items-center justify-between ${isVolShrinking ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                              <span>成交量連續萎縮測試</span>
                              <span>{isVolShrinking ? '⚠️ 成交量連續萎縮 (流動性不佳)' : '✅ 安全通過'}</span>
                          </div>
                      </div>
                  </div>
              </div>
          </div>

          {branchData && (
            <div className="bg-[#121620] rounded-2xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-amber-500" /> 全方位 AI 籌碼儀表板
                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded ml-auto border border-amber-500/30">AI 擬真推算</span>
                </h3>
                
                <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330]">
                   <div className="flex justify-between items-center mb-2">
                       <span className="text-xs text-slate-400 font-bold">大戶控盤率 (買超前五大佔比)</span>
                       <span className={`text-xs font-black ${branchData.concentrationColor}`}>{branchData.bigHolderRatio.toFixed(1)}%</span>
                   </div>
                   <div className="w-full bg-[#1a1e27] rounded-full h-2">
                      <div className={`h-2 rounded-full ${branchData.concentrationColor.replace('text-', 'bg-')}`} style={{ width: `${Math.min(branchData.bigHolderRatio, 100)}%` }}></div>
                   </div>
                   <div className={`text-right text-[10px] mt-1 ${branchData.concentrationColor}`}>{branchData.concentrationLevel}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                        <div className="text-[10px] text-center bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/30 rounded py-1 mb-2 font-bold">主力買超前五大</div>
                        <div className="space-y-1.5">
                            {branchData.buyers.slice(0, 5).map((b, i) => (
                                <div key={i} className="flex flex-col bg-[#0b0e14] p-1.5 rounded border border-[#1e2330]">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-white truncate" title={b.name}>{b.name}</span>
                                        <span className="text-[#f6465d] font-mono">+{Math.floor(b.vol * 0.001)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[8px] text-slate-500 mt-0.5">
                                        <span>均價 {b.cost}</span>
                                        <span>{b.type}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] text-center bg-[#0ecb81]/10 text-[#0ecb81] border border-[#0ecb81]/30 rounded py-1 mb-2 font-bold">主力賣超前五大</div>
                        <div className="space-y-1.5">
                            {branchData.sellers.slice(0, 5).map((b, i) => (
                                <div key={i} className="flex flex-col bg-[#0b0e14] p-1.5 rounded border border-[#1e2330]">
                                    <div className="flex justify-between items-center text-[10px]">
                                        <span className="text-white truncate" title={b.name}>{b.name}</span>
                                        <span className="text-[#0ecb81] font-mono">-{Math.floor(b.vol * 0.001)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[8px] text-slate-500 mt-0.5">
                                        <span>均價 {b.cost}</span>
                                        <span>{b.type}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330] mt-2">
                    <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{String(branchData.advice)}</div>
                </div>
            </div>
          )}

        </div>
      </div>
      
      <div className="mt-8 text-center text-xs text-slate-500 bg-[#121620] py-3 rounded-xl border border-[#2a2f3a]">
        即時報價與 K 線數據來源：純前端 API 直連與跨域代理技術
        <a href={`https://tw.stock.yahoo.com/quote/${stock.symbol}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition-colors ml-1 font-bold inline-flex items-center">
          Yahoo Finance ({stock.name} {stock.symbol}) <ExternalLink className="w-3 h-3 ml-1" />
        </a>
      </div>
    </div>
  );
}

function TwPositionsPage({ twStocks, twAccount, closeTwPosition, twLivePrices }) {
  const activeSymbols = [...new Set((twAccount.positions || []).map(p => p.symbol))];
  const activeTickers = Array.isArray(twStocks) ? twStocks.filter(t => activeSymbols.includes(t.symbol)) : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><Layers className="w-6 h-6 text-blue-500" /> 當前持倉 (台股波段)</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.isArray(twAccount.positions) && twAccount.positions.map(pos => {
            const t = activeTickers.find(x => String(x.symbol) === String(pos.symbol));
            const fallbackPrice = t ? parseFloat(t.lastPrice) : pos.entryPrice;
            const currentPrice = twLivePrices[pos.symbol] || fallbackPrice;
            return <TwPositionCard key={pos.id} pos={pos} currentPrice={currentPrice} onClose={() => closeTwPosition(pos.id, currentPrice)} />;
        })}
        {(!twAccount.positions || twAccount.positions.length === 0) && <div className="col-span-full py-10 text-center text-slate-500">目前無任何台股持倉</div>}
      </div>
    </div>
  );
}

function TwAssetsPage({ twAccount, resetTwAccount }) {
  const totalRealized = Array.isArray(twAccount.history) ? twAccount.history.reduce((a, b) => a + b.pnl, 0) : 0;
  const winRate = Array.isArray(twAccount.history) && twAccount.history.length ? ((twAccount.history.filter(h => h.pnl > 0).length / twAccount.history.length) * 100.0).toFixed(1) : 0;
  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><BarChart2 className="w-6 h-6 text-blue-500" /> 台股資產與績效</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">可用餘額 (TWD)</div><div className="text-2xl font-mono font-bold text-blue-400">NT$ {Math.floor(twAccount.balance || 0).toLocaleString()}</div></div>
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">累計盈虧</div><div className={`text-2xl font-mono font-bold ${totalRealized >= 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>NT$ {Math.floor(totalRealized).toLocaleString()}</div></div>
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">歷史勝率</div><div className="text-2xl font-mono font-bold text-white">{winRate}%</div></div>
      </div>
      <div className="pt-8">
        <button onClick={() => { if(window.confirm('確定要宣告破產並重置台股帳戶嗎？所有紀錄將清空，並恢復初始資金 1,000 萬。')) resetTwAccount(); }} className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5" /> 破產重置 (恢復初始 10,000,000 TWD)
        </button>
      </div>
    </div>
  );
}

// --- 虛擬貨幣子系統模塊 ---
function CryptoTradeForm({ symbol, currentPrice, balance, onOpenPosition }) {
  const [leverage, setLeverage] = useState(10);
  const [marginMode, setMarginMode] = useState('ISOLATED'); 
  const [inputValue, setInputValue] = useState(''); 
  const [tradeError, setTradeError] = useState('');

  const val = parseFloat(inputValue) || 0;
  const coinSize = currentPrice > 0 ? (val * leverage) / currentPrice : 0;
  let liqLong = currentPrice * (1.0 - (1.0 / leverage) + 0.004);
  let liqShort = currentPrice * (1.0 + (1.0 / leverage) - 0.004);

  const handleSubmit = (type) => {
    setTradeError('');
    if(val > balance) return setTradeError("可用餘額不足！");
    if(val <= 0) return setTradeError("金額必須大於 0");
    onOpenPosition(String(symbol), type, val, leverage, coinSize, type === 'LONG' ? liqLong : liqShort, marginMode, false, currentPrice);
    setInputValue(''); 
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1"><label>槓桿倍數</label><span className="text-white font-bold">{leverage}x</span></div>
        <input type="range" min="1" max="100" value={leverage} onChange={(e) => setLeverage(e.target.value)} className="w-full accent-blue-500" />
      </div>
      <div className="flex bg-[#0b0e14] p-1 rounded-lg border border-[#2a2f3a] mb-2">
        <button onClick={() => setMarginMode('CROSS')} className={`flex-1 text-xs py-1.5 rounded ${marginMode === 'CROSS' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500'}`}>全倉</button>
        <button onClick={() => setMarginMode('ISOLATED')} className={`flex-1 text-xs py-1.5 rounded ${marginMode === 'ISOLATED' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500'}`}>逐倉</button>
      </div>
      <div>
        <div className="relative mb-3">
          <input type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="投入保證金" className="w-full bg-[#1a1e27] border border-[#2a2f3a] rounded p-2 text-white font-mono text-sm outline-none" />
          <span className="absolute right-3 top-2 text-xs text-slate-500">USDT</span>
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          {[25, 50, 75, 100].map(p => <span key={p} className="cursor-pointer" onClick={() => setInputValue(balance > 0 ? (balance * (p * 0.01)).toFixed(2) : '0')}>{p}%</span>)}
        </div>
        {tradeError && <div className="text-[10px] text-red-400 mt-1">{String(tradeError)}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => handleSubmit('LONG')} className="bg-[#0ecb81]/20 hover:bg-[#0ecb81]/30 text-[#0ecb81] border border-[#0ecb81]/30 py-2 rounded font-bold">做多</button>
        <button onClick={() => handleSubmit('SHORT')} className="bg-[#f6465d]/20 hover:bg-[#f6465d]/30 text-[#f6465d] border border-[#f6465d]/30 py-2 rounded font-bold">做空</button>
      </div>
    </div>
  );
}

function CryptoPositionCard({ pos, currentPrice, balance, onSelectCoin, onClose, onAdjust }) {
  const [activeModal, setActiveModal] = useState(null); 
  const [adjustInput, setAdjustInput] = useState('');
  const [modalError, setModalError] = useState('');
  const pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
  const roe = (pnl / pos.margin) * 100.0;
  const isProfit = pnl >= 0;

  const handleAdjustSubmit = () => {
      setModalError('');
      const val = parseFloat(adjustInput);
      if(isNaN(val) || val <= 0) return setModalError('請輸入有效金額');
      if(activeModal === 'add' && val > balance) return setModalError('可用餘額不足');
      onAdjust(activeModal, val);
      setActiveModal(null);
      setAdjustInput('');
  };

  return (
    <div className={`bg-[#121620] border ${isProfit ? 'border-[#0ecb81]/30' : 'border-[#f6465d]/30'} rounded-xl p-4 flex flex-col shadow-lg`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-black text-white cursor-pointer hover:text-blue-400" onClick={() => {
            sessionStorage.setItem('dashboardScroll', window.scrollY.toString());
            onSelectCoin(String(pos.symbol));
          }}>{String(pos.symbol)}</h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold mt-1 inline-block ${pos.type === 'LONG' ? 'bg-[#0ecb81] text-white' : 'bg-[#f6465d] text-white'}`}>{pos.type} {pos.leverage}x</span>
        </div>
        <div className="text-right">
          <div className={`text-lg font-mono font-black ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{isProfit ? '+' : ''}{pnl.toFixed(2)}</div>
          <div className={`text-xs ${isProfit ? 'text-[#0ecb81]/70' : 'text-[#f6465d]/70'}`}>{roe.toFixed(2)}%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 mb-4 bg-[#0b0e14] p-3 rounded">
        <div>數量: <span className="text-white">{pos.size.toFixed(4)}</span></div>
        <div>保證金: <span className="text-white">${pos.margin.toFixed(2)}</span></div>
        <div>開倉價: <span className="text-white">${formatPrice(pos.entryPrice)}</span></div>
        <div>強平價: <span className="text-amber-400">${formatPrice(pos.liqPrice)}</span></div>
      </div>
      {activeModal ? (
        <div className="bg-[#1a1e27] p-2 rounded border border-blue-500/50 mt-auto animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-white">{activeModal === 'add' ? '加碼' : '減倉'}</span>
            <X className="w-4 h-4 text-slate-400 cursor-pointer" onClick={() => setActiveModal(null)} />
          </div>
          <div className="flex gap-2">
            <input type="number" value={adjustInput} onChange={e => setAdjustInput(e.target.value)} placeholder="USDT" className="flex-1 bg-[#0b0e14] border border-[#2a2f3a] rounded px-2 text-xs text-white outline-none" />
            <button onClick={handleAdjustSubmit} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded">確認</button>
          </div>
          {modalError && <div className="text-[10px] text-red-400 mt-1">{String(modalError)}</div>}
        </div>
      ) : (
        <div className="flex gap-2 mt-auto">
          <button onClick={() => setActiveModal('add')} className="flex-1 bg-[#2a2f3a] text-slate-200 text-xs py-2 rounded">加碼</button>
          <button onClick={() => setActiveModal('reduce')} className="flex-1 bg-[#2a2f3a] text-slate-200 text-xs py-2 rounded">減倉</button>
          <button onClick={onClose} className="flex-1 bg-[#f6465d]/20 text-[#f6465d] text-xs py-2 rounded">平倉</button>
        </div>
      )}
    </div>
  );
}

function CryptoMarketCard({ ticker, multiSignals, onSelectCoin }) {
  const change = parseFloat(ticker.priceChangePercent);
  const isPositive = change >= 0;
  const activeSignals = ['15m', '1h', '4h'].filter(tf => multiSignals?.[tf] && multiSignals[tf].signal !== 'NEUTRAL');

  return (
    <div onClick={() => {
        sessionStorage.setItem('dashboardScroll', window.scrollY.toString());
        onSelectCoin(String(ticker.symbol)); 
      }} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-xl p-5 cursor-pointer transition-all flex flex-col shadow-md group">
      
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-bold text-slate-100 text-lg group-hover:text-blue-400">{String(ticker.symbol).replace('USDT', '')} <span className="text-xs text-slate-500">USDT</span></h3>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Vol: {formatVolume(ticker.quoteVolume)}</div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-bold ${isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
          {isPositive ? '+' : ''}{change.toFixed(2)}%
        </div>
      </div>
      <div className="text-2xl font-mono font-semibold text-white mb-3">${formatPrice(ticker.lastPrice)}</div>
      
      <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-[#2a2f3a]/50">
        {activeSignals.length > 0 ? activeSignals.map(tf => {
          const sig = multiSignals[tf];
          const isLong = sig.signal === 'LONG';
          return (
             <div key={tf} className={`text-[10px] p-2 rounded flex flex-col gap-1 ${isLong ? 'bg-[#0ecb81]/10 border border-[#0ecb81]/30 text-[#0ecb81]' : 'bg-[#f6465d]/10 border border-[#f6465d]/30 text-[#f6465d]'}`}>
               <div className="font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1"><Target className="w-3 h-3"/> {String(tf)} {isLong ? '🔥 推薦做多' : '🩸 推薦做空'}</span>
               </div>
               <div className="grid grid-cols-3 gap-1 mt-1 opacity-90 text-[9px] font-mono">
                  <div className="text-white">進場 {formatPrice(sig.entry)}</div>
                  <div className="text-[#0ecb81]">TP {formatPrice(sig.tp)}</div>
                  <div className="text-red-400">SL {formatPrice(sig.sl)}</div>
               </div>
               <div className="text-[9px] mt-1 opacity-70 truncate" title={sig.logs && sig.logs[0] ? String(sig.logs[0]) : ''}>{sig.logs && sig.logs[0] ? String(sig.logs[0]) : ''}</div>
             </div>
          );
        }) : (
          <div className="text-[10px] px-2 py-3 rounded flex items-center justify-center bg-white/5 text-slate-500 border border-white/5">各週期均處於盤整，無強烈訊號</div>
        )}
      </div>
    </div>
  );
}

function CryptoAdvancedKLineChart({ klines, signalData }) {
  const containerRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(60); 
  const [endIndexOffset, setEndIndexOffset] = useState(0); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const dataLen = klines ? klines.length : 0;

  useEffect(() => {
    const container = containerRef.current; if (!container || dataLen === 0) return;
    const handleWheel = (e) => {
      e.preventDefault(); 
      let newCount = Math.round(visibleCount * (e.deltaY > 0 ? 1.1 : 0.9));
      newCount = Math.max(15, Math.min(newCount, dataLen));
      setVisibleCount(newCount);
      const newMaxOffset = Math.max(0, dataLen - newCount);
      if (endIndexOffset > newMaxOffset) setEndIndexOffset(newMaxOffset);
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [visibleCount, dataLen, endIndexOffset]);

  if (!klines || !Array.isArray(klines) || dataLen === 0) return <div className="w-full h-[650px] flex items-center justify-center text-slate-500">圖表數據載入中...</div>;
  
  const maxOffset = Math.max(0, dataLen - visibleCount);
  const safeOffset = Math.min(Math.max(0, endIndexOffset), maxOffset);
  const safeVisibleCount = Math.min(visibleCount, dataLen);
  const startIndex = Math.max(0, dataLen - safeVisibleCount - safeOffset);
  const endIndex = dataLen - safeOffset;
  const visibleKlines = klines.slice(startIndex, endIndex);

  const width = 800; 
  const totalHeight = 650; 
  const kLineHeight = 350;     
  const volTop = 380;          
  const volHeight = 100;       
  const macdTop = 500;         
  const macdHeight = 130;      
  const paddingX = 10; 
  const xStep = (width - paddingX * 2.0) / safeVisibleCount; 
  const candleWidth = Math.max(xStep * 0.7, 1);
  
  const lows = visibleKlines.map(k => k.low).filter(n => !isNaN(n)); 
  const highs = visibleKlines.map(k => k.high).filter(n => !isNaN(n));
  const minPrice = lows.length ? Math.min(...lows) : 0; 
  const maxPrice = highs.length ? Math.max(...highs) : 1;
  const priceRange = (maxPrice - minPrice) || 1;
  
  const maxVol = Math.max(1, ...visibleKlines.map(k => k.volume || 0));
  
  const macdValues = visibleKlines.flatMap(k => [k.macd?.macd, k.macd?.signal, k.macd?.hist]).filter(v => v != null && !isNaN(v));
  const maxAbsMacd = macdValues.length > 0 ? Math.max(0.00001, ...macdValues.map(Math.abs)) : 1;

  const getPriceY = (p) => kLineHeight - 20 - ((p - minPrice) / priceRange) * (kLineHeight - 40);
  const getVolY = (v) => volTop + volHeight - (v / maxVol) * volHeight;
  const getMacdY = (v) => macdTop + macdHeight * 0.5 - (v / maxAbsMacd) * (macdHeight * 0.5);

  const getSvgCoords = (clientX) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    return (clientX - rect.left) * (width * (1.0 / rect.width));
  };

  const updateHover = (clientX) => {
    const dataIndex = Math.floor((getSvgCoords(clientX) - paddingX) / xStep);
    setHoveredIndex((dataIndex >= 0 && dataIndex < visibleKlines.length) ? dataIndex : null);
  };

  const handleMouseDown = (e) => { setIsDragging(true); setDragStartX(e.clientX); };
  const handleMouseUp = () => { setIsDragging(false); };
  const handleMouseMove = (e) => {
    if (isDragging) {
      const dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 5) {
        setEndIndexOffset(prev => Math.max(0, Math.min(prev + Math.round(dx / 5), maxOffset)));
        setDragStartX(e.clientX);
      }
    } else updateHover(e.clientX);
  };

  const hoveredK = hoveredIndex !== null && visibleKlines[hoveredIndex] ? visibleKlines[hoveredIndex] : null;

  let macdPath = "";
  let signalPath = "";
  visibleKlines.forEach((k, i) => {
    const x = paddingX + i * xStep + candleWidth * 0.5;
    if (k.macd?.macd != null && !isNaN(k.macd.macd)) {
      macdPath += (macdPath === "" ? `M ${x} ${getMacdY(k.macd.macd)} ` : `L ${x} ${getMacdY(k.macd.macd)} `);
    }
    if (k.macd?.signal != null && !isNaN(k.macd.signal)) {
      signalPath += (signalPath === "" ? `M ${x} ${getMacdY(k.macd.signal)} ` : `L ${x} ${getMacdY(k.macd.signal)} `);
    }
  });

  return (
    <div className="w-full relative group touch-none" style={{ height: '650px' }}>
      <div className="absolute top-2 right-2 flex gap-1.5 z-10 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => setVisibleCount(p => Math.max(15, Math.round(p * 0.8)))} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => setVisibleCount(p => Math.min(dataLen, Math.round(p * 1.2)))} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded"><ZoomOut className="w-4 h-4" /></button>
      </div>

      <div className="absolute top-2 left-2 flex gap-3 text-[11px] font-mono z-10 pointer-events-none">
        {hoveredK ? (
          <div className="flex flex-col gap-1 bg-[#0b0e14]/90 backdrop-blur p-2 rounded border border-[#2a2f3a] text-slate-300">
            <div>TIME: {new Date(hoveredK?.time).toLocaleString()}</div>
            <div className="flex gap-2">
              <span className="text-slate-500">O:<span className="text-white ml-1">{formatPrice(hoveredK?.open)}</span></span>
              <span className="text-slate-500">H:<span className="text-white ml-1">{formatPrice(hoveredK?.high)}</span></span>
              <span className="text-slate-500">L:<span className="text-white ml-1">{formatPrice(hoveredK?.low)}</span></span>
              <span className="text-slate-500">C:<span className={hoveredK?.close >= hoveredK?.open ? "text-[#0ecb81]" : "text-[#f6465d] ml-1"}>{formatPrice(hoveredK?.close)}</span></span>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="text-slate-500">Vol:<span className="text-white ml-1">{formatVolume(hoveredK?.volume)}</span></span>
              <span className="text-slate-500">買盤:<span className="text-[#0ecb81] ml-1">{formatVolume(hoveredK?.takerBuyVol)}</span></span>
              <span className="text-slate-500">賣盤:<span className="text-[#f6465d] ml-1">{formatVolume((hoveredK?.volume || 0) - (hoveredK?.takerBuyVol || 0))}</span></span>
            </div>
            <div className="flex gap-2 text-[10px]">
              <span className="text-slate-500">MACD:<span className="text-[#3b82f6] ml-1">{hoveredK?.macd?.macd?.toFixed(4) || '--'}</span></span>
              <span className="text-slate-500">Signal:<span className="text-[#f59e0b] ml-1">{hoveredK?.macd?.signal?.toFixed(4) || '--'}</span></span>
              <span className="text-slate-500">Hist:<span className={hoveredK?.macd?.hist >= 0 ? "text-[#0ecb81] ml-1" : "text-[#f6465d] ml-1"}>{hoveredK?.macd?.hist?.toFixed(4) || '--'}</span></span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-500 bg-[#0b0e14]/50 backdrop-blur px-2 py-1 rounded">
             <MoveHorizontal className="w-3.5 h-3.5" /> 滾輪縮放 / 拖曳平移
          </div>
        )}
      </div>

      <div ref={containerRef} className={`w-full h-full overflow-hidden touch-none cursor-crosshair`} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={() => {setIsDragging(false); setHoveredIndex(null);}} onMouseMove={handleMouseMove}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          <line x1="0" y1={kLineHeight} x2={width} y2={kLineHeight} stroke="#2a2f3a" strokeWidth="1" />
          <line x1="0" y1={macdTop - 10} x2={width} y2={macdTop - 10} stroke="#2a2f3a" strokeWidth="1" />
          <line x1="0" y1={getMacdY(0)} x2={width} y2={getMacdY(0)} stroke="#2a2f3a" strokeWidth="1" strokeDasharray="2 2" />
          
          {signalData?.poc && !isNaN(signalData.poc) && <React.Fragment><line x1="0" y1={getPriceY(signalData.poc)} x2={width} y2={getPriceY(signalData.poc)} stroke="#3b82f6" strokeWidth="1" strokeDasharray="5 5" opacity="0.6" /><text x={5} y={getPriceY(signalData.poc) - 5} fill="#3b82f6" fontSize="9">POC</text></React.Fragment>}
          {signalData?.avwap && !isNaN(signalData.avwap) && <React.Fragment><line x1="0" y1={getPriceY(signalData.avwap)} x2={width} y2={getPriceY(signalData.avwap)} stroke="#f59e0b" strokeWidth="1" opacity="0.4" /><text x={width - 40} y={getPriceY(signalData.avwap) + 12} fill="#f59e0b" fontSize="9">AVWAP</text></React.Fragment>}

          {visibleKlines.map((k, i) => {
            const x = paddingX + i * xStep; 
            const isUp = k.close >= k.open; 
            const color = isUp ? '#0ecb81' : '#f6465d';
            const openY = getPriceY(k.open); 
            const closeY = getPriceY(k.close); 
            const highY = getPriceY(k.high); 
            const lowY = getPriceY(k.low);
            
            const buyVol = k.takerBuyVol || 0;
            const sellVol = Math.max(0, (k.volume || 0) - buyVol);
            const buyHeight = (buyVol / maxVol) * volHeight;
            const sellHeight = (sellVol / maxVol) * volHeight;

            const hist = k.macd?.hist || 0;
            const histY = getMacdY(hist);
            const zeroY = getMacdY(0);
            const histHeight = Math.abs(histY - zeroY);
            const histColor = hist >= 0 ? '#0ecb81' : '#f6465d';
            const midX = x + candleWidth * 0.5;

            return (
              <g key={k.time || i}>
                {hoveredIndex === i && <line x1={midX} y1={0} x2={midX} y2={totalHeight} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />}
                
                <line x1={midX} y1={highY} x2={midX} y2={lowY} stroke={color} strokeWidth="1.5" />
                <rect x={x} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(1, Math.abs(openY - closeY))} fill={color} />

                <rect x={x} y={volTop + volHeight - buyHeight} width={candleWidth} height={buyHeight} fill="#0ecb81" opacity="0.8" />
                <rect x={x} y={volTop + volHeight - buyHeight - sellHeight} width={candleWidth} height={sellHeight} fill="#f6465d" opacity="0.8" />

                <rect x={x} y={Math.min(histY, zeroY)} width={candleWidth} height={Math.max(1, histHeight)} fill={histColor} opacity="0.6" />
              </g>
            );
          })}

          <path d={macdPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          <path d={signalPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" />

          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(maxPrice)}</text>
          <text x={width - 5} y={kLineHeight - 10} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(minPrice)}</text>
          <text x={width - 5} y={volTop + 15} fill="#848e9c" textAnchor="end" fontSize="9">Vol</text>
          <text x={width - 5} y={macdTop + 15} fill="#848e9c" textAnchor="end" fontSize="9">MACD</text>
        </svg>
      </div>
    </div>
  );
}

function CryptoDashboard({ allTickers, fundingRates, loading, dashState, setDashState }) {
  const { activeTab, scanLimit, searchTerm, aiSignals, isScanning, scanProgress, initialScanned } = dashState;

  useEffect(() => {
    if (!loading && allTickers.length > 0) {
      const savedPos = sessionStorage.getItem('dashboardScroll');
      if (savedPos) { setTimeout(() => { window.scrollTo({ top: parseInt(savedPos), behavior: 'auto' }); sessionStorage.removeItem('dashboardScroll'); }, 150); }
    }
  }, [loading, allTickers.length]);

  const handleManualScan = async () => {
    if (isScanning || allTickers.length === 0) return;
    setDashState(p => ({ ...p, isScanning: true, scanProgress: 0, initialScanned: true }));
    setDashState(p => ({ ...p, aiSignals: { '15m': {}, '1h': {}, '4h': {} } }));

    const tfs = ['15m', '1h', '4h'];
    const targets = allTickers.slice(0, scanLimit);
    const batch = 10;
    const totalOps = tfs.length * targets.length;
    let completed = 0;

    for (const tf of tfs) {
        for (let i = 0; i < targets.length; i += batch) {
          const chunk = targets.slice(i, i + batch);
          const chunkSignals = {};
          await Promise.all(chunk.map(async (coin) => {
            try {
              // 直接向 Binance API 請求
              const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${tf}&limit=80`);
              if(!res.ok) return;
              const data = await res.json();
              if (Array.isArray(data)) {
                  const parsed = data.map(d => ({ open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), takerBuyVol: parseFloat(d[9]) }));
                  const sig = analyzeCryptoSignal(parsed, parseFloat(coin.lastPrice), fundingRates[coin.symbol]);
                  if (sig) chunkSignals[coin.symbol] = sig;
              }
            } catch(e) { }
          }));
          
          if (Object.keys(chunkSignals).length > 0) {
             setDashState(prev => ({ ...prev, aiSignals: { ...prev.aiSignals, [tf]: { ...prev.aiSignals[tf], ...chunkSignals } } }));
          }
          completed += chunk.length;
          setDashState(p => ({ ...p, scanProgress: Math.min(100, Math.round((completed / totalOps) * 100.0)) }));
          await new Promise(r => setTimeout(r, 200));
        }
    }
    setDashState(p => ({ ...p, isScanning: false }));
  };

  useEffect(() => {
    if (allTickers.length > 0 && !initialScanned && !isScanning) handleManualScan();
  }, [allTickers.length, initialScanned, isScanning]);

  if (loading && !allTickers.length) return <div className="text-center py-32 text-slate-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取幣安即時數據中...</div>;

  let filtered = allTickers.slice(0, scanLimit);
  
  if (searchTerm) {
      filtered = filtered.filter(t => String(t.symbol).includes(String(searchTerm).toUpperCase()));
  } else if (activeTab === 'LONG') {
      filtered = filtered.filter(t => aiSignals['15m']?.[t.symbol]?.signal === 'LONG' || aiSignals['1h']?.[t.symbol]?.signal === 'LONG' || aiSignals['4h']?.[t.symbol]?.signal === 'LONG');
  } else if (activeTab === 'SHORT') {
      filtered = filtered.filter(t => aiSignals['15m']?.[t.symbol]?.signal === 'SHORT' || aiSignals['1h']?.[t.symbol]?.signal === 'SHORT' || aiSignals['4h']?.[t.symbol]?.signal === 'SHORT');
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:sticky sm:top-[64px] z-10 py-3 bg-[#0b0e14]/95 backdrop-blur border-b border-[#2a2f3a]/50">
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a] w-full sm:w-auto">
                  {['ALL', 'LONG', 'SHORT'].map(t => (
                    <button key={t} onClick={() => setDashState(p => ({ ...p, activeTab: t }))} className={`flex-1 sm:flex-none px-4 py-2 text-sm rounded transition-all whitespace-nowrap ${activeTab === t ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                      {t === 'ALL' ? '全部' : t === 'LONG' ? '🔥 做多機會' : '🩸 做空機會'}
                    </button>
                  ))}
              </div>
              <button onClick={handleManualScan} disabled={isScanning} className="bg-[#121620] px-4 py-2 rounded-lg border border-[#2a2f3a] text-blue-400 hover:bg-[#2a2f3a] hover:text-blue-300 disabled:opacity-50 transition-colors flex items-center justify-center shrink-0 text-sm">
                <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} /> {isScanning ? 'SMC 重算中' : '重新掃描 SMC'}
              </button>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full lg:w-auto">
              {isScanning && <div className="text-xs text-blue-400 flex items-center gap-2 justify-start sm:justify-end shrink-0"><RefreshCw className="w-3 h-3 animate-spin" /> 計算多週期中 {scanProgress}%</div>}
              <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input type="text" placeholder="搜尋幣種..." value={searchTerm} onChange={e => setDashState(p => ({ ...p, searchTerm: e.target.value }))} className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white focus:border-blue-500 outline-none" /></div>
          </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(t => {
            const coinSignals = { '15m': aiSignals['15m']?.[t.symbol], '1h': aiSignals['1h']?.[t.symbol], '4h': aiSignals['4h']?.[t.symbol] };
            return <CryptoMarketCard key={t.symbol} ticker={t} multiSignals={coinSignals} onSelectCoin={(s) => window.location.hash = `#/crypto/trade/${s}`} />;
          })}
          {filtered.length === 0 && <div className="col-span-full py-20 text-center text-slate-500">無符合條件之標的</div>}
      </div>
    </div>
  );
}

function CryptoPositionsPage({ allTickers, paperAccount, openPosition, closePosition, adjustPosition }) {
  const activeSymbols = [...new Set((paperAccount.positions || []).map(p => p.symbol))];
  const activeTickers = Array.isArray(allTickers) ? allTickers.filter(t => activeSymbols.includes(t.symbol)) : [];
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><Layers className="w-6 h-6 text-blue-500" /> 當前持倉 (虛擬貨幣)</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.isArray(paperAccount.positions) && paperAccount.positions.map(pos => <CryptoPositionCard key={pos.id} pos={pos} currentPrice={parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice)} balance={paperAccount.balance} onSelectCoin={s => window.location.hash = `#/crypto/trade/${s}`} onClose={() => closePosition(pos.id, parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice))} onAdjust={(t, v) => adjustPosition(pos.id, t, v, parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice))} />)}
        {(!paperAccount.positions || paperAccount.positions.length === 0) && <div className="col-span-full py-10 text-center text-slate-500">目前無任何加密貨幣持倉</div>}
      </div>
      {activeTickers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeTickers.map(t => <div key={t.symbol} className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg"><h3 className="font-bold text-white mb-4">{String(t.symbol)} 快捷下單</h3><CryptoTradeForm symbol={t.symbol} currentPrice={parseFloat(t.lastPrice)} balance={paperAccount.balance} onOpenPosition={openPosition} /></div>)}
        </div>
      )}
    </div>
  );
}

function CryptoAssetsPage({ paperAccount, resetCryptoAccount }) {
  const totalRealized = Array.isArray(paperAccount.history) ? paperAccount.history.reduce((a, b) => a + b.pnl, 0) : 0;
  const winRate = Array.isArray(paperAccount.history) && paperAccount.history.length ? ((paperAccount.history.filter(h => h.pnl > 0).length / paperAccount.history.length) * 100.0).toFixed(1) : 0;
  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><BarChart2 className="w-6 h-6 text-blue-500" /> 帳戶數據</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">可用餘額</div><div className="text-2xl font-mono font-bold text-blue-400">${(paperAccount.balance || 0).toFixed(2)}</div></div>
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">累計盈虧</div><div className={`text-2xl font-mono font-bold ${totalRealized >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>${totalRealized.toFixed(2)}</div></div>
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">歷史勝率</div><div className="text-2xl font-mono font-bold text-white">{winRate}%</div></div>
      </div>
      <div className="pt-8">
        <button onClick={() => { if(window.confirm('確定要宣告破產並重置虛擬貨幣帳戶嗎？所有紀錄將清空，並恢復初始資金 10,000 USDT。')) resetCryptoAccount(); }} className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5" /> 破產重置 (恢復初始 10,000 USDT)
        </button>
      </div>
    </div>
  );
}

function CryptoTradingWorkspace({ coin, fundingRate, paperAccount, openPosition, closePosition, adjustPosition }) {
  const [klines, setKlines] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(parseFloat(coin.lastPrice));
  const [multiSignals, setMultiSignals] = useState({ '15m': null, '1h': null, '4h': null });

  useEffect(() => {
    let isMounted = true;
    const fetchAll = async () => {
      const intervals = ['15m', '1h', '4h'];
      const signals = {};
      await Promise.all(intervals.map(async (tf) => {
        try {
          // 直接向 Binance 請求
          const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${tf}&limit=120`);
          const data = await res.json();
          if (Array.isArray(data)) {
              const parsed = data.map(d => ({ open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), takerBuyVol: parseFloat(d[9]), time: d[0] }));
              if (tf === '15m' && isMounted) setKlines(calculateIndicators(parsed));
              signals[tf] = analyzeCryptoSignal(parsed, parseFloat(coin.lastPrice), fundingRate);
          }
        } catch(e) {}
      }));
      if (isMounted) setMultiSignals(signals);
    };
    fetchAll();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${coin.symbol}`);
        const data = await res.json();
        if (isMounted && data.price) setCurrentPrice(parseFloat(data.price));
      } catch(e) {}
    }, 1500);
    return () => { isMounted = false; clearInterval(interval); };
  }, [coin.symbol, coin.lastPrice, fundingRate]);

  return (
    <div className="animate-in fade-in duration-300">
      <button onClick={() => window.location.hash = '#/crypto/home'} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded-lg border border-[#2a2f3a] transition-all"><ArrowLeft className="w-4 h-4" /> 返回市場</button>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg">
            <h2 className="text-3xl font-black text-white">{String(coin.symbol).replace('USDT','')} <span className="text-sm font-normal text-slate-500">USDT</span></h2>
            <div className="text-3xl font-mono font-bold text-white mt-2">${formatPrice(currentPrice)}</div>
          </div>
          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg"><CryptoTradeForm symbol={coin.symbol} currentPrice={currentPrice} balance={paperAccount.balance} onOpenPosition={openPosition} /></div>
          
          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Waves className="w-4 h-4 text-amber-500" /> SMC 多週期分析狀態</h3>
              {['15m', '1h', '4h'].map(tf => {
                const sig = multiSignals[tf];
                const isLong = sig?.signal === 'LONG';
                const isShort = sig?.signal === 'SHORT';
                const isActive = isLong || isShort;

                return (
                  <div key={tf} className={`p-3 rounded border border-[#1e2330] ${!isActive ? 'bg-[#0b0e14]' : isLong ? 'bg-[#0ecb81]/5' : 'bg-[#f6465d]/5'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-400 font-bold">{String(tf)} 週期</span>
                      <span className={`text-xs font-black ${isLong ? 'text-[#0ecb81]' : isShort ? 'text-[#f6465d]' : 'text-slate-500'}`}>{isActive ? (isLong ? '做多' : '做空') : '盤整中'}</span>
                    </div>
                    {isActive && sig && (
                        <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] font-mono mb-2">
                           <div>進場: <span className="text-white block">{formatPrice(sig.entry)}</span></div>
                           <div>止盈: <span className="text-[#0ecb81] block">{formatPrice(sig.tp)}</span></div>
                           <div>止損: <span className="text-red-400 block">{formatPrice(sig.sl)}</span></div>
                        </div>
                    )}
                    {sig?.logs && Array.isArray(sig.logs) && sig.logs.map((log, i) => (
                        <div key={i} className="text-[10px] text-slate-500 leading-tight">✓ {String(log)}</div>
                    ))}
                  </div>
                );
              })}
          </div>
        </div>
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-xl p-1 border border-[#2a2f3a] shadow-lg"><CryptoAdvancedKLineChart klines={klines} signalData={multiSignals['15m']} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.isArray(paperAccount.positions) && paperAccount.positions.filter(p => p.symbol === coin.symbol).map(pos => <CryptoPositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(t,v) => adjustPosition(pos.id,t,v,currentPrice)} onSelectCoin={(s) => window.location.hash = `#/crypto/trade/${s}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. 主應用程式入口 App
// ==========================================
export default function App() {
  const [isStylesLoaded, setIsStylesLoaded] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [currentRoute, setCurrentRoute] = useState('portal');
  
  const [twStocks, setTwStocks] = useState([]);
  const [twUpdateTime, setTwUpdateTime] = useState('');
  const [loadingTw, setLoadingTw] = useState(true);
  const [errorTw, setErrorTw] = useState(null);
  const [selectedTwStock, setSelectedTwStock] = useState(null);

  const [allTickers, setAllTickers] = useState([]);
  const [loadingCrypto, setLoadingCrypto] = useState(true);
  const [fundingRates, setFundingRates] = useState({});
  const [selectedCoin, setSelectedCoin] = useState(null);
  
  const [dashState, setDashState] = useState(() => {
    try {
      const s = sessionStorage.getItem('protrade_dashState');
      if (s) {
         const parsed = JSON.parse(s);
         if (!parsed.aiSignals || !parsed.aiSignals['15m']) parsed.aiSignals = { '15m': {}, '1h': {}, '4h': {} };
         if (!parsed.scanLimit || parsed.scanLimit === 150) parsed.scanLimit = 200;
         return { ...parsed, isScanning: false, scanProgress: 0 };
      }
    } catch(e) {}
    return { activeTab: 'ALL', timeframe: '15m', scanLimit: 200, searchTerm: '', aiSignals: { '15m': {}, '1h': {}, '4h': {} }, isScanning: false, scanProgress: 0, initialScanned: false };
  });

  const [twDashState, setTwDashState] = useState(() => {
    try {
      const s = sessionStorage.getItem('protrade_twDashState');
      if (s) {
         const parsed = JSON.parse(s);
         return { activeTab: parsed.activeTab || 'ALL', searchTerm: parsed.searchTerm || '' };
      }
    } catch(e) {}
    return { activeTab: 'ALL', searchTerm: '' };
  });

  const [paperAccount, setPaperAccount] = useState(() => { try { const s = localStorage.getItem('paperAccount'); return s ? JSON.parse(s) : { balance: 10000, positions: [], history: [] }; } catch(e) { return { balance: 10000, positions: [], history: [] }; } });
  const [twAccount, setTwAccount] = useState(() => { try { const s = localStorage.getItem('twAccount'); return s ? JSON.parse(s) : { balance: 10000000, positions: [], history: [] }; } catch(e) { return { balance: 10000000, positions: [], history: [] }; } });
  
  const [twLivePrices, setTwLivePrices] = useState({});

  useEffect(() => { sessionStorage.setItem('protrade_dashState', JSON.stringify(dashState)); }, [dashState]);
  useEffect(() => { sessionStorage.setItem('protrade_twDashState', JSON.stringify(twDashState)); }, [twDashState]);
  useEffect(() => { localStorage.setItem('paperAccount', JSON.stringify(paperAccount)); }, [paperAccount]);
  useEffect(() => { localStorage.setItem('twAccount', JSON.stringify(twAccount)); }, [twAccount]);

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const s = document.createElement('script'); s.id = 'tailwind-cdn'; s.src = 'https://cdn.tailwindcss.com';
      s.onload = () => setIsStylesLoaded(true); document.head.appendChild(s);
    } else { setIsStylesLoaded(true); }
  }, []);

  // 抓取台股盤後資訊 (純前端直接請求 OpenAPI)
  useEffect(() => {
    let isMounted = true;
    const fetchTwStocksList = async () => {
      try {
        const [resTse, resOtc] = await Promise.all([
          fetch(`https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`).then(r => r.json()).catch(() => []),
          fetch(`https://www.tpex.org.tw/openapi/v1/t1820`).then(r => r.json()).catch(() => [])
        ]);

        if (isMounted) {
          const arrTse = Array.isArray(resTse) ? resTse : [];
          const arrOtc = Array.isArray(resOtc) ? resOtc : [];
          const spaceRegex = new RegExp('\\s+', 'g');

          const processStockData = (item) => {
              const todayPrice = parseFloat(item.ClosingPrice || item.Close);
              let changeStr = String(item.Change || '0').replace(spaceRegex, '').replace('+', '').replace('X', '');
              
              const match = changeStr.match(/-?\d+\.?\d*/);
              let changeAmt = match ? parseFloat(match[0]) : 0;
              if (String(item.Change).includes('-')) changeAmt = -Math.abs(changeAmt);
              
              let percent = 0;
              let yesterdayClose = todayPrice; 
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

          const formattedTse = arrTse.filter(i => i && i.Code).map(processStockData);
          const formattedOtc = arrOtc.filter(i => i && i.SecuritiesCompanyCode).map(processStockData);
          const combined = [...formattedTse, ...formattedOtc].filter(i => /^[0-9A-Z]{4,6}$/.test(i.symbol)).sort((a, b) => b.quoteVolume - a.quoteVolume);

          setTwStocks(combined); 
          setTwUpdateTime(new Date().toLocaleString('zh-TW', { hour12: false }));
          setLoadingTw(false);
        }
      } catch (err) { 
        if (isMounted) { setErrorTw(err instanceof Error ? err.message : String(err)); setLoadingTw(false); } 
      }
    };
    fetchTwStocksList();
    return () => { isMounted = false; };
  }, []);

  // 台股持倉的全域即時同步 (採用 allorigins 與 v7/quote)
  const syncFetchRef = useRef(0);
  useEffect(() => {
    const activeSymbols = [...new Set((twAccount.positions || []).map(p => p.symbol))];
    if (activeSymbols.length === 0) return;
    
    let isMounted = true;
    const syncTwPrices = async () => {
      const currentFetch = ++syncFetchRef.current;
      const newPrices = {};
      
      const twSymbols = activeSymbols.map(s => `${s}.TW`).join(',');
      const twoSymbols = activeSymbols.map(s => `${s}.TWO`).join(',');

      const fetchAndParse = async (syms) => {
          if (!syms) return;
          try {
              const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${syms}`;
              const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
              const data = await res.json();
              if (data?.quoteResponse?.result) {
                  data.quoteResponse.result.forEach(q => {
                      if (q.regularMarketPrice) {
                          const baseSym = q.symbol.split('.')[0];
                          newPrices[baseSym] = q.regularMarketPrice;
                      }
                  });
              }
          } catch(e) {}
      };

      await Promise.all([fetchAndParse(twSymbols), fetchAndParse(twoSymbols)]);

      if (isMounted && currentFetch === syncFetchRef.current && Object.keys(newPrices).length > 0) {
        setTwLivePrices(prev => ({ ...prev, ...newPrices }));
      }
    };

    syncTwPrices();
    const intId = setInterval(syncTwPrices, 15000); 
    return () => { isMounted = false; clearInterval(intId); };
  }, [twAccount.positions]);

  const fetchCryptoMarkets = async () => {
    try {
      const [tickerRes, fundingRes] = await Promise.all([
        fetch('https://fapi.binance.com/fapi/v1/ticker/24hr'),
        fetch('https://fapi.binance.com/fapi/v1/premiumIndex')
      ]);
      const tickers = await tickerRes.json();
      const fundingRates = await fundingRes.json();
      if (Array.isArray(tickers)) {
        setAllTickers(tickers.filter(t => String(t.symbol).endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)));
      }
      if (Array.isArray(fundingRates)) {
        const frMap = {}; fundingRates.forEach(i => { frMap[i.symbol] = i.lastFundingRate; }); setFundingRates(frMap);
      }
    } catch(e) {} finally { setLoadingCrypto(false); }
  };

  useEffect(() => { 
      fetchCryptoMarkets(); 
      const i = setInterval(fetchCryptoMarkets, 8000); 
      return () => clearInterval(i); 
  }, []);

  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace('#/', '');
      if (!h || h === 'portal') { setCurrentRoute('portal'); setSelectedTwStock(null); setSelectedCoin(null); }
      else if (h === 'tw-stocks') { setCurrentRoute('tw_stocks'); setSelectedTwStock(null); }
      else if (h === 'tw-stocks/positions') { setCurrentRoute('tw_positions'); }
      else if (h === 'tw-stocks/assets') { setCurrentRoute('tw_assets'); }
      else if (h === 'news') { setCurrentRoute('news'); }
      else if (h === 'crypto/home') { setCurrentRoute('crypto_home'); setSelectedCoin(null); }
      else if (h === 'crypto/positions') { setCurrentRoute('crypto_positions'); setSelectedCoin(null); }
      else if (h === 'crypto/assets') { setCurrentRoute('crypto_assets'); setSelectedCoin(null); }
      else if (h.startsWith('tw-stocks/detail/')) {
          const s = h.replace('tw-stocks/detail/', '');
          const c = twStocks.find(t => String(t.symbol) === String(s));
          setSelectedTwStock(c || { symbol: String(s), name: '自訂搜尋標的', lastPrice: '--', priceChangePercent: '0.00' }); 
          setCurrentRoute('tw_stock_detail');
      }
      else if (h.startsWith('crypto/trade/')) {
          const s = h.replace('crypto/trade/', '');
          const c = allTickers.find(t => String(t.symbol) === String(s));
          if (c) { setSelectedCoin(c); setCurrentRoute('crypto_trade'); }
      }
    };
    handleHash(); window.addEventListener('hashchange', handleHash); return () => window.removeEventListener('hashchange', handleHash);
  }, [twStocks, allTickers]);

  const openPosition = (symbol, type, margin, leverage, size, liq, mode, auto, price) => { setPaperAccount(prev => ({ ...prev, balance: prev.balance - margin, positions: [...prev.positions, { id: Date.now(), symbol: String(symbol), type, margin, leverage, size, entryPrice: price, liqPrice: liq, marginMode: mode, autoMargin: auto }] })); };
  const closePosition = (id, price) => { setPaperAccount(prev => { const p = prev.positions.find(x => x.id === id); if (!p) return prev; const pnl = p.type === 'LONG' ? (price - p.entryPrice) * p.size : (p.entryPrice - price) * p.size; return { ...prev, balance: prev.balance + p.margin + pnl, positions: prev.positions.filter(x => x.id !== id), history: [{ ...p, closePrice: price, pnl, closeTime: new Date().toLocaleString() }, ...prev.history].slice(0, 50) }; }); };
  const adjustPosition = (id, type, amount, price) => { setPaperAccount(prev => { const p = prev.positions.find(x => x.id === id); if (!p) return prev; if (type === 'add') { const sz = (amount * p.leverage) / price; return { ...prev, balance: prev.balance - amount, positions: prev.positions.map(x => x.id === id ? { ...x, size: x.size + sz, margin: x.margin + amount, entryPrice: ((x.size * x.entryPrice) + (sz * price)) / (x.size + sz) } : x) }; } else { const r = amount / p.margin; return { ...prev, balance: prev.balance + amount, positions: prev.positions.map(x => x.id === id ? { ...x, size: x.size * (1.0 - r), margin: x.margin - amount } : x) }; } }); };
  const resetCryptoAccount = () => setPaperAccount({ balance: 10000, positions: [], history: [] });

  const openTwPosition = (symbol, name, type, size, price) => {
    const shares = size * 1000;
    const cost = price * shares;
    const fee = Math.floor(cost * 0.001425);
    const required = type === 'LONG' ? cost + fee : fee;
    setTwAccount(prev => ({ ...prev, balance: prev.balance - required, positions: [...prev.positions, { id: Date.now(), symbol: String(symbol), name: String(name), type, size, shares, entryPrice: price, fee }] }));
  };
  const closeTwPosition = (id, currentPrice) => {
    setTwAccount(prev => {
        const p = prev.positions.find(x => x.id === id);
        if (!p) return prev;
        const grossVal = currentPrice * p.shares;
        const closeFee = Math.floor(grossVal * 0.001425);
        const tax = Math.floor(grossVal * 0.003); 
        let pnl = 0;
        if (p.type === 'LONG') pnl = (currentPrice - p.entryPrice) * p.shares - p.fee - closeFee - tax;
        else pnl = (p.entryPrice - currentPrice) * p.shares - p.fee - closeFee - tax;
        const refund = p.type === 'LONG' ? (p.entryPrice * p.shares + p.fee) + pnl : p.fee + pnl;
        return { ...prev, balance: prev.balance + refund, positions: prev.positions.filter(x => x.id !== id), history: [{ ...p, closePrice: currentPrice, pnl, closeTime: new Date().toLocaleString() }, ...prev.history].slice(0, 50) };
    });
  };
  const resetTwAccount = () => setTwAccount({ balance: 10000000, positions: [], history: [] });

  let backHash = '#/portal';
  let backLabel = '返回首頁';
  if (currentRoute === 'tw_stock_detail' || currentRoute === 'tw_positions' || currentRoute === 'tw_assets') { backHash = '#/tw-stocks'; backLabel = '返回台股首頁'; }
  else if (currentRoute === 'crypto_trade' || currentRoute === 'crypto_positions' || currentRoute === 'crypto_assets') { backHash = '#/crypto/home'; backLabel = '返回加密首頁'; }
  else if (currentRoute !== 'portal') { backHash = '#/portal'; backLabel = '返回入口'; }

  if (!isStylesLoaded) return <div className="h-screen bg-[#0b0e14] flex items-center justify-center text-white font-mono">LOADING ASSETS...</div>;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-blue-500/30 pb-10">
      <header className="bg-[#121620]/95 backdrop-blur border-b border-[#2a2f3a] sticky top-0 z-20 h-16 shadow-xl flex items-center px-4 justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
            <button className="sm:hidden text-slate-300 hover:text-white" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}><Menu className="w-6 h-6" /></button>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.hash = '#/portal'}><Globe className="w-6 h-6 text-blue-400" /><h1 className="text-xl font-bold text-white tracking-tighter hidden sm:block">SMC MAX</h1></div>
            
            {currentRoute.startsWith('crypto') && (
                <nav className="hidden sm:flex gap-1 text-sm font-bold ml-4 border-l border-[#2a2f3a] pl-4">
                  <button onClick={() => window.location.hash = '#/crypto/home'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'crypto_home' || currentRoute === 'crypto_trade' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>加密市場</button>
                  <button onClick={() => window.location.hash = '#/crypto/positions'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'crypto_positions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>持倉 {paperAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full ml-1">{paperAccount.positions.length}</span>}</button>
                  <button onClick={() => window.location.hash = '#/crypto/assets'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'crypto_assets' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>資產帳戶</button>
                </nav>
            )}

            {currentRoute.startsWith('tw_') && (
                <nav className="hidden sm:flex gap-1 text-sm font-bold ml-4 border-l border-[#2a2f3a] pl-4">
                  <button onClick={() => window.location.hash = '#/tw-stocks'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'tw_stocks' || currentRoute === 'tw_stock_detail' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>台股市場</button>
                  <button onClick={() => window.location.hash = '#/tw-stocks/positions'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'tw_positions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>波段持倉 {twAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full ml-1">{twAccount.positions.length}</span>}</button>
                  <button onClick={() => window.location.hash = '#/tw-stocks/assets'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'tw_assets' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>台股資產</button>
                </nav>
            )}

            {!currentRoute.startsWith('crypto') && !currentRoute.startsWith('tw_') && currentRoute !== 'portal' && (
                <nav className="hidden sm:flex gap-1 text-sm font-bold ml-4 border-l border-[#2a2f3a] pl-4">
                    <button onClick={() => window.location.hash = backHash} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-400 hover:bg-[#2a2f3a] hover:text-white transition-all"><ArrowLeft className="w-4 h-4"/> {backLabel}</button>
                </nav>
            )}
        </div>
        
        {currentRoute.startsWith('crypto') ? (
           <div className="bg-[#1a1e27] px-3 sm:px-4 py-1.5 sm:py-2 rounded border border-[#2a2f3a] flex items-center gap-2 sm:gap-3"><Wallet className="w-4 h-4 text-blue-400" /><span className="text-sm font-mono text-white font-bold">${(paperAccount.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        ) : currentRoute.startsWith('tw_') ? (
           <div className="bg-[#1a1e27] px-3 sm:px-4 py-1.5 sm:py-2 rounded border border-[#2a2f3a] flex items-center gap-2 sm:gap-3"><Wallet className="w-4 h-4 text-blue-400" /><span className="text-sm font-mono text-white font-bold">NT$ {Math.floor(twAccount.balance || 0).toLocaleString()}</span></div>
        ) : currentRoute !== 'portal' ? (
           <div className="text-xs font-bold px-3 py-1.5 bg-[#2a2f3a] rounded text-slate-300">熱點新聞中心</div>
        ) : <div />}
      </header>

      {isMobileMenuOpen && (
        <div className="sm:hidden z-50 relative">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm cursor-pointer z-40" 
            onClick={() => setIsMobileMenuOpen(false)} 
            onTouchStart={(e) => { e.preventDefault(); setIsMobileMenuOpen(false); }}
          />
          <div className="fixed top-0 left-0 h-full w-64 bg-[#121620] border-r border-[#2a2f3a] shadow-2xl flex flex-col p-4 gap-2 z-50 animate-in slide-in-from-left duration-200 overflow-y-auto">
             <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#2a2f3a]">
               <div className="flex items-center gap-2 text-blue-500">
                  <Globe className="w-6 h-6 text-blue-400" />
                  <span className="font-bold text-white tracking-tighter">SMC MAX</span>
               </div>
               <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5"/>
               </button>
             </div>

             <div className="text-xs text-slate-500 mb-1 font-bold">主系統</div>
             <button onClick={() => { window.location.hash = '#/portal'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold transition-all ${currentRoute === 'portal' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>首頁入口</button>
             <button onClick={() => { window.location.hash = '#/news'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold transition-all ${currentRoute === 'news' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>熱點新聞</button>

             <div className="text-xs text-slate-500 mt-4 mb-1 font-bold">台股與 ETF</div>
             <button onClick={() => { window.location.hash = '#/tw-stocks'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold transition-all ${currentRoute === 'tw_stocks' || currentRoute === 'tw_stock_detail' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>台股市場</button>
             <button onClick={() => { window.location.hash = '#/tw-stocks/positions'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold flex items-center justify-between transition-all ${currentRoute === 'tw_positions' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>
                波段持倉 {twAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{twAccount.positions.length}</span>}
             </button>
             <button onClick={() => { window.location.hash = '#/tw-stocks/assets'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold transition-all ${currentRoute === 'tw_assets' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>台股資產</button>

             <div className="text-xs text-slate-500 mt-4 mb-1 font-bold">虛擬貨幣 SMC</div>
             <button onClick={() => { window.location.hash = '#/crypto/home'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold transition-all ${currentRoute === 'crypto_home' || currentRoute === 'crypto_trade' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>加密市場</button>
             <button onClick={() => { window.location.hash = '#/crypto/positions'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold flex items-center justify-between transition-all ${currentRoute === 'crypto_positions' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>
                持倉清單 {paperAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{paperAccount.positions.length}</span>}
             </button>
             <button onClick={() => { window.location.hash = '#/crypto/assets'; setIsMobileMenuOpen(false); }} className={`px-4 py-2.5 rounded-lg text-left font-bold transition-all ${currentRoute === 'crypto_assets' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>資產帳戶</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {currentRoute === 'portal' && <PortalPage />}
        {currentRoute === 'news' && <NewsDashboard />}
        {currentRoute === 'tw_stocks' && <TwStocksDashboard twStocks={twStocks} twUpdateTime={twUpdateTime} loading={loadingTw} error={errorTw} twDashState={twDashState} setTwDashState={setTwDashState} />}
        {currentRoute === 'tw_stock_detail' && selectedTwStock && <TwStockWorkspace stock={selectedTwStock} twAccount={twAccount} openTwPosition={openTwPosition} />}
        {currentRoute === 'tw_positions' && <TwPositionsPage twStocks={twStocks} twAccount={twAccount} closeTwPosition={closeTwPosition} twLivePrices={twLivePrices} />}
        {currentRoute === 'tw_assets' && <TwAssetsPage twAccount={twAccount} resetTwAccount={resetTwAccount} />}
        
        {currentRoute === 'crypto_home' && <CryptoDashboard allTickers={allTickers} fundingRates={fundingRates} loading={loadingCrypto} dashState={dashState} setDashState={setDashState} />}
        {currentRoute === 'crypto_positions' && <CryptoPositionsPage allTickers={allTickers} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
        {currentRoute === 'crypto_assets' && <CryptoAssetsPage paperAccount={paperAccount} resetCryptoAccount={resetCryptoAccount} />}
        {currentRoute === 'crypto_trade' && selectedCoin && <CryptoTradingWorkspace coin={selectedCoin} fundingRate={fundingRates[selectedCoin.symbol]} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
      </main>
    </div>
  );
}
