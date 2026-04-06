import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, RefreshCw, ArrowLeft, Search, Target, AlertCircle, Zap, Wallet, 
  ZoomIn, ZoomOut, MoveHorizontal, Pencil, Trash2, X, Layers, BarChart2, Waves, 
  Menu, Filter, Bitcoin, LineChart, Newspaper, ChevronRight, Globe, ExternalLink, 
  Clock, ShieldAlert, Crosshair
} from 'lucide-react';

// --- 全域輔助函數 ---
const formatPrice = (price) => {
  const p = parseFloat(price);
  if (isNaN(p) || p === 0) return '--';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
};

const formatVolume = (vol) => {
  const v = parseFloat(vol);
  if (isNaN(v)) return '0';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toLocaleString('en-US'); 
};

// ==========================================
// 核心：全市場通用技術分析引擎 (新增布林通道與 EMA)
// ==========================================
const calculateIndicators = (klines) => {
  if (!klines || !Array.isArray(klines) || klines.length === 0) return [];
  const closePrices = klines.map(k => k.close);
  const result = [];
  
  // 計算 EMA
  const calcEMA = (data, period) => {
    if (data.length === 0) return [];
    const k = 2 / (period + 1);
    let emaArray = [data[0]];
    for (let i = 1; i < data.length; i++) {
      emaArray.push(data[i] * k + emaArray[i - 1] * (1 - k));
    }
    return emaArray;
  };

  const ema12 = closePrices.length > 0 ? calcEMA(closePrices, 12) : [];
  const ema26 = closePrices.length > 0 ? calcEMA(closePrices, 26) : [];
  const macdLine = ema12.map((e12, i) => e12 - ema26[i]);
  const signalLine = macdLine.length > 0 ? calcEMA(macdLine, 9) : [];
  const histogram = macdLine.map((m, i) => m - signalLine[i]);

  // 計算 RSI (14)
  const rsiPeriod = 14;
  let rsiArray = new Array(klines.length).fill(null);
  let gains = 0, losses = 0;
  
  for(let i = 1; i <= rsiPeriod && i < closePrices.length; i++) {
    let diff = closePrices[i] - closePrices[i-1];
    if(diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / rsiPeriod; let avgLoss = losses / rsiPeriod;
  if(rsiPeriod < closePrices.length) {
    rsiArray[rsiPeriod] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  for (let i = rsiPeriod + 1; i < closePrices.length; i++) {
    let diff = closePrices[i] - closePrices[i-1];
    avgGain = ((avgGain * 13) + (diff >= 0 ? diff : 0)) / 14;
    avgLoss = ((avgLoss * 13) + (diff < 0 ? -diff : 0)) / 14;
    rsiArray[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  // 計算 KD (9)
  let kArray = new Array(klines.length).fill(50);
  let dArray = new Array(klines.length).fill(50);
  
  for (let i = 8; i < klines.length; i++) {
    const windowHighs = klines.slice(i - 8, i + 1).map(k => k.high);
    const windowLows = klines.slice(i - 8, i + 1).map(k => k.low);
    const maxH = Math.max(...windowHighs);
    const minL = Math.min(...windowLows);
    let rsv = maxH === minL ? 50 : ((closePrices[i] - minL) / (maxH - minL)) * 100;
    kArray[i] = (2/3) * kArray[i-1] + (1/3) * rsv;
    dArray[i] = (2/3) * dArray[i-1] + (1/3) * kArray[i];
  }

  // 組合計算 MA 與 Bollinger Bands
  for (let i = 0; i < klines.length; i++) {
    let ma5 = i >= 4 ? closePrices.slice(i-4, i+1).reduce((a,b)=>a+b)/5 : null;
    let ma20 = null, upperBB = null, lowerBB = null;
    let ma60 = i >= 59 ? closePrices.slice(i-59, i+1).reduce((a,b)=>a+b)/60 : null;

    if (i >= 19) {
      const slice = closePrices.slice(i-19, i+1);
      ma20 = slice.reduce((a,b)=>a+b)/20;
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - ma20, 2), 0) / 20;
      const stdDev = Math.sqrt(variance);
      upperBB = ma20 + 2 * stdDev;
      lowerBB = ma20 - 2 * stdDev;
    }

    result.push({
      ...klines[i],
      ma5, ma20, ma60, ema12: ema12[i], ema26: ema26[i],
      macd: { macd: macdLine[i], signal: signalLine[i], hist: histogram[i] },
      rsi: rsiArray[i],
      kd: { k: kArray[i], d: dArray[i] },
      bb: { upper: upperBB, mid: ma20, lower: lowerBB }
    });
  }
  return result;
};

// ==========================================
// 核心：SMC 虛擬貨幣進階量化與進出場計算
// ==========================================
const calculateVolumeProfile = (klines, bins = 24) => {
  if (!klines || klines.length === 0) return { poc: 0, vah: 0, val: 0 };
  const lows = klines.map(k => k.low), highs = klines.map(k => k.high);
  const min = Math.min(...lows), max = Math.max(...highs);
  const step = (max - min) / bins;
  const profile = Array(bins).fill(0).map((_, i) => ({ price: min + step * i, volume: 0 }));
  let totalVol = 0;
  klines.forEach(k => {
    const index = Math.min(bins - 1, Math.floor((k.close - min) / (step || 1)));
    profile[index].volume += k.volume; totalVol += k.volume;
  });
  let maxVol = 0, pocIndex = 0;
  profile.forEach((p, i) => { if (p.volume > maxVol) { maxVol = p.volume; pocIndex = i; } });
  const poc = profile[pocIndex].price;
  let volCount = profile[pocIndex].volume, up = pocIndex + 1, down = pocIndex - 1;
  while (volCount < totalVol * 0.7 && (up < bins || down >= 0)) {
    let volUp = up < bins ? profile[up].volume : -1, volDown = down >= 0 ? profile[down].volume : -1;
    if (volUp >= volDown && volUp !== -1) { volCount += volUp; up++; }
    else if (volDown !== -1) { volCount += volDown; down--; } else break;
  }
  return { poc, vah: up < bins ? profile[up].price : max, val: down >= 0 ? profile[down].price : min };
};

const detectLiquiditySweep = (klines) => {
  if (klines.length < 20) return { sweepLong: false, sweepShort: false };
  const lastK = klines[klines.length - 1], prevKlines = klines.slice(-20, -1);
  const localHigh = Math.max(...prevKlines.map(k => k.high)), localLow = Math.min(...prevKlines.map(k => k.low));
  return { sweepLong: lastK.low < localLow && lastK.close > localLow, sweepShort: lastK.high > localHigh && lastK.close < localHigh };
};

// 整合 SMC 與動能指標的最新演算法
const analyzeCryptoSignal = (klinesRaw, currentPrice, fundingRate) => {
  if (!klinesRaw || klinesRaw.length < 50) return null;
  
  // 計算全部指標
  const klines = calculateIndicators(klinesRaw);
  const latest = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  
  const vp = calculateVolumeProfile(klines);
  const sweep = detectLiquiditySweep(klines);
  const avwap = klines.reduce((acc, k) => acc + ((k.high + k.low + k.close) / 3) * k.volume, 0) / klines.reduce((acc, k) => acc + k.volume, 0);

  let score = 0;
  let logs = [];

  // 1. 移動平均線 (EMA)
  if (latest.close > latest.ema12 && latest.close > latest.ma20) { score += 1.5; logs.push("均線: 站上 EMA12/MA20，偏多"); }
  else if (latest.close < latest.ema12 && latest.close < latest.ma20) { score -= 1.5; logs.push("均線: 跌破 EMA12/MA20，偏空"); }

  // 2. MACD 動能與交叉
  if (latest.macd?.hist > 0 && prev.macd?.hist <= 0) { score += 2; logs.push("MACD: 零軸黃金交叉，多頭啟動"); }
  else if (latest.macd?.hist < 0 && prev.macd?.hist >= 0) { score -= 2; logs.push("MACD: 零軸死亡交叉，空頭發力"); }
  else if (latest.macd?.hist > 0) { score += 0.5; }
  else { score -= 0.5; }

  // 3. RSI 情緒指標
  if (latest.rsi < 30) { score += 2; logs.push("RSI: 低於 30 極度超賣，有反彈機會"); }
  else if (latest.rsi > 70) { score -= 2; logs.push("RSI: 高於 70 極度超買，有回調風險"); }

  // 4. 布林通道 (Bollinger Bands)
  if (latest.bb?.lower && latest.close < latest.bb.lower) { score += 1.5; logs.push("布林: 跌穿下軌，具備支撐"); }
  if (latest.bb?.upper && latest.close > latest.bb.upper) { score -= 1.5; logs.push("布林: 突破上軌，面臨阻力"); }

  // 5. Order Flow (主動買賣量 Delta) 與 成交量
  const takerBuy = latest.takerBuyVol || 0;
  const takerSell = latest.volume - takerBuy;
  const delta = takerBuy - takerSell;
  const avgVol = klines.slice(-10).reduce((a, b) => a + b.volume, 0) / 10;
  
  if (delta > latest.volume * 0.2 && latest.volume > avgVol) { score += 2; logs.push("Order Flow: 主動買盤大舉湧入"); }
  else if (delta < -latest.volume * 0.2 && latest.volume > avgVol) { score -= 2; logs.push("Order Flow: 主動賣盤放量砸盤"); }

  // 6. FVG 缺口
  const k1 = klines[klines.length - 3];
  if (k1 && latest.low > k1.high) { score += 1.5; logs.push("FVG: 形成多頭合理價值缺口"); }
  if (k1 && latest.high < k1.low) { score -= 1.5; logs.push("FVG: 形成空頭合理價值缺口"); }

  // 7. Liquidity Sweep (流動性獵取)
  if (sweep.sweepLong) { score += 3; logs.push("SMC: 獵殺近期低點後強力拉回 (主力吸籌)"); }
  if (sweep.sweepShort) { score -= 3; logs.push("SMC: 獵殺近期高點後迅速壓回 (主力派發)"); }

  // 判定信號
  let signal = 'NEUTRAL';
  if (score >= 4) signal = 'LONG';
  else if (score <= -4) signal = 'SHORT';

  // -------------------------
  // 進場、止盈、止損點位計算
  // -------------------------
  let entry = currentPrice;
  let sl = 0, tp = 0;
  
  // 取近 15 根 K 線的波段高低點
  const recentLows = klines.slice(-15).map(k => k.low);
  const recentHighs = klines.slice(-15).map(k => k.high);
  const swingLow = Math.min(...recentLows);
  const swingHigh = Math.max(...recentHighs);

  if (signal === 'LONG') {
      sl = Math.min(swingLow, latest.bb?.lower || currentPrice) * 0.995;
      if ((entry - sl) / entry < 0.005) sl = entry * 0.985; // 強制至少 1.5% 止損空間
      tp = entry + (entry - sl) * 2; // 1:2 盈虧比
  } else if (signal === 'SHORT') {
      sl = Math.max(swingHigh, latest.bb?.upper || currentPrice) * 1.005;
      if ((sl - entry) / entry < 0.005) sl = entry * 1.015;
      tp = entry - (sl - entry) * 2;
  }

  if (logs.length === 0) logs.push("市場動能不足，處於區間盤整");

  return { signal, score, logs, entry, tp, sl, poc: vp.poc, avwap };
};

// ==========================================
// 台股子系統：K 線圖
// ==========================================
const TwKLineChart = ({ klines }) => {
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  if (!klines || klines.length === 0) return <div className="h-[500px] flex items-center justify-center text-slate-500">圖表載入中...</div>;
  const visibleCount = 80, visibleKlines = klines.slice(-visibleCount);
  const width = 800, totalHeight = 580, priceHeight = 400, volTop = 440, volHeight = 120, paddingX = 10, paddingY = 20;
  const xStep = (width - paddingX * 2) / Math.max(visibleKlines.length, 1), candleWidth = Math.max(xStep * 0.6, 1);
  const minPrice = Math.min(...visibleKlines.map(k => k.low)), maxPrice = Math.max(...visibleKlines.map(k => k.high));
  const priceRange = (maxPrice - minPrice) || 1, maxVol = Math.max(...visibleKlines.map(k => k.volume || 0));
  const getPriceY = (p) => priceHeight - paddingY - ((p - minPrice) / priceRange) * (priceHeight - paddingY * 2);
  const getVolY = (v) => volTop + volHeight - (v / (maxVol || 1)) * volHeight;

  return (
    <div className="w-full relative group" style={{ height: '580px' }}>
      <div className="absolute top-2 left-2 flex gap-3 text-[11px] font-mono z-10 pointer-events-none">
        {hoveredIndex !== null && visibleKlines[hoveredIndex] && (
          <div className="flex flex-col gap-1 bg-[#0b0e14]/90 backdrop-blur p-2 rounded border border-[#2a2f3a] text-slate-300">
            <div>DATE: {new Date(visibleKlines[hoveredIndex].time).toLocaleDateString()}</div>
            <div className="flex gap-2">
              <span className="text-slate-500">O:<span className="text-white ml-1">{formatPrice(visibleKlines[hoveredIndex].open)}</span></span>
              <span className="text-slate-500">H:<span className="text-white ml-1">{formatPrice(visibleKlines[hoveredIndex].high)}</span></span>
              <span className="text-slate-500">L:<span className="text-white ml-1">{formatPrice(visibleKlines[hoveredIndex].low)}</span></span>
              <span className="text-slate-500">C:<span className={visibleKlines[hoveredIndex].close >= visibleKlines[hoveredIndex].open ? "text-[#f6465d] ml-1" : "text-[#0ecb81] ml-1"}>{formatPrice(visibleKlines[hoveredIndex].close)}</span></span>
              <span className="text-slate-500 ml-2">Vol:<span className="text-blue-400 ml-1">{Math.floor((visibleKlines[hoveredIndex].volume||0)/1000).toLocaleString()} 張</span></span>
            </div>
          </div>
        )}
      </div>
      <div ref={containerRef} className="w-full h-full cursor-crosshair" onMouseMove={(e) => {
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (width / rect.width);
        const idx = Math.floor((x - paddingX) / xStep);
        setHoveredIndex((idx >= 0 && idx < visibleKlines.length) ? idx : null);
      }} onMouseLeave={() => setHoveredIndex(null)}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          <line x1="0" y1={priceHeight/2} x2={width} y2={priceHeight/2} stroke="#2a2f3a" strokeWidth="1" strokeDasharray="4 4"/>
          <line x1="0" y1={volTop - 15} x2={width} y2={volTop - 15} stroke="#2a2f3a" strokeWidth="1.5" />
          
          <path d={visibleKlines.reduce((path, k, i) => k.ma5 !== null ? path + (path===""?`M ${paddingX+i*xStep+candleWidth/2} ${getPriceY(k.ma5)} `:`L ${paddingX+i*xStep+candleWidth/2} ${getPriceY(k.ma5)} `) : path, "")} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.8" />
          <path d={visibleKlines.reduce((path, k, i) => k.ma20 !== null ? path + (path===""?`M ${paddingX+i*xStep+candleWidth/2} ${getPriceY(k.ma20)} `:`L ${paddingX+i*xStep+candleWidth/2} ${getPriceY(k.ma20)} `) : path, "")} fill="none" stroke="#d946ef" strokeWidth="1.5" opacity="0.8" />
          <path d={visibleKlines.reduce((path, k, i) => k.ma60 !== null ? path + (path===""?`M ${paddingX+i*xStep+candleWidth/2} ${getPriceY(k.ma60)} `:`L ${paddingX+i*xStep+candleWidth/2} ${getPriceY(k.ma60)} `) : path, "")} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.8" />

          {visibleKlines.map((k, i) => {
            const x = paddingX + i * xStep, isUp = k.close >= k.open, color = isUp ? '#f6465d' : '#0ecb81';
            const openY = getPriceY(k.open), closeY = getPriceY(k.close), highY = getPriceY(k.high), lowY = getPriceY(k.low), volY = getVolY(k.volume || 0);
            return (
              <g key={i}>
                {hoveredIndex === i && <line x1={x + candleWidth/2} y1={0} x2={x + candleWidth/2} y2={totalHeight} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />}
                <line x1={x + candleWidth/2} y1={highY} x2={x + candleWidth/2} y2={lowY} stroke={color} strokeWidth="1.5" />
                <rect x={x} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(1, Math.abs(openY - closeY))} fill={isUp ? 'transparent' : color} stroke={color} strokeWidth="1" />
                <rect x={x} y={volY} width={candleWidth} height={Math.max(1, volTop + volHeight - volY)} fill={color} opacity="0.8" />
              </g>
            );
          })}
          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end">{formatPrice(maxPrice)}</text>
          <text x={width - 5} y={priceHeight - 10} fill="#848e9c" textAnchor="end">{formatPrice(minPrice)}</text>
          <text x={width - 5} y={volTop + 10} fill="#848e9c" textAnchor="end">{Math.floor(maxVol/1000)}K 張</text>
        </svg>
      </div>
    </div>
  );
};

function TwStockWorkspace({ stock }) {
  const [chartData, setChartData] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chipData, setChipData] = useState({ loading: true, foreign: null, trust: null, dealer: null, marginToday: null, marginYest: null, marginChange: null });

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const resHistory = await fetch(`/api/binance?action=tw-history&symbol=${stock.symbol}`);
        const historyData = await resHistory.json();
        let klines = [];
        if (historyData?.chart?.result?.[0]) {
          const result = historyData.chart.result[0], timestamps = result.timestamp || [], quote = result.indicators.quote[0] || {};
          for (let i = 0; i < timestamps.length; i++) {
            if (quote.close[i]) klines.push({ time: timestamps[i] * 1000, open: quote.open[i], high: quote.high[i], low: quote.low[i], close: quote.close[i], volume: quote.volume[i] });
          }
        }
        if (isMounted) { 
          setChartData(calculateIndicators(klines)); 
          setLoading(false); 
        }
        
        try {
           const resNews = await fetch(`/api/binance?action=news&symbol=${stock.symbol}`);
           const nData = await resNews.json();
           if (isMounted && Array.isArray(nData)) setNews(nData);
        } catch(e) {}
      } catch (e) { if (isMounted) setLoading(false); }
    };

    const fetchChips = async () => {
      try {
        const [tseT86, tseMargin, tpexT86, tpexMargin] = await Promise.all([
          fetch('https://openapi.twse.com.tw/v1/fund/T86').then(r=>r.json()).catch(()=>[]),
          fetch('https://openapi.twse.com.tw/v1/marginTransaction/MI_MARGN').then(r=>r.json()).catch(()=>[]),
          fetch('https://www.tpex.org.tw/openapi/v1/t1824').then(r=>r.json()).catch(()=>[]),
          fetch('https://www.tpex.org.tw/openapi/v1/t1820').then(r=>r.json()).catch(()=>[])
        ]);

        let foreign = null, trust = null, dealer = null, marginToday = null, marginYest = null, marginChange = null;

        const arrTseT86 = Array.isArray(tseT86) ? tseT86 : [];
        const arrTpexT86 = Array.isArray(tpexT86) ? tpexT86 : [];
        const t86Item = arrTseT86.find(i => i.Code === stock.symbol) || arrTpexT86.find(i => i.SecuritiesCompanyCode === stock.symbol);
        
        if (t86Item) {
            const parseNet = (val) => val ? Math.round(parseFloat(val.toString().replace(/,/g, '')) / 1000) : 0;
            foreign = parseNet(t86Item.ForeignInvestorNet || t86Item.ForeignDifference || t86Item.ForeignInvestmentInstitutionsNetBuySell);
            trust = parseNet(t86Item.InvestmentTrustNet || t86Item.TrustDifference || t86Item.InvestmentTrustNetBuySell);
            dealer = parseNet(t86Item.DealerNet || t86Item.DealerDifference || t86Item.DealerNetBuySell);
        }

        const arrTseMargin = Array.isArray(tseMargin) ? tseMargin : [];
        const arrTpexMargin = Array.isArray(tpexMargin) ? tpexMargin : [];
        const marginItem = arrTseMargin.find(i => i.Code === stock.symbol) || arrTpexMargin.find(i => i.SecuritiesCompanyCode === stock.symbol);

        if (marginItem) {
             const today = parseFloat((marginItem.MarginPurchaseTodayBalance || marginItem.MarginBalanceToday || marginItem.TodayBalance || '0').toString().replace(/,/g, ''));
             const yesterday = parseFloat((marginItem.MarginPurchaseYesterdayBalance || marginItem.MarginBalanceYesterday || marginItem.YesterdayBalance || '0').toString().replace(/,/g, ''));
             marginToday = Math.round(today / 1000); marginYest = Math.round(yesterday / 1000); marginChange = marginToday - marginYest;
        }
        if (isMounted) setChipData({ loading: false, foreign, trust, dealer, marginToday, marginYest, marginChange });
      } catch (error) { if (isMounted) setChipData(prev => ({ ...prev, loading: false })); }
    };

    fetchData(); fetchChips(); return () => { isMounted = false; };
  }, [stock.symbol]);

  const getRecommendations = () => {
    if (!chartData || chartData.length < 2) return null;
    const latest = chartData[chartData.length - 1];
    
    let shortTerm = { action: '觀望整理', color: 'text-slate-400', desc: '短期動能不明確，建議觀望。' };
    let shortScore = 0;
    if (latest.close > latest.ma5) shortScore++;
    if (latest.kd && latest.kd.k > latest.kd.d) shortScore++;
    if (latest.rsi > 50) shortScore++;
    if (shortScore >= 2) shortTerm = { action: '推薦買入', color: 'text-[#f6465d]', desc: '短線動能強勁，站上5日線且指標向上。' };
    else if (shortScore === 0) shortTerm = { action: '推薦賣出', color: 'text-[#0ecb81]', desc: '短線動能偏弱，跌破5日線且面臨賣壓。' };

    let midTerm = { action: '區間震盪', color: 'text-slate-400', desc: '中期趨勢整理中，無明顯方向。' };
    let midScore = 0;
    if (latest.close > latest.ma20) midScore++;
    if (latest.macd && latest.macd.hist > 0) midScore++;
    if (midScore === 2) midTerm = { action: '波段做多', color: 'text-[#f6465d]', desc: '成功站上月線且 MACD 翻紅，中期偏多。' };
    else if (midScore === 0) midTerm = { action: '逢高減碼', color: 'text-[#0ecb81]', desc: '失守月線且 MACD 翻綠，中期偏弱。' };

    let longTerm = latest.close > latest.ma60 
      ? { action: '偏多持有', color: 'text-[#f6465d]', desc: '股價維持在季線之上，長多格局不變。' }
      : { action: '偏空觀望', color: 'text-[#0ecb81]', desc: '股價落於季線之下，長空趨勢成型。' };
    return { shortTerm, midTerm, longTerm };
  };

  const recommendations = getRecommendations();
  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const formatDate = (ts) => ts ? `${new Date(ts).getMonth() + 1}/${new Date(ts).getDate()}` : '';

  return (
    <div className="animate-in fade-in duration-300">
      <button onClick={() => window.location.hash = '#/tw-stocks'} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded-lg border border-[#2a2f3a] transition-all"><ArrowLeft className="w-4 h-4" /> 返回台股清單</button>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-6 rounded-2xl border border-[#2a2f3a] shadow-lg relative overflow-hidden">
            <h2 className="text-3xl font-black text-white mb-1">{stock.name} <span className="text-lg font-normal text-slate-500 ml-1">{stock.symbol}</span></h2>
            <div className="flex items-end gap-3 mt-4">
              <div className={`text-4xl font-mono font-bold ${parseFloat(stock.priceChangePercent) >= 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{stock.lastPrice}</div>
              <div className={`text-lg font-bold pb-1 ${parseFloat(stock.priceChangePercent) >= 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{parseFloat(stock.priceChangePercent) >= 0 ? '+' : ''}{stock.priceChangePercent}%</div>
            </div>
            <div className="text-sm text-slate-400 mt-2">成交量: <span className="text-white font-mono">{formatVolume(stock.quoteVolume)}</span> 股</div>
          </div>

          {!loading && (
            <>
              <div className="bg-[#121620] rounded-2xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" /> 技術指標分析</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330] text-center">
                      <div className="text-[10px] text-slate-500 font-bold mb-1">RSI (14)</div>
                      <div className={`text-lg font-mono font-black ${latestData?.rsi > 70 ? 'text-[#f6465d]' : latestData?.rsi < 30 ? 'text-[#0ecb81]' : 'text-slate-200'}`}>{latestData?.rsi?.toFixed(1) || '--'}</div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330] text-center">
                      <div className="text-[10px] text-slate-500 font-bold mb-1">MACD</div>
                      <div className={`text-lg font-mono font-black ${latestData?.macd?.hist > 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{latestData?.macd?.hist?.toFixed(2) || '--'}</div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330] text-center">
                      <div className="text-[10px] text-slate-500 font-bold mb-1">KD (K)</div>
                      <div className="text-lg font-mono font-black text-amber-400">{latestData?.kd?.k?.toFixed(1) || '--'}</div>
                    </div>
                  </div>
              </div>

              <div className="bg-[#121620] rounded-2xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /> 三大法人與融資券</h3>
                  {chipData.loading ? <div className="py-6 flex justify-center"><RefreshCw className="animate-spin text-slate-600" /></div> : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead><tr className="text-slate-500 border-b border-[#2a2f3a]"><th className="pb-2">指標 (張)</th><th className="pb-2 text-right">今日 {latestData?`(${formatDate(latestData.time)})`:''}</th><th className="pb-2 text-right">前日 {prevData?`(${formatDate(prevData.time)})`:''}</th></tr></thead>
                        <tbody className="divide-y divide-[#2a2f3a]/50 text-white font-mono">
                          <tr><td className="py-2.5 text-slate-400">外資</td><td className={`py-2.5 text-right ${chipData.foreign>0?'text-[#f6465d] font-bold':chipData.foreign<0?'text-[#0ecb81] font-bold':''}`}>{chipData.foreign>0?'+':''}{chipData.foreign??'--'}</td><td className="py-2.5 text-right text-slate-600">--</td></tr>
                          <tr><td className="py-2.5 text-slate-400">投信</td><td className={`py-2.5 text-right ${chipData.trust>0?'text-[#f6465d] font-bold':chipData.trust<0?'text-[#0ecb81] font-bold':''}`}>{chipData.trust>0?'+':''}{chipData.trust??'--'}</td><td className="py-2.5 text-right text-slate-600">--</td></tr>
                          <tr><td className="py-2.5 text-slate-400">自營商</td><td className={`py-2.5 text-right ${chipData.dealer>0?'text-[#f6465d] font-bold':chipData.dealer<0?'text-[#0ecb81] font-bold':''}`}>{chipData.dealer>0?'+':''}{chipData.dealer??'--'}</td><td className="py-2.5 text-right text-slate-600">--</td></tr>
                          <tr><td className="py-2.5 text-slate-400">融資</td><td className="py-2.5 text-right">{chipData.marginToday??'--'} {chipData.marginChange!==null && <span className={chipData.marginChange>0?'text-[#f6465d]':'text-[#0ecb81]'}>({chipData.marginChange>0?'+':''}{chipData.marginChange})</span>}</td><td className="py-2.5 text-right text-slate-400">{chipData.marginYest??'--'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            </>
          )}
        </div>
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-2xl p-1 border border-[#2a2f3a] shadow-lg overflow-hidden">
             {loading ? <div className="h-[580px] flex items-center justify-center"><RefreshCw className="animate-spin" /></div> : <TwKLineChart klines={chartData} />}
          </div>
          
          {recommendations && (
            <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
               <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Crosshair className="w-5 h-5 text-blue-500" /> 趨勢分析與操作建議</h3>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]"><div className="text-sm text-slate-400 font-bold mb-2">短期 (1-2週內)</div><div className={`text-xl font-black mb-1 ${recommendations.shortTerm.color}`}>{recommendations.shortTerm.action}</div><div className="text-xs text-slate-500 leading-relaxed">{recommendations.shortTerm.desc}</div></div>
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]"><div className="text-sm text-slate-400 font-bold mb-2">中期 (1-3個月)</div><div className={`text-xl font-black mb-1 ${recommendations.midTerm.color}`}>{recommendations.midTerm.action}</div><div className="text-xs text-slate-500 leading-relaxed">{recommendations.midTerm.desc}</div></div>
                  <div className="bg-[#0b0e14] p-4 rounded-xl border border-[#1e2330]"><div className="text-sm text-slate-400 font-bold mb-2">長期 (一季以上)</div><div className={`text-xl font-black mb-1 ${recommendations.longTerm.color}`}>{recommendations.longTerm.action}</div><div className="text-xs text-slate-500 leading-relaxed">{recommendations.longTerm.desc}</div></div>
               </div>
            </div>
          )}

          <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
             <h3 className="text-lg font-bold text-white mb-4">個股新聞</h3>
             <div className="space-y-3">{news.slice(0,5).map((n, i) => (
               <a key={i} href={n.link} target="_blank" className="block p-3 rounded-xl hover:bg-[#1a1e27] border border-[#2a2f3a]/50 hover:border-emerald-500/50 transition-all group">
                 <h4 className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 line-clamp-1 mb-1">{n.title}</h4>
                 <div className="text-[10px] text-slate-500">{n.publisher || 'Yahoo'}</div>
               </a>
             ))}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 虛擬貨幣市場列表卡片 (並列 15m, 1h, 4h 分析)
// ==========================================
function CryptoMarketCard({ ticker, multiSignals, onSelectCoin }) {
  const change = parseFloat(ticker.priceChangePercent);
  const isPositive = change >= 0;
  // 找出有產生強烈訊號的週期
  const activeSignals = ['15m', '1h', '4h'].filter(tf => multiSignals?.[tf] && multiSignals[tf].signal !== 'NEUTRAL');

  return (
    <div onClick={() => {
        sessionStorage.setItem('dashboardScroll', window.scrollY.toString());
        onSelectCoin(ticker.symbol);
      }} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-xl p-5 cursor-pointer transition-all flex flex-col shadow-md group">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-bold text-slate-100 text-lg group-hover:text-blue-400">{ticker.symbol.replace('USDT', '')} <span className="text-xs text-slate-500">USDT</span></h3>
          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Vol: {formatVolume(ticker.quoteVolume)}</div>
        </div>
        <div className={`px-2 py-1 rounded text-xs font-bold ${isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
          {isPositive ? '+' : ''}{change.toFixed(2)}%
        </div>
      </div>
      <div className="text-2xl font-mono font-semibold text-white mb-2">${formatPrice(ticker.lastPrice)}</div>
      
      <div className="mt-auto flex flex-col gap-1.5 pt-3 border-t border-[#2a2f3a]/50">
        {activeSignals.length > 0 ? activeSignals.map(tf => {
          const sig = multiSignals[tf];
          const isLong = sig.signal === 'LONG';
          return (
             <div key={tf} className={`text-[10px] p-2 rounded flex flex-col gap-1 ${isLong ? 'bg-[#0ecb81]/10 border border-[#0ecb81]/30 text-[#0ecb81]' : 'bg-[#f6465d]/10 border border-[#f6465d]/30 text-[#f6465d]'}`}>
               <div className="font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1"><Target className="w-3 h-3"/> {tf} {isLong ? '🔥 推薦做多' : '🩸 推薦做空'}</span>
               </div>
               <div className="grid grid-cols-3 gap-1 mt-1 opacity-90 text-[9px] font-mono">
                  <div className="text-white">進場 {formatPrice(sig.entry)}</div>
                  <div className="text-[#0ecb81]">TP {formatPrice(sig.tp)}</div>
                  <div className="text-red-400">SL {formatPrice(sig.sl)}</div>
               </div>
               <div className="text-[9px] mt-1 opacity-70 truncate">{sig.logs && sig.logs[0] ? sig.logs[0] : ''}</div>
             </div>
          );
        }) : (
          <div className="text-[10px] px-2 py-3 rounded flex items-center justify-center bg-white/5 text-slate-500 border border-white/5">
            各週期均處於盤整，無強烈訊號
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 虛擬貨幣分析與下單儀表板
// ==========================================
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
          // 直接從幣安公有 API 拉取，避免 Vercel 卡 interval
          const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${tf}&limit=120`);
          const data = await res.json();
          if (Array.isArray(data)) {
              const parsed = data.map(d => ({ open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), takerBuyVol: parseFloat(d[9]), time: d[0] }));
              if (tf === '15m' && isMounted) setKlines(parsed);
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
        if (isMounted) setCurrentPrice(parseFloat(data.price));
      } catch(e) {}
    }, 1500);
    return () => { isMounted = false; clearInterval(interval); };
  }, [coin.symbol]);

  return (
    <div className="animate-in fade-in duration-300">
      <button onClick={() => window.location.hash = '#/crypto/home'} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded-lg border border-[#2a2f3a] transition-all"><ArrowLeft className="w-4 h-4" /> 返回市場</button>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg">
            <h2 className="text-3xl font-black text-white">{coin.symbol.replace('USDT','')} <span className="text-sm font-normal text-slate-500">USDT</span></h2>
            <div className="text-3xl font-mono font-bold text-white mt-2">${formatPrice(currentPrice)}</div>
          </div>
          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg"><CryptoTradeForm symbol={coin.symbol} currentPrice={currentPrice} balance={paperAccount.balance} onOpenPosition={openPosition} /></div>
          
          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Waves className="w-4 h-4 text-amber-500" /> SMC 多週期分析狀態</h3>
              {['15m', '1h', '4h'].map(tf => {
                const sig = multiSignals[tf];
                const isLong = sig?.signal === 'LONG';
                return (
                  <div key={tf} className={`p-3 rounded border border-[#1e2330] ${sig?.signal === 'NEUTRAL' ? 'bg-[#0b0e14]' : isLong ? 'bg-[#0ecb81]/5' : 'bg-[#f6465d]/5'}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-400 font-bold">{tf} 週期</span>
                      <span className={`text-xs font-black ${isLong ? 'text-[#0ecb81]' : sig?.signal === 'SHORT' ? 'text-[#f6465d]' : 'text-slate-500'}`}>{sig?.signal !== 'NEUTRAL' ? (isLong ? '做多' : '做空') : '盤整中'}</span>
                    </div>
                    {sig?.signal !== 'NEUTRAL' && (
                        <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] font-mono mb-2">
                           <div>進場: <span className="text-white block">{formatPrice(sig.entry)}</span></div>
                           <div>止盈: <span className="text-[#0ecb81] block">{formatPrice(sig.tp)}</span></div>
                           <div>止損: <span className="text-red-400 block">{formatPrice(sig.sl)}</span></div>
                        </div>
                    )}
                    {sig?.logs && sig.logs.map((log, i) => (
                        <div key={i} className="text-[10px] text-slate-500 leading-tight">✓ {log}</div>
                    ))}
                  </div>
                );
              })}
          </div>
        </div>
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-xl p-1 border border-[#2a2f3a] shadow-lg"><CryptoAdvancedKLineChart klines={klines} signalData={multiSignals['15m']} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paperAccount.positions.filter(p => p.symbol === coin.symbol).map(pos => <CryptoPositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(t,v) => adjustPosition(pos.id,t,v,currentPrice)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// K 線圖 (縮小版，保留原有)
const CryptoAdvancedKLineChart = ({ klines, signalData }) => {
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

  if (!klines || dataLen === 0) return <div className="w-full h-[500px] flex items-center justify-center text-slate-500">正在載入圖表數據...</div>;
  
  const maxOffset = Math.max(0, dataLen - visibleCount);
  const safeOffset = Math.min(Math.max(0, endIndexOffset), maxOffset);
  const safeVisibleCount = Math.min(visibleCount, dataLen);
  const startIndex = Math.max(0, dataLen - safeVisibleCount - safeOffset);
  const endIndex = dataLen - safeOffset;
  const visibleKlines = klines.slice(startIndex, endIndex);

  const width = 800; const totalHeight = 500; const kLineHeight = 380;
  const paddingX = 10; const xStep = (width - paddingX * 2) / safeVisibleCount; const candleWidth = Math.max(xStep * 0.7, 1);
  
  const lows = visibleKlines.map(k => k.low); const highs = visibleKlines.map(k => k.high);
  const minPrice = Math.min(...lows); const maxPrice = Math.max(...highs);
  const priceRange = (maxPrice - minPrice) || 1;
  const getPriceY = (p) => kLineHeight - 20 - ((p - minPrice) / priceRange) * (kLineHeight - 40);

  const getSvgCoords = (clientX, clientY) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left) * (width / rect.width), y: (clientY - rect.top) * (totalHeight / rect.height) };
  };

  const updateHover = (clientX) => {
    const dataIndex = Math.floor((getSvgCoords(clientX, 0).x - paddingX) / xStep);
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

  const hoveredK = hoveredIndex !== null ? visibleKlines[hoveredIndex] : null;

  return (
    <div className="w-full relative group touch-none" style={{ height: '500px' }}>
      <div className="absolute top-2 left-2 flex gap-3 text-[11px] font-mono z-10 pointer-events-none">
        {hoveredK ? (
          <div className="flex flex-col gap-1 bg-[#0b0e14]/90 backdrop-blur p-2 rounded border border-[#2a2f3a] text-slate-300">
            <div>TIME: {new Date(hoveredK.time).toLocaleString()}</div>
            <div className="flex gap-2">
              <span className="text-slate-500">O:<span className="text-white ml-1">{formatPrice(hoveredK.open)}</span></span>
              <span className="text-slate-500">H:<span className="text-white ml-1">{formatPrice(hoveredK.high)}</span></span>
              <span className="text-slate-500">L:<span className="text-white ml-1">{formatPrice(hoveredK.low)}</span></span>
              <span className="text-slate-500">C:<span className={hoveredK.close >= hoveredK.open ? "text-[#0ecb81] ml-1" : "text-[#f6465d] ml-1"}>{formatPrice(hoveredK.close)}</span></span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-500 bg-[#0b0e14]/50 backdrop-blur px-2 py-1 rounded">
             <MoveHorizontal className="w-3.5 h-3.5" /> 滾輪縮放 / 拖曳平移
          </div>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full overflow-hidden touch-none cursor-crosshair" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={() => {setIsDragging(false); setHoveredIndex(null);}} onMouseMove={handleMouseMove}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          <line x1="0" y1={kLineHeight} x2={width} y2={kLineHeight} stroke="#2a2f3a" strokeWidth="1" />
          
          {signalData?.poc && <><line x1="0" y1={getPriceY(signalData.poc)} x2={width} y2={getPriceY(signalData.poc)} stroke="#3b82f6" strokeWidth="1" strokeDasharray="5 5" opacity="0.6" /><text x={5} y={getPriceY(signalData.poc) - 5} fill="#3b82f6" fontSize="9">POC</text></>}
          {signalData?.avwap && <><line x1="0" y1={getPriceY(signalData.avwap)} x2={width} y2={getPriceY(signalData.avwap)} stroke="#f59e0b" strokeWidth="1" opacity="0.4" /><text x={width - 40} y={getPriceY(signalData.avwap) + 12} fill="#f59e0b" fontSize="9">AVWAP</text></>}

          {visibleKlines.map((k, i) => {
            const x = paddingX + i * xStep; const isUp = k.close >= k.open; const color = isUp ? '#0ecb81' : '#f6465d';
            const openY = getPriceY(k.open); const closeY = getPriceY(k.close); const highY = getPriceY(k.high); const lowY = getPriceY(k.low);
            
            return (
              <g key={k.time || i}>
                {hoveredIndex === i && <line x1={x + candleWidth/2} y1={0} x2={x + candleWidth/2} y2={totalHeight} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />}
                <line x1={x + candleWidth/2} y1={highY} x2={x + candleWidth/2} y2={lowY} stroke={color} strokeWidth="1.5" />
                <rect x={x} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(1, Math.abs(openY - closeY))} fill={color} />
              </g>
            );
          })}
          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end">{formatPrice(maxPrice)}</text>
          <text x={width - 5} y={kLineHeight - 10} fill="#848e9c" textAnchor="end">{formatPrice(minPrice)}</text>
        </svg>
      </div>
    </div>
  );
};

function CryptoDashboard({ allTickers, fundingRates, loading, dashState, setDashState }) {
  const { activeTab, timeframe, scanLimit, searchTerm, aiSignals, isScanning, scanProgress, initialScanned } = dashState;

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
              const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${tf}&limit=80`);
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
          setDashState(p => ({ ...p, scanProgress: Math.min(100, Math.round((completed / totalOps) * 100)) }));
          await new Promise(r => setTimeout(r, 200));
        }
    }
    setDashState(p => ({ ...p, isScanning: false }));
  };

  useEffect(() => {
    if (allTickers.length > 0 && !initialScanned && !isScanning) handleManualScan();
  }, [allTickers.length, initialScanned, isScanning]);

  if (loading && !allTickers.length) return <div className="text-center py-32 text-slate-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取幣安真實數據中...</div>;

  let filtered = allTickers.slice(0, scanLimit);
  if (searchTerm) {
      filtered = filtered.filter(t => t.symbol.includes(searchTerm.toUpperCase()));
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
                    <button key={t} onClick={() => setDashState(p=>({ ...p, activeTab: t }))} className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 sm:py-1.5 text-xs sm:text-sm rounded transition-all whitespace-nowrap ${activeTab === t ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                      {t === 'ALL' ? '全部' : t === 'LONG' ? '🔥 做多機會' : '🩸 做空機會'}
                    </button>
                  ))}
              </div>
              <button onClick={handleManualScan} disabled={isScanning} className="bg-[#121620] px-4 py-2 sm:py-1.5 rounded-lg border border-[#2a2f3a] text-blue-400 hover:bg-[#2a2f3a] hover:text-blue-300 disabled:opacity-50 transition-colors flex items-center justify-center shrink-0 text-sm">
                <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} /> 重新掃描 SMC
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
  const activeSymbols = [...new Set(paperAccount.positions.map(p => p.symbol))];
  const activeTickers = allTickers.filter(t => activeSymbols.includes(t.symbol));
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><Layers className="w-6 h-6 text-blue-500" /> 當前持倉 (虛擬貨幣)</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {paperAccount.positions.map(pos => <CryptoPositionCard key={pos.id} pos={pos} currentPrice={parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice)} balance={paperAccount.balance} onSelectCoin={c => window.location.hash = `#/crypto/trade/${c.symbol}`} onClose={() => closePosition(pos.id, parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice))} onAdjust={(t, v) => adjustPosition(pos.id, t, v, parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice))} />)}
      </div>
      {activeTickers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeTickers.map(t => <div key={t.symbol} className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg"><h3 className="font-bold text-white mb-4">{t.symbol} 快捷下單</h3><CryptoTradeForm symbol={t.symbol} currentPrice={parseFloat(t.lastPrice)} balance={paperAccount.balance} onOpenPosition={openPosition} /></div>)}
        </div>
      )}
    </div>
  );
}

function CryptoTradeForm({ symbol, currentPrice, balance, onOpenPosition }) {
  const [leverage, setLeverage] = useState(10);
  const [marginMode, setMarginMode] = useState('ISOLATED'); 
  const [inputValue, setInputValue] = useState(''); 
  const [tradeError, setTradeError] = useState('');

  const val = parseFloat(inputValue) || 0;
  const coinSize = currentPrice > 0 ? (val * leverage) / currentPrice : 0;
  let liqLong = currentPrice * (1 - 1/leverage + 0.004);
  let liqShort = currentPrice * (1 + 1/leverage - 0.004);

  const handleSubmit = (type) => {
    setTradeError('');
    if(val > balance) return setTradeError("可用餘額不足！");
    if(val <= 0) return setTradeError("金額必須大於 0");
    onOpenPosition(symbol, type, val, leverage, coinSize, type === 'LONG' ? liqLong : liqShort, marginMode, false, currentPrice);
    setInputValue(''); 
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <label>槓桿倍數</label><span className="text-white font-bold">{leverage}x</span>
        </div>
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
          {[25, 50, 75, 100].map(p => <span key={p} className="cursor-pointer" onClick={() => setInputValue(balance > 0 ? (balance * (p / 100)).toFixed(2) : '0')}>{p}%</span>)}
        </div>
        {tradeError && <div className="text-[10px] text-red-400 mt-1">{tradeError}</div>}
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
  const roe = (pnl / pos.margin) * 100;
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
            onSelectCoin({symbol: pos.symbol});
          }}>{pos.symbol}</h3>
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
          {modalError && <div className="text-[10px] text-red-400 mt-1">{modalError}</div>}
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

function CryptoAssetsPage({ paperAccount }) {
  const totalRealized = paperAccount.history.reduce((a, b) => a + b.pnl, 0);
  const winRate = paperAccount.history.length ? ((paperAccount.history.filter(h => h.pnl > 0).length / paperAccount.history.length) * 100).toFixed(1) : 0;
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><BarChart2 className="w-6 h-6 text-blue-500" /> 帳戶數據</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">可用餘額</div><div className="text-2xl font-mono font-bold text-blue-400">${paperAccount.balance.toFixed(2)}</div></div>
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">累計盈虧</div><div className={`text-2xl font-mono font-bold ${totalRealized >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>${totalRealized.toFixed(2)}</div></div>
        <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg"><div className="text-xs text-slate-400">歷史勝率</div><div className="text-2xl font-mono font-bold text-white">{winRate}%</div></div>
      </div>
    </div>
  );
}

// ==========================================
// 系統入口：極簡化 Portal 頁面
// ==========================================
function PortalPage() {
  const cards = [
    { id: 'crypto', title: '虛擬貨幣 SMC', desc: '全自動 SMC 高階策略掃描，支援 15m, 1h, 4h 週期並提供進場、止盈、止損點。', icon: <Bitcoin className="w-12 h-12 text-[#f7931a]" />, color: 'from-[#f7931a]/20 to-[#f7931a]/5', route: '#/crypto/home' },
    { id: 'tw-stocks', title: '台股與 ETF', desc: '上市、上櫃及全台 ETF 總覽，提供指標分析與真實三大法人及融資券籌碼。', icon: <LineChart className="w-12 h-12 text-[#3b82f6]" />, color: 'from-[#3b82f6]/20 to-[#3b82f6]/5', route: '#/tw-stocks' },
    { id: 'news', title: '24H 財經新聞', desc: '即時串接全球與台灣財經熱點，掌握第一手市場風向。', icon: <Newspaper className="w-12 h-12 text-[#10b981]" />, color: 'from-[#10b981]/20 to-[#10b981]/5', route: '#/news' }
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

// ==========================================
// 主應用程式入口
// ==========================================
export default function App() {
  const [isStylesLoaded, setIsStylesLoaded] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [currentRoute, setCurrentRoute] = useState('portal');
  
  const [twStocks, setTwStocks] = useState([]);
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
         if (!parsed.scanLimit) parsed.scanLimit = 150;
         return { ...parsed, isScanning: false, scanProgress: 0 };
      }
    } catch(e) {}
    return { activeTab: 'ALL', timeframe: '15m', scanLimit: 150, searchTerm: '', aiSignals: { '15m': {}, '1h': {}, '4h': {} }, isScanning: false, scanProgress: 0, initialScanned: false };
  });

  const [paperAccount, setPaperAccount] = useState(() => { try { const s = localStorage.getItem('paperAccount'); return s ? JSON.parse(s) : { balance: 10000, positions: [], history: [] }; } catch(e) { return { balance: 10000, positions: [], history: [] }; } });

  useEffect(() => { sessionStorage.setItem('protrade_dashState', JSON.stringify(dashState)); }, [dashState]);
  useEffect(() => { localStorage.setItem('paperAccount', JSON.stringify(paperAccount)); }, [paperAccount]);

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const s = document.createElement('script'); s.id = 'tailwind-cdn'; s.src = 'https://cdn.tailwindcss.com';
      s.onload = () => setIsStylesLoaded(true); document.head.appendChild(s);
    } else { setIsStylesLoaded(true); }
  }, []);

  // 抓取台股清單 (加入嚴格陣列與錯誤保護)
  useEffect(() => {
    let isMounted = true;
    const fetchTwStocksList = async () => {
      try {
        const [resTse, resOtc] = await Promise.all([
          fetch('/api/binance?action=tw-stocks').then(r => r.json()).catch(() => []),
          fetch('https://www.tpex.org.tw/openapi/v1/t1820').then(r => r.json()).catch(() => [])
        ]);

        if (isMounted) {
          const arrTse = Array.isArray(resTse) ? resTse : [];
          const arrOtc = Array.isArray(resOtc) ? resOtc : [];

          const formattedTse = arrTse.filter(i => i && i.Code).map(item => {
              const current = parseFloat(item.ClosingPrice);
              const changeStr = item.Change ? item.Change.toString().replace('+', '').trim() : '0';
              const changeAmt = parseFloat(changeStr) || 0;
              let percent = 0;
              if (!isNaN(current) && !isNaN(changeAmt) && current !== 0) {
                  const prevClose = current - changeAmt; 
                  if (prevClose > 0) percent = (changeAmt / prevClose) * 100;
                  if (changeStr.includes('-')) percent = -Math.abs(percent);
                  else if (changeStr !== '0.00' && changeStr !== '0') percent = Math.abs(percent);
              }
              return { symbol: item.Code, name: item.Name, lastPrice: isNaN(current) ? '0.00' : current.toFixed(2), priceChangePercent: percent.toFixed(2), quoteVolume: parseInt(item.TradeVolume) || 0 };
          });

          const formattedOtc = arrOtc.filter(i => i && i.SecuritiesCompanyCode).map(i => ({ 
              symbol: i.SecuritiesCompanyCode, 
              name: i.CompanyName || i.SecuritiesCompanyName, 
              lastPrice: i.Close || '0.00', 
              priceChangePercent: '0.00', 
              quoteVolume: parseInt(i.Volume) || 0 
          }));

          const combined = [...formattedTse, ...formattedOtc]
            .filter(i => /^[0-9A-Z]{4,6}$/.test(i.symbol))
            .sort((a, b) => b.quoteVolume - a.quoteVolume);

          setTwStocks(combined); setLoadingTw(false);
        }
      } catch (err) { 
        if (isMounted) { setErrorTw(err instanceof Error ? err.message : String(err)); setLoadingTw(false); } 
      }
    };
    fetchTwStocksList();
    return () => { isMounted = false; };
  }, []);

  // 抓取加密市場清單
  const fetchCryptoMarkets = async () => {
    try {
      const res = await fetch('/api/binance?action=overview');
      const data = await res.json();
      if (data && Array.isArray(data.tickers)) {
        setAllTickers(data.tickers.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)));
      }
      if (data && Array.isArray(data.fundingRates)) {
        const frMap = {}; data.fundingRates.forEach(i => { frMap[i.symbol] = i.lastFundingRate; }); setFundingRates(frMap);
      }
    } catch(e) {} finally { setLoadingCrypto(false); }
  };

  useEffect(() => { 
      fetchCryptoMarkets(); 
      const i = setInterval(fetchCryptoMarkets, 10000); 
      return () => clearInterval(i); 
  }, []);

  // 統一的路由解析
  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace('#/', '');
      if (!h || h === 'portal') { setCurrentRoute('portal'); setSelectedTwStock(null); setSelectedCoin(null); }
      else if (h === 'tw-stocks') { setCurrentRoute('tw_stocks'); setSelectedTwStock(null); }
      else if (h === 'news') { setCurrentRoute('news'); }
      else if (h === 'crypto/home') { setCurrentRoute('crypto_home'); setSelectedCoin(null); }
      else if (h === 'crypto/positions') { setCurrentRoute('crypto_positions'); setSelectedCoin(null); }
      else if (h === 'crypto/assets') { setCurrentRoute('crypto_assets'); setSelectedCoin(null); }
      else if (h.startsWith('tw-stocks/detail/')) {
          const s = h.replace('tw-stocks/detail/', '');
          const c = twStocks.find(t => t.symbol === s);
          setSelectedTwStock(c || { symbol: s, name: '自訂搜尋標的', lastPrice: '--', priceChangePercent: '0.00' }); 
          setCurrentRoute('tw_stock_detail');
      }
      else if (h.startsWith('crypto/trade/')) {
          const s = h.replace('crypto/trade/', '');
          const c = allTickers.find(t => t.symbol === s);
          if (c) { setSelectedCoin(c); setCurrentRoute('crypto_trade'); }
      }
    };
    handleHash(); window.addEventListener('hashchange', handleHash); return () => window.removeEventListener('hashchange', handleHash);
  }, [twStocks, allTickers]);

  let backHash = '#/portal';
  let backLabel = '返回首頁';
  if (currentRoute === 'tw_stock_detail') { backHash = '#/tw-stocks'; backLabel = '返回台股清單'; }
  else if (currentRoute === 'crypto_trade') { backHash = '#/crypto/home'; backLabel = '返回加密市場'; }
  else if (currentRoute !== 'portal') { backHash = '#/portal'; backLabel = '返回首頁'; }

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

            {!currentRoute.startsWith('crypto') && currentRoute !== 'portal' && (
                <nav className="hidden sm:flex gap-1 text-sm font-bold ml-4 border-l border-[#2a2f3a] pl-4">
                    <button onClick={() => window.location.hash = backHash} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-400 hover:bg-[#2a2f3a] hover:text-white transition-all"><ArrowLeft className="w-4 h-4"/> {backLabel}</button>
                </nav>
            )}
        </div>
        
        {currentRoute.startsWith('crypto') ? (
           <div className="bg-[#1a1e27] px-3 sm:px-4 py-1.5 sm:py-2 rounded border border-[#2a2f3a] flex items-center gap-2 sm:gap-3"><Wallet className="w-4 h-4 text-blue-400" /><span className="text-sm font-mono text-white font-bold">${paperAccount.balance.toFixed(2)}</span></div>
        ) : currentRoute !== 'portal' ? (
           <div className="text-xs font-bold px-3 py-1.5 bg-[#2a2f3a] rounded text-slate-300">{currentRoute === 'news' ? '熱點新聞中心' : '台股分析系統'}</div>
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
             <button onClick={() => { window.location.hash = '#/portal'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'portal' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>首頁入口</button>
             <button onClick={() => { window.location.hash = '#/tw-stocks'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute.startsWith('tw_stock') ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>台灣股市行情</button>
             <button onClick={() => { window.location.hash = '#/news'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'news' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>熱點新聞</button>
             
             {currentRoute.startsWith('crypto') && (
                <>
                 <div className="text-xs text-slate-500 mt-4 mb-1 font-bold border-t border-[#2a2f3a] pt-4">加密貨幣子系統</div>
                 <button onClick={() => { window.location.hash = '#/crypto/home'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'crypto_home' || currentRoute === 'crypto_trade' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>加密市場</button>
                 <button onClick={() => { window.location.hash = '#/crypto/positions'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all flex items-center justify-between ${currentRoute === 'crypto_positions' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>持倉與管理 {paperAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{paperAccount.positions.length}</span>}</button>
                 <button onClick={() => { window.location.hash = '#/crypto/assets'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'crypto_assets' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>資產帳戶</button>
                </>
             )}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {currentRoute === 'portal' && <PortalPage />}
        {currentRoute === 'news' && <NewsDashboard />}
        {currentRoute === 'tw_stocks' && <TwStocksDashboard twStocks={twStocks} loading={loadingTw} error={errorTw} />}
        {currentRoute === 'tw_stock_detail' && selectedTwStock && <TwStockWorkspace stock={selectedTwStock} />}
        
        {currentRoute === 'crypto_home' && <CryptoDashboard allTickers={allTickers} fundingRates={fundingRates} loading={loadingCrypto} dashState={dashState} setDashState={setDashState} />}
        {currentRoute === 'crypto_positions' && <CryptoPositionsPage allTickers={allTickers} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
        {currentRoute === 'crypto_assets' && <CryptoAssetsPage paperAccount={paperAccount} />}
        {currentRoute === 'crypto_trade' && selectedCoin && <CryptoTradingWorkspace coin={selectedCoin} fundingRate={fundingRates[selectedCoin.symbol]} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
      </main>
    </div>
  );
}
