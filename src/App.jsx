import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, RefreshCw, ArrowLeft, Search, Target, AlertCircle, Zap, Wallet, 
  ZoomIn, ZoomOut, MoveHorizontal, Pencil, Trash2, X, Layers, BarChart2, Waves, 
  Menu, Filter, Bitcoin, LineChart, Newspaper, ChevronRight, Globe, ExternalLink, 
  Clock, ShieldAlert, Crosshair, Activity
} from 'lucide-react';

// --- 全域輔助函數 ---
const formatPrice = (price) => {
  const p = parseFloat(price);
  if (isNaN(p) || p === 0) return '--';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
// 核心：專業 SMC 量化分析引擎 (Crypto)
// ==========================================

// 1. 成交量分佈 (Volume Profile)
const calculateVolumeProfile = (klines, bins = 24) => {
  if (!klines || klines.length === 0) return { poc: 0, vah: 0, val: 0, profile: [] };
  const prices = klines.map(k => k.close);
  const min = Math.min(...klines.map(k => k.low));
  const max = Math.max(...klines.map(k => k.high));
  const step = (max - min) / bins;
  
  const profile = Array(bins).fill(0).map((_, i) => ({ price: min + step * i, volume: 0 }));
  let totalVol = 0;
  klines.forEach(k => {
    const index = Math.min(bins - 1, Math.floor((k.close - min) / (step || 1)));
    profile[index].volume += k.volume;
    totalVol += k.volume;
  });

  let maxVol = 0; let pocIndex = 0;
  profile.forEach((p, i) => { if (p.volume > maxVol) { maxVol = p.volume; pocIndex = i; } });
  const poc = profile[pocIndex].price;

  // 計算 70% 價值區間 (Value Area)
  let volCount = profile[pocIndex].volume, up = pocIndex + 1, down = pocIndex - 1;
  while (volCount < totalVol * 0.7 && (up < bins || down >= 0)) {
    let volUp = up < bins ? profile[up].volume : -1;
    let volDown = down >= 0 ? profile[down].volume : -1;
    if (volUp >= volDown && volUp !== -1) { volCount += volUp; up++; }
    else if (volDown !== -1) { volCount += volDown; down--; }
    else break;
  }
  const vah = up < bins ? profile[up].price : max;
  const val = down >= 0 ? profile[down].price : min;
  return { poc, vah, val, profile };
};

// 2. 流動性獵取 (Liquidity Sweep)
const detectLiquiditySweep = (klines) => {
  if (klines.length < 30) return { sweepLong: false, sweepShort: false };
  const lastK = klines[klines.length - 1];
  const lookback = klines.slice(-30, -1);
  const prevHigh = Math.max(...lookback.map(k => k.high));
  const prevLow = Math.min(...lookback.map(k => k.low));
  
  // 看漲：刺穿低點後收盤拉回 (Stop Hunt Long)
  const sweepLong = lastK.low < prevLow && lastK.close > prevLow;
  // 看跌：刺穿高點後收盤壓回 (Stop Hunt Short)
  const sweepShort = lastK.high > prevHigh && lastK.close < prevHigh;
  return { sweepLong, sweepShort, prevHigh, prevLow };
};

// 3. 訂單流與合理價值缺口 (Order Flow & FVG)
const analyzeOrderFlow = (klines) => {
  if (klines.length < 5) return { fvgUp: false, fvgDown: false, aggressiveBuy: false, aggressiveSell: false };
  const k1 = klines[klines.length - 3];
  const k3 = klines[klines.length - 1];
  
  // FVG 偵測
  const fvgUp = k3.low > k1.high; // 多頭缺口
  const fvgDown = k3.high < k1.low; // 空頭缺口

  const lastK = klines[klines.length - 1];
  const bodySize = Math.abs(lastK.close - lastK.open);
  const fullSize = lastK.high - lastK.low;
  const avgVol = klines.slice(-10).reduce((a, b) => a + b.volume, 0) / 10;

  // 強力進場訊號 (大實體 + 高量)
  const aggressiveBuy = lastK.close > lastK.open && bodySize / fullSize > 0.7 && lastK.volume > avgVol;
  const aggressiveSell = lastK.close < lastK.open && bodySize / fullSize > 0.7 && lastK.volume > avgVol;

  return { fvgUp, fvgDown, aggressiveBuy, aggressiveSell };
};

// 4. MACD 計算
const calculateMACD = (klines) => {
  const closePrices = klines.map(k => k.close);
  if (closePrices.length < 26) return { hist: 0, crossUp: false, crossDown: false };
  
  const calcEMA = (data, p) => {
    const k = 2 / (p + 1);
    let ema = [data[0]];
    for(let i=1; i<data.length; i++) ema.push(data[i]*k + ema[i-1]*(1-k));
    return ema;
  };

  const ema12 = calcEMA(closePrices, 12);
  const ema26 = calcEMA(closePrices, 26);
  const macd = ema12.map((v, i) => v - ema26[i]);
  const signal = calcEMA(macd, 9);
  const hist = macd[macd.length-1] - signal[signal.length-1];
  const prevHist = macd[macd.length-2] - signal[signal.length-2];

  return { hist, crossUp: prevHist < 0 && hist > 0, crossDown: prevHist > 0 && hist < 0 };
};

// 綜合 SMC 策略信號
const generateAdvancedSignal = (klines, currentPrice, fundingRate) => {
  if (!klines || klines.length < 60) return null;
  const vp = calculateVolumeProfile(klines);
  const sweep = detectLiquiditySweep(klines);
  const flow = analyzeOrderFlow(klines);
  const macd = calculateMACD(klines);
  const avwap = klines.reduce((acc, k) => acc + (k.high + k.low + k.close)/3 * k.volume, 0) / klines.reduce((acc, k) => acc + k.volume, 0);

  let score = 0;
  let analysisLog = [];

  // 1. 流動性獵取 (最高權重)
  if (sweep.sweepLong) { score += 4; analysisLog.push("流動性：獵殺近期低點止損後強力回抽 (機構吸籌)"); }
  if (sweep.sweepShort) { score -= 4; analysisLog.push("流動性：獵殺近期高點止損後強力壓回 (機構派發)"); }

  // 2. 訂單流與 FVG
  if (flow.fvgUp) { score += 2; analysisLog.push("訂單流：出現看漲合理價值缺口 (FVG)"); }
  if (flow.fvgDown) { score -= 2; analysisLog.push("訂單流：出現看跌合理價值缺口 (FVG)"); }
  if (flow.aggressiveBuy) { score += 1.5; analysisLog.push("訂單流：主動買盤力量爆發 (Aggressive Buy)"); }
  if (flow.aggressiveSell) { score -= 1.5; analysisLog.push("訂單流：主動賣盤力量爆發 (Aggressive Sell)"); }

  // 3. 成交量分佈
  if (currentPrice > vp.vah) { score += 1; analysisLog.push("分佈：突破價值區上緣 (VAH)，進入強勢區"); }
  else if (currentPrice < vp.val) { score -= 1; analysisLog.push("分佈：跌破價值區下緣 (VAL)，進入弱勢區"); }
  
  // 4. 動能與成本
  if (macd.hist > 0) score += 0.5; else score -= 0.5;
  if (currentPrice > avwap) score += 1; else score -= 1;

  // 5. 資金費率判定
  const fr = parseFloat(fundingRate || 0);
  if (fr > 0.0005) { score -= 1; analysisLog.push("情緒：資金費率過高，多頭擁擠具多殺多風險"); }
  else if (fr < -0.0002) { score += 1; analysisLog.push("情緒：空頭擁擠，具備軋空引擎動力"); }

  let signal = 'NEUTRAL';
  if (score >= 5) signal = 'LONG';
  else if (score <= -5) signal = 'SHORT';

  return { signal, score, analysisLog, poc: vp.poc, avwap, vah: vp.vah, val: vp.val };
};

// ==========================================
// 加密貨幣：行情與分析元件 (Crypto Components)
// ==========================================

function CryptoMarketCard({ ticker, signalData, onSelectCoin }) {
  const change = parseFloat(ticker.priceChangePercent);
  const isPositive = change >= 0;
  return (
    <div onClick={() => window.location.hash = `#/crypto/trade/${ticker.symbol}`} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between shadow-md group">
      <div>
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-bold text-slate-100 text-lg group-hover:text-blue-400 transition-colors">{ticker.symbol.replace('USDT','')} <span className="text-xs text-slate-500">USDT</span></h3>
            <div className="text-[10px] text-slate-500 font-mono">Vol: {formatVolume(ticker.quoteVolume)}</div>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-bold ${isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
            {isPositive ? '+' : ''}{change.toFixed(2)}%
          </div>
        </div>
        <div className="text-2xl font-mono font-bold text-white mt-2">${formatPrice(ticker.lastPrice)}</div>
      </div>
      
      {signalData && signalData.signal !== 'NEUTRAL' && (
        <div className={`mt-4 p-2 rounded border ${signalData.signal === 'LONG' ? 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]' : 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]'}`}>
          <div className="text-[10px] font-bold flex items-center gap-1"><Target className="w-3 h-3"/> SMC {signalData.signal} 信號</div>
          <div className="text-[9px] truncate opacity-80">{signalData.analysisLog[0]}</div>
        </div>
      )}
    </div>
  );
}

function CryptoDashboard({ allTickers, fundingRates, loading }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [signals, setSignals] = useState({});
  const [isScanning, setIsScanning] = useState(false);

  // 掃描前 50 名標的獲取 SMC 信號
  useEffect(() => {
    if (allTickers.length > 0 && !isScanning) {
      const scanSignals = async () => {
        setIsScanning(true);
        const newSignals = {};
        const targets = allTickers.slice(0, 40);
        for (const coin of targets) {
          try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=15m&limit=100`);
            const data = await res.json();
            const parsed = data.map(d => ({ high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), open: parseFloat(d[1]) }));
            const sig = generateAdvancedSignal(parsed, parseFloat(coin.lastPrice), fundingRates[coin.symbol]);
            if (sig) newSignals[coin.symbol] = sig;
          } catch(e) {}
        }
        setSignals(newSignals);
        setIsScanning(false);
      };
      scanSignals();
    }
  }, [allTickers.length]);

  const filtered = allTickers.filter(t => t.symbol.includes(searchTerm.toUpperCase())).slice(0, 100);

  if (loading && !allTickers.length) return <div className="text-center py-32 text-slate-500 animate-pulse"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取幣安合約市場數據中...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#121620] p-4 rounded-xl border border-[#2a2f3a] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg"><Bitcoin className="w-6 h-6 text-amber-500" /></div>
          <div><h2 className="text-xl font-bold text-white">虛擬貨幣合約市場</h2><p className="text-xs text-slate-400">{isScanning ? '正在掃描 SMC 機構信號...' : 'SMC 量化掃描完成'}</p></div>
        </div>
        <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input type="text" placeholder="搜尋幣種..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded-lg bg-[#0b0e14] text-white focus:border-blue-500 outline-none" /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map(t => <CryptoMarketCard key={t.symbol} ticker={t} signalData={signals[t.symbol]} onSelectCoin={() => {}} />)}
      </div>
    </div>
  );
}

// ==========================================
// 台股子系統 (原本的部分保留並修正)
// ==========================================

const TwKLineChart = ({ klines }) => {
  const containerRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  if (!klines || klines.length === 0) return <div className="h-[500px]" />;
  const visibleCount = 80, visibleKlines = klines.slice(-visibleCount);
  const width = 800, totalHeight = 580, priceHeight = 400, volTop = 440, volHeight = 120;
  const paddingX = 10, paddingY = 20;
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
      if (k[maKey] && k[maKey] >= minPrice && k[maKey] <= maxPrice) {
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
        const processed = calculateIndicators(klines);
        const resNews = await fetch(`/api/binance?action=news&symbol=${stock.symbol}`);
        if (isMounted) { setChartData(processed); setNews(await resNews.json()); setLoading(false); }
      } catch (e) { if (isMounted) setLoading(false); }
    };

    const fetchChips = async () => {
      try {
        const responses = await Promise.allSettled([
          fetch('https://openapi.twse.com.tw/v1/fund/T86'),
          fetch('https://openapi.twse.com.tw/v1/marginTransaction/MI_MARGN'),
          fetch('https://www.tpex.org.tw/openapi/v1/t1824'),
          fetch('https://www.tpex.org.tw/openapi/v1/t1820')
        ]);
        let foreign = null, trust = null, dealer = null, marginToday = null, marginYest = null, marginChange = null;
        for (const res of responses) {
            if (res.status === 'fulfilled' && res.value.ok) {
                const data = await res.value.json();
                const item = data.find(i => (i.Code || i.SecuritiesCompanyCode) === stock.symbol);
                if (item) {
                    if (res.value.url.includes('fund') || res.value.url.includes('t1824')) {
                        const getV = (ks) => { const k = Object.keys(item).find(x => ks.some(s => x.includes(s))); return k ? Math.round(parseFloat(item[k].toString().replace(/,/g,''))/1000) : 0; };
                        foreign = getV(['ForeignInvestorNet', 'ForeignDifference', 'InstitutionsNet']);
                        trust = getV(['InvestmentTrustNet', 'TrustDifference']);
                        dealer = getV(['DealerNet', 'DealerDifference']);
                    } else {
                        const getM = (ks) => { const k = Object.keys(item).find(x => ks.some(s => x.includes(s))); return k ? parseFloat(item[k].toString().replace(/,/g,'')) : 0; };
                        const today = getM(['TodayBalance', 'BalanceToday']);
                        const yest = getM(['YesterdayBalance', 'BalanceYesterday']);
                        marginToday = Math.round(today/1000); marginYest = Math.round(yest/1000); marginChange = marginToday - marginYest;
                    }
                }
            }
        }
        if (isMounted) setChipData({ loading: false, foreign, trust, dealer, marginToday, marginYest, marginChange });
      } catch (e) { if (isMounted) setChipData(p => ({ ...p, loading: false })); }
    };
    fetchData(); fetchChips(); return () => { isMounted = false; };
  }, [stock.symbol]);

  const latestData = chartData.length > 0 ? chartData[chartData.length - 1] : null;
  const prevData = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const formatDate = (ts) => ts ? `${new Date(ts).getMonth()+1}/${new Date(ts).getDate()}` : '';

  return (
    <div className="animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-6 rounded-2xl border border-[#2a2f3a] shadow-lg relative overflow-hidden">
            <h2 className="text-3xl font-black text-white mb-1">{stock.name} <span className="text-lg font-normal text-slate-500 ml-1">{stock.symbol}</span></h2>
            <div className="flex items-end gap-3 mt-4">
              <div className={`text-4xl font-mono font-bold ${parseFloat(stock.priceChangePercent) >= 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{stock.lastPrice}</div>
              <div className={`text-lg font-bold pb-1 ${parseFloat(stock.priceChangePercent) >= 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{parseFloat(stock.priceChangePercent) >= 0 ? '+' : ''}{stock.priceChangePercent}%</div>
            </div>
          </div>
          {!loading && (
            <>
              <div className="bg-[#121620] rounded-2xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><Target className="w-4 h-4 text-blue-500" /> 技術指標分析</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330]">
                      <div className="text-[10px] text-slate-500 font-bold mb-1 text-center">RSI (14)</div>
                      <div className={`text-lg font-mono font-black text-center ${latestData?.rsi > 70 ? 'text-[#f6465d]' : latestData?.rsi < 30 ? 'text-[#0ecb81]' : 'text-slate-200'}`}>{latestData?.rsi?.toFixed(1) || '--'}</div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330]">
                      <div className="text-[10px] text-slate-500 font-bold mb-1 text-center">MACD</div>
                      <div className={`text-lg font-mono font-black text-center ${latestData?.macd?.hist > 0 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>{latestData?.macd?.hist?.toFixed(1) || '--'}</div>
                    </div>
                    <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330]">
                      <div className="text-[10px] text-slate-500 font-bold mb-1 text-center">KD (K)</div>
                      <div className="text-lg font-mono font-black text-amber-400 text-center">{latestData?.kd?.k?.toFixed(1) || '--'}</div>
                    </div>
                  </div>
              </div>
              <div className="bg-[#121620] rounded-2xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-500" /> 真實籌碼趨勢</h3>
                  {chipData.loading ? <div className="py-6 flex justify-center"><RefreshCw className="animate-spin text-slate-600" /></div> : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead><tr className="text-slate-500 border-b border-[#2a2f3a]"><th className="pb-2">指標 (張)</th><th className="pb-2 text-right">今日 ({formatDate(latestData?.time)})</th><th className="pb-2 text-right">前日 ({formatDate(prevData?.time)})</th></tr></thead>
                        <tbody className="divide-y divide-[#2a2f3a]/50 text-white font-mono">
                          <tr><td className="py-2 text-slate-400">外資</td><td className={`text-right ${chipData.foreign>0?'text-[#f6465d]':'text-[#0ecb81]'}`}>{chipData.foreign||'--'}</td><td className="text-right text-slate-600">--</td></tr>
                          <tr><td className="py-2 text-slate-400">投信</td><td className={`text-right ${chipData.trust>0?'text-[#f6465d]':'text-[#0ecb81]'}`}>{chipData.trust||'--'}</td><td className="text-right text-slate-600">--</td></tr>
                          <tr><td className="py-2 text-slate-400">融資</td><td className="text-right">{chipData.marginToday||'--'} <span className={chipData.marginChange>0?'text-[#f6465d]':'text-[#0ecb81]'}>({chipData.marginChange>0?'+':''}{chipData.marginChange})</span></td><td className="text-right text-slate-400">{chipData.marginYest||'--'}</td></tr>
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
          <div className="bg-[#121620] rounded-2xl p-5 border border-[#2a2f3a] shadow-lg">
             <h3 className="text-lg font-bold text-white mb-4">個股最新新聞</h3>
             <div className="space-y-3">{news.slice(0,5).map((n, i) => (
               <a key={i} href={n.link} target="_blank" className="block p-3 rounded-xl hover:bg-[#1a1e27] border border-transparent hover:border-[#2a2f3a] transition-all group">
                 <h4 className="text-sm font-bold text-slate-200 group-hover:text-blue-400 line-clamp-1">{n.title}</h4>
                 <div className="text-[10px] text-slate-500 mt-1">{n.publisher}</div>
               </a>
             ))}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TwStocksDashboard({ twStocks, loading, error }) {
  const [searchTerm, setSearchTerm] = useState('');
  const filtered = useMemo(() => {
    if (!searchTerm) return twStocks.slice(0, 200);
    return twStocks.filter(t => t.symbol.includes(searchTerm) || t.name.includes(searchTerm)).slice(0, 300);
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
            <p className="text-slate-400 mb-6">點擊下方直接進入代號 「{searchTerm}」 的 SMC 深度分析系統。</p>
            <button onClick={() => window.location.hash = `#/tw-stocks/detail/${searchTerm}`} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold transition-all">進入分析系統</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map(stock => (
          <div key={stock.symbol} onClick={() => window.location.hash = `#/tw-stocks/detail/${stock.symbol}`} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between shadow-md group">
            <div className="flex justify-between items-start mb-2">
              <div><h3 className="font-bold text-slate-100 text-lg group-hover:text-blue-400 transition-colors">{stock.name}</h3><div className="text-xs text-slate-500 mt-0.5 font-mono">{stock.symbol}</div></div>
              <div className={`px-2 py-1 rounded text-xs font-bold ${parseFloat(stock.priceChangePercent)>=0?'bg-[#f6465d]/10 text-[#f6465d]':'bg-[#0ecb81]/10 text-[#0ecb81]'}`}>{parseFloat(stock.priceChangePercent)>=0?'+':''}{stock.priceChangePercent}%</div>
            </div>
            <div className="mt-4">
              <div className={`text-2xl font-mono font-bold ${parseFloat(stock.priceChangePercent)>=0?'text-[#f6465d]':'text-[#0ecb81]'}`}>{stock.lastPrice}</div>
              <div className="text-[10px] text-slate-500 mt-1">量: {formatVolume(stock.quoteVolume)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortalPage() {
  const cards = [
    { id: 'crypto', title: '虛擬貨幣量化 SMC', desc: '幣安合約真實數據，提供機構級 SMC 訊號 (Liquidity Sweep, FVG, POC) 與模擬下單。', icon: <Bitcoin className="w-12 h-12 text-[#f7931a]" />, color: 'from-[#f7931a]/20 to-[#f7931a]/5', route: '#/crypto/home' },
    { id: 'tw-stocks', title: '台股與 ETF 分析', desc: '整合上市、上櫃及全台 ETF，提供歷史 K 線、技術指標及盤後真實籌碼。', icon: <LineChart className="w-12 h-12 text-[#3b82f6]" />, color: 'from-[#3b82f6]/20 to-[#3b82f6]/5', route: '#/tw-stocks' },
    { id: 'news', title: '24H 真實熱點新聞', desc: '即時串接全球財經新聞，精準捕捉市場風向變化。', icon: <Newspaper className="w-12 h-12 text-[#10b981]" />, color: 'from-[#10b981]/20 to-[#10b981]/5', route: '#/news' }
  ];
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-10">
      <div className="text-center mb-12 animate-in fade-in zoom-in-95">
        <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-full mb-4 ring-1 ring-blue-500/30"><Globe className="w-8 h-8 text-blue-400" /></div>
        <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">SMC <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">PRO MAX</span></h1>
        <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base">專業機構級金融數據量化平台。</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl px-4">
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

// --- 主要 App 組件 ---
export default function App() {
  const [currentRoute, setCurrentRoute] = useState('portal');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [twStocks, setTwStocks] = useState([]);
  const [loadingTw, setLoadingTw] = useState(true);
  const [allTickers, setAllTickers] = useState([]);
  const [fundingRates, setFundingRates] = useState({});
  const [loadingCrypto, setLoadingCrypto] = useState(true);
  const [selectedTwStock, setSelectedTwStock] = useState(null);
  const [isStylesLoaded, setIsStylesLoaded] = useState(false);

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const s = document.createElement('script'); s.id = 'tailwind-cdn'; s.src = 'https://cdn.tailwindcss.com';
      s.onload = () => setIsStylesLoaded(true); document.head.appendChild(s);
    } else setIsStylesLoaded(true);
  }, []);

  // 抓取全台股清單 (含 ETF)
  useEffect(() => {
    let isMounted = true;
    const fetchList = async () => {
      try {
        const [resTse, resOtc] = await Promise.all([
          fetch('/api/binance?action=tw-stocks').then(r => r.json()),
          fetch('https://www.tpex.org.tw/openapi/v1/t1820').then(r => r.json()).catch(() => [])
        ]);
        const formattedTse = resTse.map(i => {
           const current = parseFloat(i.ClosingPrice);
           const change = parseFloat(i.Change?.toString().replace('+','') || '0');
           const pct = current !== 0 ? (change / (current - change)) * 100 : 0;
           return { symbol: i.Code, name: i.Name, lastPrice: current.toFixed(2), priceChangePercent: pct.toFixed(2), quoteVolume: parseInt(i.TradeVolume) || 0 };
        });
        const formattedOtc = resOtc.map(i => ({ symbol: i.SecuritiesCompanyCode, name: i.CompanyName || i.SecuritiesCompanyName, lastPrice: i.Close || '0.00', priceChangePercent: '0.00', quoteVolume: parseInt(i.Volume) || 0 }));
        const combined = [...formattedTse, ...formattedOtc]
          .filter(i => /^[0-9A-Z]{4,6}$/.test(i.symbol))
          .sort((a,b) => b.quoteVolume - a.quoteVolume);
        if (isMounted) { setTwStocks(combined); setLoadingTw(false); }
      } catch (e) { if (isMounted) setLoadingTw(false); }
    };
    fetchList(); return () => { isMounted = false; };
  }, []);

  // 抓取加密市場
  const fetchCryptoMarkets = async () => {
    try {
      const res = await fetch('/api/binance?action=overview');
      const data = await res.json();
      setAllTickers(data.tickers.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)));
      const frMap = {}; data.fundingRates.forEach(i => { frMap[i.symbol] = i.lastFundingRate; }); setFundingRates(frMap);
      setLoadingCrypto(false);
    } catch(e) {}
  };

  useEffect(() => { 
    fetchCryptoMarkets(); 
    const i = setInterval(fetchCryptoMarkets, 10000); 
    return () => clearInterval(i); 
  }, []);

  // 路由管理
  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace('#/', '');
      if (!h || h === 'portal') setCurrentRoute('portal');
      else if (h === 'tw-stocks') setCurrentRoute('tw_stocks');
      else if (h === 'crypto/home') setCurrentRoute('crypto_home');
      else if (h.startsWith('tw-stocks/detail/')) {
          const s = h.replace('tw-stocks/detail/', '');
          const c = twStocks.find(t => t.symbol === s);
          setSelectedTwStock(c || { symbol: s, name: '自訂標的', lastPrice: '--', priceChangePercent: '0.00' });
          setCurrentRoute('tw_stock_detail');
      }
    };
    handleHash(); window.addEventListener('hashchange', handleHash); return () => window.removeEventListener('hashchange', handleHash);
  }, [twStocks]);

  if (!isStylesLoaded) return <div className="h-screen bg-[#0b0e14] flex items-center justify-center text-white font-mono">LOADING ASSETS...</div>;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans">
      <header className="bg-[#121620]/95 backdrop-blur border-b border-[#2a2f3a] sticky top-0 z-20 h-16 shadow-xl flex items-center px-4 justify-between">
        <div className="flex items-center gap-4">
          <button className="sm:hidden p-2" onClick={() => setIsMobileMenuOpen(true)}><Menu className="w-6 h-6" /></button>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.hash = '#/portal'}>
            <Globe className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold hidden sm:block tracking-tighter">SMC <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">PRO MAX</span></h1>
          </div>
          {currentRoute !== 'portal' && (
            <nav className="hidden sm:flex gap-2 ml-6 border-l border-white/10 pl-6">
              <button onClick={() => window.location.hash = currentRoute.includes('tw') ? '#/tw-stocks' : '#/crypto/home'} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-400 hover:text-white transition-all text-sm font-bold"><ArrowLeft className="w-4 h-4"/> 返回清單</button>
            </nav>
          )}
        </div>
        <div className="text-xs font-bold px-3 py-1.5 bg-[#2a2f3a] rounded text-slate-300">{currentRoute === 'portal' ? '系統入口' : currentRoute.includes('tw') ? '台股分析' : '加密分析'}</div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-64 bg-[#121620] border-r border-[#2a2f3a] p-4 flex flex-col gap-2 animate-in slide-in-from-left duration-200">
            <div className="flex justify-between items-center mb-6"><span className="font-bold text-blue-400">SMC導覽</span><button onClick={() => setIsMobileMenuOpen(false)}><X className="w-6 h-6" /></button></div>
            <button onClick={() => { window.location.hash = '#/portal'; setIsMobileMenuOpen(false); }} className="p-4 rounded-xl font-bold text-left hover:bg-white/5">首頁入口</button>
            <button onClick={() => { window.location.hash = '#/crypto/home'; setIsMobileMenuOpen(false); }} className="p-4 rounded-xl font-bold text-left hover:bg-white/5">虛擬貨幣分析</button>
            <button onClick={() => { window.location.hash = '#/tw-stocks'; setIsMobileMenuOpen(false); }} className="p-4 rounded-xl font-bold text-left hover:bg-white/5">台股與 ETF</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {currentRoute === 'portal' && <PortalPage />}
        {currentRoute === 'tw_stocks' && <TwStocksDashboard twStocks={twStocks} loading={loadingTw} />}
        {currentRoute === 'tw_stock_detail' && selectedTwStock && <TwStockWorkspace stock={selectedTwStock} />}
        {currentRoute === 'crypto_home' && <CryptoDashboard allTickers={allTickers} fundingRates={fundingRates} loading={loadingCrypto} />}
      </main>
    </div>
  );
}
