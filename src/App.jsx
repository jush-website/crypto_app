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

const analyzeCryptoSignal = (klinesRaw, currentPrice, fundingRate) => {
  if (!klinesRaw || klinesRaw.length < 50) return null;
  const klines = calculateIndicators(klinesRaw);
  const latest = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  
  const vp = calculateVolumeProfile(klines);
  const sweep = detectLiquiditySweep(klines);
  const avwap = klines.reduce((acc, k) => acc + ((k.high + k.low + k.close) / 3) * k.volume, 0) / klines.reduce((acc, k) => acc + k.volume, 0);

  let score = 0;
  let logs = [];

  // 1. 移動平均線 (MA & EMA)
  if (latest.close > latest.ema12 && latest.close > latest.ma20) { score += 1.5; logs.push("均線: 站上 EMA12/MA20，短線偏多"); }
  else if (latest.close < latest.ema12 && latest.close < latest.ma20) { score -= 1.5; logs.push("均線: 跌破 EMA12/MA20，短線偏空"); }

  // 2. MACD 動能與背離/交叉
  if (latest.macd.hist > 0 && prev.macd.hist <= 0) { score += 2; logs.push("MACD: 零軸黃金交叉，多頭啟動"); }
  else if (latest.macd.hist < 0 && prev.macd.hist >= 0) { score -= 2; logs.push("MACD: 零軸死亡交叉，空頭發力"); }
  else if (latest.macd.hist > 0) { score += 0.5; }
  else { score -= 0.5; }

  // 3. RSI 情緒指標
  if (latest.rsi < 30) { score += 2; logs.push("RSI: 低於 30 極度超賣，醞釀反彈"); }
  else if (latest.rsi > 70) { score -= 2; logs.push("RSI: 高於 70 極度超買，回調風險"); }

  // 4. 布林通道 (Bollinger Bands)
  if (latest.bb.lower && latest.close < latest.bb.lower) { score += 1.5; logs.push("布林: 刺穿下軌，具強力支撐"); }
  if (latest.bb.upper && latest.close > latest.bb.upper) { score -= 1.5; logs.push("布林: 突破上軌，面臨極大阻力"); }

  // 5. Order Flow (主動買賣量 Delta) 與 Volume
  const takerBuy = latest.takerBuyVol || 0;
  const takerSell = latest.volume - takerBuy;
  const delta = takerBuy - takerSell;
  if (delta > latest.volume * 0.2) { score += 2; logs.push("Delta: 主動買盤(Taker)爆發介入"); }
  else if (delta < -latest.volume * 0.2) { score -= 2; logs.push("Delta: 主動賣盤大舉砸盤"); }

  // 6. FVG 缺口
  const k1 = klines[klines.length - 3];
  if (latest.low > k1.high) { score += 1.5; logs.push("FVG: 形成多頭合理價值缺口"); }
  if (latest.high < k1.low) { score -= 1.5; logs.push("FVG: 形成空頭合理價值缺口"); }

  // 7. Liquidity Sweep (流動性獵取)
  if (sweep.sweepLong) { score += 3; logs.push("SMC: 獵殺近期低點後拉回 (主力吸籌)"); }
  if (sweep.sweepShort) { score -= 3; logs.push("SMC: 獵殺近期高點後壓回 (主力派發)"); }

  // 決策門檻
  let signal = 'NEUTRAL';
  if (score >= 5) signal = 'LONG';
  else if (score <= -5) signal = 'SHORT';

  // -------------------------
  // 進場、止盈、止損 點位計算
  // -------------------------
  let entry = currentPrice;
  let sl = 0, tp = 0;
  
  // 抓取近 15 根 K 線的波段高低點
  const recentLows = klines.slice(-15).map(k => k.low);
  const recentHighs = klines.slice(-15).map(k => k.high);
  const swingLow = Math.min(...recentLows);
  const swingHigh = Math.max(...recentHighs);

  if (signal === 'LONG') {
      entry = currentPrice;
      // 止損設在波段低點或布林下軌下方，確保至少 1% 空間
      sl = Math.min(swingLow, latest.bb.lower || currentPrice) * 0.995;
      if ((entry - sl) / entry < 0.01) sl = entry * 0.985;
      // 止盈：盈虧比 1:2
      tp = entry + (entry - sl) * 2;
  } else if (signal === 'SHORT') {
      entry = currentPrice;
      // 止損設在波段高點或布林上軌上方
      sl = Math.max(swingHigh, latest.bb.upper || currentPrice) * 1.005;
      if ((sl - entry) / entry < 0.01) sl = entry * 1.015;
      // 止盈：盈虧比 1:2
      tp = entry - (sl - entry) * 2;
  }

  return { signal, score, logs, entry, tp, sl };
};

// ==========================================
// 台股子系統：K 線圖元件
// ==========================================
const TwKLineChart = ({ klines }) => {
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  if (!klines || klines.length === 0) return <div className="h-[500px] flex items-center justify-center text-slate-500">圖表載入中...</div>;
  const visibleCount = 80;
  const visibleKlines = klines.slice(-visibleCount);
  const width = 800, totalHeight = 580, paddingX = 10, paddingY = 20, priceHeight = 400, volTop = 440, volHeight = 120;
  const xStep = (width - paddingX * 2) / Math.max(visibleKlines.length, 1), candleWidth = Math.max(xStep * 0.6, 1);
  const lows = visibleKlines.map(k => k.low), highs = visibleKlines.map(k => k.high);
  const minPrice = Math.min(...lows), maxPrice = Math.max(...highs);
  const priceRange = (maxPrice - minPrice) || 1, maxVol = Math.max(...visibleKlines.map(k => k.volume || 0));

  const getPriceY = (p) => priceHeight - paddingY - ((p - minPrice) / priceRange) * (priceHeight - paddingY * 2);
  const getVolY = (v) => volTop + volHeight - (v / (maxVol || 1)) * volHeight;

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (width / rect.width);
    const dataIndex = Math.floor((x - paddingX) / xStep);
    setHoveredIndex((dataIndex >= 0 && dataIndex < visibleKlines.length) ? dataIndex : null);
  };

  const getMAPath = (maKey) => {
    let path = "";
    visibleKlines.forEach((k, i) => {
      if (k[maKey] !== null && k[maKey] >= minPrice && k[maKey] <= maxPrice) {
        const x = paddingX + i * xStep + candleWidth / 2, y = getPriceY(k[maKey]);
        path += (path === "" ? `M ${x} ${y} ` : `L ${x} ${y} `);
      }
    });
    return path;
  };

  const hoveredK = hoveredIndex !== null ? visibleKlines[hoveredIndex] : null;

  return (
    <div className="w-full relative group" style={{ height: '580px' }}>
      <div className="absolute top-2 left-2 flex gap-3 text-[11px] font-mono z-10 pointer-events-none">
        {hoveredK && (
          <div className="flex flex-col gap-1 bg-[#0b0e14]/90 backdrop-blur p-2 rounded border border-[#2a2f3a] text-slate-300">
            <div>DATE: {new Date(hoveredK.time).toLocaleDateString()}</div>
            <div className="flex gap-2">
              <span className="text-slate-500">O:<span className="text-white ml-1">{formatPrice(hoveredK.open)}</span></span>
              <span className="text-slate-500">H:<span className="text-white ml-1">{formatPrice(hoveredK.high)}</span></span>
              <span className="text-slate-500">L:<span className="text-white ml-1">{formatPrice(hoveredK.low)}</span></span>
              <span className="text-slate-500">C:<span className={hoveredK.close >= hoveredK.open ? "text-[#f6465d] ml-1" : "text-[#0ecb81] ml-1"}>{formatPrice(hoveredK.close)}</span></span>
              <span className="text-slate-500 ml-2">Vol:<span className="text-blue-400 ml-1">{Math.floor((hoveredK.volume||0)/1000).toLocaleString()} 張</span></span>
            </div>
          </div>
        )}
      </div>

      <div ref={containerRef} className="w-full h-full overflow-hidden cursor-crosshair" onMouseLeave={() => setHoveredIndex(null)} onMouseMove={handleMouseMove}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          <line x1="0" y1={priceHeight/2} x2={width} y2={priceHeight/2} stroke="#2a2f3a" strokeWidth="1" strokeDasharray="4 4"/>
          <line x1="0" y1={volTop - 15} x2={width} y2={volTop - 15} stroke="#2a2f3a" strokeWidth="1.5" />
          
          <path d={getMAPath('ma5')} fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.8" />
          <path d={getMAPath('ma20')} fill="none" stroke="#d946ef" strokeWidth="1.5" opacity="0.8" />
          <path d={getMAPath('ma60')} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.8" />

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
          
          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(maxPrice)}</text>
          <text x={width - 5} y={priceHeight - 10} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(minPrice)}</text>
        </svg>
      </div>
    </div>
  );
};

// ==========================================
// 台股子系統：個股分析工作區
// ==========================================
function TwStockWorkspace({ stock }) {
  const [chartData, setChartData] = useState([]);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chipData, setChipData] = useState({ loading: true, foreign: null, trust: null, dealer: null, marginToday: null, marginYest: null, marginChange: null });

  useEffect(() => {
    let isMounted = true;
    const fetchStockData = async () => {
      try {
        setLoading(true);
        const resHistory = await fetch(`/api/binance?action=tw-history&symbol=${stock.symbol}`);
        const historyData = await resHistory.json();
        let klines = [];
        if (historyData?.chart?.result?.[0]) {
          const result = historyData.chart.result[0], timestamps = result.timestamp || [], quote = result.indicators.quote[0] || {};
          for (let i = 0; i < timestamps.length; i++) {
            if (quote.close[i] !== null) {
              klines.push({ time: timestamps[i] * 1000, open: quote.open[i], high: quote.high[i], low: quote.low[i], close: quote.close[i], volume: quote.volume[i] });
            }
          }
        }
        
        const processedData = calculateIndicators(klines);
        
        let newsData = [];
        try {
           const resNews = await fetch(`/api/binance?action=news&symbol=${stock.symbol}`);
           const nData = await resNews.json();
           if (Array.isArray(nData)) newsData = nData;
        } catch(e) {}

        if (isMounted) { setChartData(processedData); setNews(newsData); setLoading(false); }
      } catch (err) { if (isMounted) setLoading(false); }
    };

    const fetchChipData = async () => {
      try {
        const [tseT86, tseMargin, tpexT86, tpexMargin] = await Promise.all([
          fetch('https://openapi.twse.com.tw/v1/fund/T86').then(r=>r.json()).catch(()=>[]),
          fetch('https://openapi.twse.com.tw/v1/marginTransaction/MI_MARGN').then(r=>r.json()).catch(()=>[]),
          fetch('https://www.tpex.org.tw/openapi/v1/t1824').then(r=>r.json()).catch(()=>[]),
          fetch('https://www.tpex.org.tw/openapi/v1/t1820').then(r=>r.json()).catch(()=>[])
        ]);

        let foreign = null, trust = null, dealer = null;
        let marginToday = null, marginYest = null, marginChange = null;

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
    fetchStockData(); fetchChipData(); return () => { isMounted = false; };
  }, [stock.symbol]);

  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const formatDate = (timestamp) => timestamp ? `${new Date(timestamp).getMonth() + 1}/${new Date(timestamp).getDate()}` : '';

  return (
    <div className="animate-in fade-in duration-300">
      <button onClick={() => window.location.hash = '#/tw-stocks'} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded-lg border border-[#2a2f3a]"><ArrowLeft className="w-4 h-4" /> 返回台股清單</button>
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-6 rounded-2xl border border-[#2a2f3a] shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><LineChart className="w-24 h-24 text-blue-500" /></div>
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
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" /> 核心技術指標</h3>
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
                      <div className="text-[10px] text-slate-500 font-bold mb-1">KD (K值)</div>
                      <div className="text-lg font-mono font-black text-amber-400">{latestData?.kd?.k?.toFixed(1) || '--'}</div>
                    </div>
                  </div>
              </div>

              <div className="bg-[#121620] rounded-2xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /> 三大法人與籌碼動向</h3>
                  {chipData.loading ? (
                    <div className="flex justify-center items-center py-6 text-slate-500"><RefreshCw className="w-5 h-5 animate-spin" /></div>
                  ) : (chipData.foreign !== null || chipData.marginToday !== null) ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-[#2a2f3a] text-slate-500">
                            <th className="pb-2 font-normal">指標</th>
                            <th className="pb-2 font-normal text-right whitespace-nowrap">今日 {latestData ? `(${formatDate(latestData.time)})` : ''}</th>
                            <th className="pb-2 font-normal text-right whitespace-nowrap">前日 {prevData ? `(${formatDate(prevData.time)})` : ''}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2a2f3a]/50">
                          <tr><td className="py-2.5 text-slate-400">外資</td><td className={`py-2.5 text-right font-mono font-bold ${chipData.foreign > 0 ? 'text-[#f6465d]' : chipData.foreign < 0 ? 'text-[#0ecb81]' : 'text-white'}`}>{chipData.foreign > 0 ? '+' : ''}{chipData.foreign !== null ? chipData.foreign.toLocaleString() + ' 張' : '--'}</td><td className="py-2.5 text-right font-mono text-slate-500">--</td></tr>
                          <tr><td className="py-2.5 text-slate-400">投信</td><td className={`py-2.5 text-right font-mono font-bold ${chipData.trust > 0 ? 'text-[#f6465d]' : chipData.trust < 0 ? 'text-[#0ecb81]' : 'text-white'}`}>{chipData.trust > 0 ? '+' : ''}{chipData.trust !== null ? chipData.trust.toLocaleString() + ' 張' : '--'}</td><td className="py-2.5 text-right font-mono text-slate-500">--</td></tr>
                          <tr><td className="py-2.5 text-slate-400">自營商</td><td className={`py-2.5 text-right font-mono font-bold ${chipData.dealer > 0 ? 'text-[#f6465d]' : chipData.dealer < 0 ? 'text-[#0ecb81]' : 'text-white'}`}>{chipData.dealer > 0 ? '+' : ''}{chipData.dealer !== null ? chipData.dealer.toLocaleString() + ' 張' : '--'}</td><td className="py-2.5 text-right font-mono text-slate-500">--</td></tr>
                          <tr><td className="py-2.5 text-slate-400">融資餘額</td><td className="py-2.5 text-right font-mono font-bold text-white">{chipData.marginToday !== null ? chipData.marginToday.toLocaleString() + ' 張' : '--'} {chipData.marginChange !== null && <span className={`ml-1 text-[10px] ${chipData.marginChange > 0 ? 'text-[#f6465d]' : chipData.marginChange < 0 ? 'text-[#0ecb81]' : 'text-slate-500'}`}>({chipData.marginChange > 0 ? '+' : ''}{chipData.marginChange})</span>}</td><td className="py-2.5 text-right font-mono text-slate-400">{chipData.marginYest !== null ? chipData.marginYest.toLocaleString() + ' 張' : '--'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  ) : <div className="text-center py-6 text-slate-500 text-xs">無公開盤後資料</div>}
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-2xl p-1 border border-[#2a2f3a] shadow-lg overflow-hidden">
            <div className="p-3 pb-0 flex gap-4 text-[10px] font-mono border-b border-[#2a2f3a]/50 mb-1">
              <span className="text-amber-500 font-bold">MA5 (周線)</span><span className="text-fuchsia-400 font-bold">MA20 (月線)</span><span className="text-emerald-500 font-bold">MA60 (季線)</span>
            </div>
            {loading ? <div className="w-full h-[580px] flex items-center justify-center"><RefreshCw className="animate-spin text-slate-500" /></div> : <TwKLineChart klines={chartData} />}
          </div>

          <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
             <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Newspaper className="w-5 h-5 text-emerald-500" /> 個股相關新聞</h3>
             {loading ? <div className="text-center py-10 text-slate-500 animate-pulse">載入新聞中...</div> : news.length > 0 ? (
                <div className="space-y-3">
                  {news.slice(0, 5).map((item, idx) => (
                    <a key={idx} href={item.link} target="_blank" rel="noopener noreferrer" className="block p-3 rounded-xl hover:bg-[#1a1e27] border border-transparent hover:border-[#2a2f3a] transition-all group">
                      <h4 className="text-sm font-bold text-slate-200 group-hover:text-emerald-400 mb-1 line-clamp-1">{item.title}</h4>
                      <div className="flex justify-between items-center text-[10px] text-slate-500"><span>{item.publisher || 'Yahoo Finance'}</span><span className="flex items-center gap-1">閱讀全文 <ExternalLink className="w-3 h-3" /></span></div>
                    </a>
                  ))}
                </div>
             ) : <div className="text-center py-10 text-slate-500">暫無相關新聞</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 虛擬貨幣子系統 (Crypto Components)
// ==========================================

function CryptoMarketCard({ ticker, multiSignals, onSelectCoin }) {
  const change = parseFloat(ticker.priceChangePercent);
  const isPositive = change >= 0;
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
        <div className={`px-2 py-1 rounded text-xs font-bold ${isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>{isPositive ? '+' : ''}{change.toFixed(2)}%</div>
      </div>
      <div className="text-2xl font-mono font-semibold text-white mb-3">${formatPrice(ticker.lastPrice)}</div>
      
      <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-[#2a2f3a]/50">
        {activeSignals.length > 0 ? activeSignals.map(tf => {
          const sig = multiSignals[tf];
          const isLong = sig.signal === 'LONG';
          return (
             <div key={tf} className={`text-[10px] p-2 rounded flex flex-col gap-1 ${isLong ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
               <div className="font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1"><Target className="w-3 h-3"/> {tf} {isLong ? '🔥 推薦做多' : '🩸 推薦做空'}</span>
               </div>
               <div className="grid grid-cols-3 gap-1 mt-1 opacity-90 text-[9px] font-mono">
                  <div className="text-white">進場 {formatPrice(sig.entry)}</div>
                  <div className="text-[#0ecb81]">TP {formatPrice(sig.tp)}</div>
                  <div className="text-red-400">SL {formatPrice(sig.sl)}</div>
               </div>
               <div className="text-[9px] mt-1 opacity-70 truncate">{sig.logs[0]}</div>
             </div>
          );
        }) : (
          <div className="text-[10px] px-2 py-3 rounded flex items-center justify-center bg-white/5 text-slate-500 border border-white/5">各週期均處於盤整，無強烈訊號</div>
        )}
      </div>
    </div>
  );
}

function CryptoDashboard({ allTickers, fundingRates, loading, dashState, setDashState }) {
  const { activeTab, timeframe, scanLimit, searchTerm, aiSignals, isScanning, scanProgress, initialScanned } = dashState;
  const [isRangeOpen, setIsRangeOpen] = useState(false);

  const setActiveTab = (tab) => setDashState(p => ({ ...p, activeTab: tab }));
  const setScanLimit = (limit) => setDashState(p => ({ ...p, scanLimit: limit }));
  const setSearchTerm = (term) => setDashState(p => ({ ...p, searchTerm: term }));

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
              const res = await fetch(`/api/binance?action=klines&symbol=${coin.symbol}&interval=${tf}&limit=80`);
              if(!res.ok) return;
              const data = await res.json();
              if (Array.isArray(data)) {
                  // Binance Kline Index: 1=Open, 2=High, 3=Low, 4=Close, 5=Volume, 9=TakerBuyVolume
                  const parsed = data.map(d => ({ 
                      open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), 
                      close: parseFloat(d[4]), volume: parseFloat(d[5]), takerBuyVol: parseFloat(d[9]) 
                  }));
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
                    <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 sm:py-1.5 text-xs sm:text-sm rounded transition-all whitespace-nowrap ${activeTab === t ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                      {t === 'ALL' ? '全部' : t === 'LONG' ? '🔥 做多機會' : '🩸 做空機會'}
                    </button>
                  ))}
              </div>
              <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                      <button onClick={() => setIsRangeOpen(!isRangeOpen)} className="flex items-center justify-center gap-1.5 bg-[#121620] px-3 py-2 sm:py-1.5 rounded-lg border border-[#2a2f3a] text-xs sm:text-sm text-slate-300 hover:text-white transition-colors h-full">
                          <Filter className="w-3.5 h-3.5" /> <span>Top {scanLimit}</span>
                      </button>
                      {isRangeOpen && (
                          <div className="absolute top-full mt-1 right-0 sm:left-0 w-24 bg-[#121620] border border-[#2a2f3a] rounded-lg shadow-xl z-50 p-1 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                              {[50, 100, 150].map(limit => (
                                  <button key={limit} onClick={() => { setScanLimit(limit); setIsRangeOpen(false); }} className={`px-3 py-2 text-left text-xs sm:text-sm rounded transition-all ${scanLimit === limit ? 'bg-blue-600/20 text-blue-400 font-bold' : 'text-slate-400 hover:bg-[#2a2f3a] hover:text-white'}`}>
                                      Top {limit}
                                  </button>
                              ))}
                          </div>
                      )}
                  </div>
                  <button onClick={handleManualScan} disabled={isScanning} className="bg-[#121620] p-2 sm:p-1.5 rounded-lg border border-[#2a2f3a] text-blue-400 hover:bg-[#2a2f3a] hover:text-blue-300 disabled:opacity-50 transition-colors flex items-center justify-center shrink-0">
                    <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isScanning ? 'animate-spin' : ''}`} />
                  </button>
              </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full lg:w-auto">
              {isScanning && <div className="text-xs text-blue-400 flex items-center gap-2 justify-start sm:justify-end shrink-0"><RefreshCw className="w-3 h-3 animate-spin" /> SMC 矩陣分析中 {scanProgress}%</div>}
              <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input type="text" placeholder="搜尋幣種..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white focus:border-blue-500 outline-none" /></div>
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
          const res = await fetch(`/api/binance?action=klines&symbol=${coin.symbol}&interval=${tf}&limit=120`);
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
        const res = await fetch(`/api/binance?action=price&symbol=${coin.symbol}`);
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
        </div>
      </div>
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

// 由於版面限制，此處省略 PositionsPage 與 AssetsPage 的完整重複代碼
// 您可直接沿用先前版本的 CryptoPositionsPage 與 CryptoAssetsPage。
// 我將焦點放在台股與首頁。

// ==========================================
// 台股列表 Dashboard
// ==========================================
function TwStocksDashboard({ twStocks, loading, error }) {
  const [searchTerm, setSearchTerm] = useState('');
  const filtered = useMemo(() => {
    const s = searchTerm.toUpperCase();
    if (!s) return twStocks.slice(0, 100);
    return twStocks.filter(t => t.symbol.includes(s) || t.name.includes(s)).slice(0, 200);
  }, [twStocks, searchTerm]);

  const isCodeFormat = /^[0-9A-Z]{4,6}$/.test(searchTerm);
  const showManualEntry = searchTerm && filtered.length === 0 && isCodeFormat;

  if (loading && !twStocks.length) return <div className="text-center py-32 text-slate-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取全台股資料中...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#121620] p-4 rounded-xl border border-[#2a2f3a] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg"><LineChart className="w-6 h-6 text-blue-400" /></div>
          <div><h2 className="text-xl font-bold text-white">台灣股市與 ETF</h2><p className="text-xs text-slate-400">上市、上櫃與全台 ETF 深度解析</p></div>
        </div>
        <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input type="text" placeholder="搜尋代號或名稱..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded-lg bg-[#0b0e14] text-white focus:border-blue-500 outline-none" /></div>
      </div>

      {showManualEntry && (
        <div className="bg-blue-600/10 border border-blue-500/30 p-8 rounded-2xl text-center">
            <h3 className="text-xl font-bold text-white mb-2">查無預載名稱？</h3>
            <p className="text-slate-400 mb-6">點擊下方直接進入代號 「{searchTerm}」 的深度分析系統。</p>
            <button onClick={() => window.location.hash = `#/tw-stocks/detail/${searchTerm}`} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold transition-all">進入分析系統</button>
        </div>
      )}

      {error && <div className="text-center py-10 text-red-400">{String(error)}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map(stock => {
          const change = parseFloat(stock.priceChangePercent); const isPositive = change >= 0;
          return (
            <div key={stock.symbol} onClick={() => window.location.hash = `#/tw-stocks/detail/${stock.symbol}`} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between shadow-md group">
              <div className="flex justify-between items-start mb-2">
                <div><h3 className="font-bold text-slate-100 text-lg group-hover:text-blue-400 transition-colors">{stock.name}</h3><div className="text-xs text-slate-500 mt-0.5 font-mono">{stock.symbol}</div></div>
                <div className={`px-2 py-1 rounded text-xs font-bold ${isPositive ? 'bg-[#f6465d]/10 text-[#f6465d]' : 'bg-[#0ecb81]/10 text-[#0ecb81]'}`}>{isPositive ? '+' : ''}{change.toFixed(2)}%</div>
              </div>
              <div className="mt-4">
                <div className={`text-2xl font-mono font-bold ${isPositive ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{stock.lastPrice}</div>
                <div className="text-[10px] text-slate-500 mt-1">量: {formatVolume(stock.quoteVolume)}</div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !showManualEntry && <div className="col-span-full text-center py-20 text-slate-500">找不到符合的股票代號或名稱。</div>}
      </div>
    </div>
  );
}

// ==========================================
// 財經新聞 Dashboard
// ==========================================
function NewsDashboard() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');

  useEffect(() => {
    let isMounted = true;
    const fetchRealNews = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/binance?action=news');
        const data = await res.json();
        if (isMounted) { setNews(Array.isArray(data) ? data : []); setLoading(false); }
      } catch (error) { if (isMounted) setLoading(false); }
    };
    fetchRealNews();
    return () => { isMounted = false; };
  }, []);

  const filteredNews = activeCategory === '全部' ? news : news.filter(n => n.category === activeCategory);

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
            <div className="flex justify-between items-center mb-3"><span className={`text-xs font-bold px-2 py-1 rounded ${item.category === '加密貨幣' ? 'bg-[#f7931a]/10 text-[#f7931a]' : 'bg-[#3b82f6]/10 text-[#3b82f6]'}`}>{item.category}</span><span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {item.time}</span></div>
            <h3 className="font-bold text-slate-100 text-lg group-hover:text-emerald-400 mb-3 line-clamp-2">{item.title}</h3>
            <div className="flex justify-between items-center mt-auto pt-4 border-t border-[#2a2f3a]/50"><span className="text-xs text-slate-400">{item.source}</span><span className="text-xs text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">閱讀全文 <ExternalLink className="w-3 h-3" /></span></div>
          </a>
        ))}
        {filteredNews.length === 0 && <div className="col-span-full text-center py-20 text-slate-500">暫無相關新聞</div>}
      </div>
    </div>
  );
}

// ==========================================
// 系統入口：極簡化 Portal 頁面
// ==========================================
function PortalPage() {
  const cards = [
    { id: 'crypto', title: '虛擬貨幣 SMC', desc: '串接合約數據，提供機構級 SMC 訊號 (15m, 1h, 4h) 與模擬下單。', icon: <Bitcoin className="w-12 h-12 text-[#f7931a]" />, color: 'from-[#f7931a]/20 to-[#f7931a]/5', route: '#/crypto/home' },
    { id: 'tw-stocks', title: '台股與 ETF', desc: '整合全台標的、歷史 K 線及盤後真實籌碼 (三大法人、融資券)。', icon: <LineChart className="w-12 h-12 text-[#3b82f6]" />, color: 'from-[#3b82f6]/20 to-[#3b82f6]/5', route: '#/tw-stocks' },
    { id: 'news', title: '24H 財經新聞', desc: '即時串接 Yahoo 與全球財經熱點，掌握市場第一手風向。', icon: <Newspaper className="w-12 h-12 text-[#10b981]" />, color: 'from-[#10b981]/20 to-[#10b981]/5', route: '#/news' }
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

  // 抓取台股清單 (加入嚴格的陣列與錯誤字串保護)
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
      const i = setInterval(fetchCryptoMarkets, 8000); 
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

  const openPosition = (symbol, type, margin, leverage, size, liq, mode, auto, price) => { setPaperAccount(prev => ({ ...prev, balance: prev.balance - margin, positions: [...prev.positions, { id: Date.now(), symbol, type, margin, leverage, size, entryPrice: price, liqPrice: liq, marginMode: mode, autoMargin: auto }] })); };
  const closePosition = (id, price) => { setPaperAccount(prev => { const p = prev.positions.find(x => x.id === id); if (!p) return prev; const pnl = p.type === 'LONG' ? (price - p.entryPrice) * p.size : (p.entryPrice - price) * p.size; return { ...prev, balance: prev.balance + p.margin + pnl, positions: prev.positions.filter(x => x.id !== id), history: [{ ...p, closePrice: price, pnl, closeTime: new Date().toLocaleString() }, ...prev.history].slice(0, 50) }; }); };
  const adjustPosition = (id, type, amount, price) => { setPaperAccount(prev => { const p = prev.positions.find(x => x.id === id); if (!p) return prev; if (type === 'add') { const sz = (amount * p.leverage) / price; return { ...prev, balance: prev.balance - amount, positions: prev.positions.map(x => x.id === id ? { ...x, size: x.size + sz, margin: x.margin + amount, entryPrice: ((x.size * x.entryPrice) + (sz * price)) / (x.size + sz) } : x) }; } else { const r = amount / p.margin; return { ...prev, balance: prev.balance + amount, positions: prev.positions.map(x => x.id === id ? { ...x, size: x.size * (1 - r), margin: x.margin - amount } : x) }; } }); };

  let backHash = '#/portal';
  let backLabel = '返回首頁';
  if (currentRoute === 'tw_stock_detail') { backHash = '#/tw-stocks'; backLabel = '返回台股清單'; }
  else if (currentRoute === 'crypto_trade') { backHash = '#/crypto/home'; backLabel = '返回市場'; }
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
        {currentRoute === 'tw_stocks' && <TwStocksDashboard twStocks={twStocks} loading={loadingTw} />}
        {currentRoute === 'tw_stock_detail' && selectedTwStock && <TwStockWorkspace stock={selectedTwStock} />}
        {currentRoute === 'crypto_home' && <CryptoDashboard allTickers={allTickers} fundingRates={fundingRates} loading={loadingCrypto} dashState={dashState} setDashState={setDashState} />}
        {currentRoute === 'crypto_positions' && <CryptoPositionsPage allTickers={allTickers} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
        {currentRoute === 'crypto_assets' && <CryptoAssetsPage paperAccount={paperAccount} />}
        {currentRoute === 'crypto_trade' && selectedCoin && <CryptoTradingWorkspace coin={selectedCoin} fundingRate={fundingRates[selectedCoin.symbol]} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
      </main>
    </div>
  );
}
