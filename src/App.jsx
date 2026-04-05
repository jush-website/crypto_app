import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  RefreshCw, 
  ArrowLeft, 
  Search,
  Target,
  AlertCircle,
  Zap,
  Crosshair,
  Wallet,
  PieChart,
  ZoomIn,         
  ZoomOut,        
  RotateCcw,      
  MoveHorizontal, 
  Pencil,         
  Trash2,
  X,              
  Layers,          
  Clock,
  Plus,
  Minus,
  Activity,
  Briefcase,
  BarChart2,
  Waves 
} from 'lucide-react';

// --- 輔助函數 ---
const formatPrice = (price) => {
  const p = parseFloat(price);
  if (isNaN(p)) return '0.00';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
};

const formatVolume = (vol) => {
  const v = parseFloat(vol);
  if (isNaN(v)) return '0.00';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
};

const formatFundingRate = (rate) => {
  if (rate === undefined || rate === null) return '--';
  return (parseFloat(rate) * 100).toFixed(4) + '%';
};

// --- 進階量化分析計算 (SMC / Order Flow / Volume Profile) ---

const calculateVolumeProfile = (klines, bins = 20) => {
  if (!klines || klines.length === 0) return { poc: 0, bins: [] };
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const step = (max - min) / bins;
  const profile = Array(bins).fill(0).map((_, i) => ({ price: min + step * i, volume: 0 }));
  klines.forEach(k => {
    const index = Math.min(bins - 1, Math.floor((k.close - min) / (step || 1)));
    profile[index].volume += k.volume;
  });
  let maxVol = 0; let poc = 0;
  profile.forEach(p => { if (p.volume > maxVol) { maxVol = p.volume; poc = p.price; } });
  return { poc, profile };
};

const calculateAVWAP = (klines) => {
  if (!klines || klines.length === 0) return 0;
  let totalPV = 0; let totalV = 0;
  klines.forEach(k => { totalPV += ((k.high + k.low + k.close) / 3) * k.volume; totalV += k.volume; });
  return totalV === 0 ? 0 : totalPV / totalV;
};

const detectLiquiditySweep = (klines) => {
  if (klines.length < 21) return { sweepLong: false, sweepShort: false };
  const lastK = klines[klines.length - 1];
  const prevKlines = klines.slice(-21, -1);
  const localHigh = Math.max(...prevKlines.map(k => k.high));
  const localLow = Math.min(...prevKlines.map(k => k.low));
  const sweepLong = lastK.low < localLow && lastK.close > localLow;
  const sweepShort = lastK.high > localHigh && lastK.close < localHigh;
  return { sweepLong, sweepShort, localHigh, localLow };
};

const analyzeOrderFlow = (klines) => {
  const lastK = klines[klines.length - 1];
  const bodySize = Math.abs(lastK.close - lastK.open);
  const upperWick = lastK.high - Math.max(lastK.open, lastK.close);
  const lowerWick = Math.min(lastK.open, lastK.close) - lastK.low;
  const avgVol = klines.slice(-10).reduce((a, b) => a + b.volume, 0) / 10;
  const isAbsorption = lastK.volume > avgVol * 1.5 && bodySize < (upperWick + lowerWick);
  const isAggressiveBuy = lastK.close > lastK.open && upperWick < bodySize * 0.1;
  const isAggressiveSell = lastK.close < lastK.open && lowerWick < bodySize * 0.1;
  return { isAbsorption, isAggressiveBuy, isAggressiveSell };
};

const generateAdvancedSignal = (klines, currentPrice, fundingRate) => {
  if (!klines || klines.length < 50) return null;
  const { poc } = calculateVolumeProfile(klines);
  const avwap = calculateAVWAP(klines);
  const sweep = detectLiquiditySweep(klines);
  const flow = analyzeOrderFlow(klines);
  const fr = parseFloat(fundingRate || 0);

  let signal = 'NEUTRAL';
  let score = 0;
  let analysisLog = [];

  if (currentPrice > avwap) { score += 1; analysisLog.push("AVWAP：價格位於平均成本之上 (+1)"); }
  else { score -= 1; analysisLog.push("AVWAP：價格位於平均成本之下 (-1)"); }

  if (currentPrice > poc) { score += 1; analysisLog.push("POC：站穩成交密集區支撐 (+1)"); }
  else { score -= 1; analysisLog.push("POC：處於成交密集區壓力位 (-1)"); }

  if (sweep.sweepLong) { score += 4; analysisLog.push("Sweep：低點獵取洗盤完成 (+4)"); }
  if (sweep.sweepShort) { score -= 4; analysisLog.push("Sweep：高點流動性獵取跡象 (-4)"); }

  if (flow.isAggressiveBuy) { score += 2; analysisLog.push("Order Flow：買盤侵略性強 (+2)"); }
  if (flow.isAggressiveSell) { score -= 2; analysisLog.push("Order Flow：賣盤侵略性強 (-2)"); }

  if (fr > 0.0006) { score -= 1.5; analysisLog.push("FR：情緒過熱風險 (-1.5)"); }
  else if (fr < -0.0002) { score += 1.5; analysisLog.push("FR：具備軋空潛力 (+1.5)"); }

  if (score >= 4) signal = 'LONG';
  else if (score <= -4) signal = 'SHORT';
  const confidence = Math.min(Math.round(40 + (Math.abs(score) * 8)), 98);

  return { signal, score, currentPrice, confidence, analysisLog, poc, avwap };
};

// --- 組件：TradeForm ---
function TradeForm({ symbol, currentPrice, balance, onOpenPosition }) {
  const [leverage, setLeverage] = useState(10);
  const [marginMode, setMarginMode] = useState('ISOLATED'); 
  const [inputValue, setInputValue] = useState(''); 
  const [tradeError, setTradeError] = useState('');

  const val = parseFloat(inputValue) || 0;
  const coinSize = currentPrice > 0 ? (val * leverage) / currentPrice : 0;
  let liqLong = currentPrice * (1 - 1/leverage + 0.004);
  let liqShort = currentPrice * (1 + 1/leverage - 0.004);

  const handleSliderChange = (e) => {
    const pct = parseFloat(e.target.value);
    setInputValue(balance > 0 ? (balance * (pct / 100)).toFixed(2) : '0');
  };

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
        <input type="range" min="0" max="100" value={balance > 0 ? Math.min(100, (val / balance) * 100) : 0} onChange={handleSliderChange} className="w-full accent-blue-500 h-1 bg-[#2a2f3a] rounded-lg appearance-none cursor-pointer" />
        <div className="flex justify-between text-[10px] text-slate-500 mt-1">
          {[25, 50, 75, 100].map(p => <span key={p} className="cursor-pointer" onClick={() => handleSliderChange({target:{value:p}})}>{p}%</span>)}
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

// --- 獨立持倉卡片 ---
function PositionCard({ pos, currentPrice, balance, onSelectCoin, onClose, onAdjust }) {
  const [activeModal, setActiveModal] = useState(null); 
  const [adjustInput, setAdjustInput] = useState('');
  const pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
  const roe = (pnl / pos.margin) * 100;
  const isProfit = pnl >= 0;

  return (
    <div className={`bg-[#121620] border ${isProfit ? 'border-[#0ecb81]/30' : 'border-[#f6465d]/30'} rounded-xl p-4 flex flex-col shadow-lg`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-black text-white cursor-pointer hover:text-blue-400" onClick={() => onSelectCoin({symbol: pos.symbol})}>{pos.symbol}</h3>
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
            <button onClick={() => { onAdjust(activeModal, parseFloat(adjustInput)); setActiveModal(null); setAdjustInput(''); }} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded">確認</button>
          </div>
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

// --- 獨立行情報價卡片 ---
function MarketCard({ ticker, fundingRate, signalData, onSelectCoin }) {
  const change = parseFloat(ticker.priceChangePercent);
  const isPositive = change >= 0;
  return (
    <div onClick={() => onSelectCoin(ticker.symbol)} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-lg p-4 cursor-pointer transition-all flex flex-col shadow-md">
      <div className="flex justify-between mb-1">
        <h3 className="font-bold text-slate-100">{ticker.symbol.replace('USDT', '')}</h3>
        <div className={`text-xs font-bold ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{isPositive ? '+' : ''}{change.toFixed(2)}%</div>
      </div>
      <div className="text-[10px] text-slate-500 mb-2 font-mono">Vol: {formatVolume(ticker.quoteVolume)}</div>
      <div className="text-lg font-mono font-semibold text-white mb-2">${formatPrice(ticker.lastPrice)}</div>
      {signalData && signalData.signal !== 'NEUTRAL' && (
        <div className={`mt-2 text-[10px] p-2 rounded border ${signalData.signal === 'LONG' ? 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]' : 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]'}`}>
          <div className="font-bold flex items-center gap-1"><Target className="w-3 h-3"/> AI {signalData.timeframe}: {signalData.signal}</div>
          <div className="truncate opacity-80">{signalData.analysisLog[0]}</div>
        </div>
      )}
    </div>
  );
}

// --- K線圖組件 (SMC 圖層) ---
const AdvancedKLineChart = ({ klines, signalData }) => {
  const containerRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(60); 
  const [endIndexOffset, setEndIndexOffset] = useState(0); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  useEffect(() => {
    const container = containerRef.current; if (!container || !klines?.length) return;
    const handleWheel = (e) => {
      e.preventDefault(); 
      let n = Math.max(15, Math.min(Math.round(visibleCount * (e.deltaY > 0 ? 1.1 : 0.9)), klines.length));
      setVisibleCount(n);
      setEndIndexOffset(prev => Math.min(prev, klines.length - n));
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [visibleCount, klines?.length]);

  if (!klines?.length) return null;
  const dataLen = klines.length;
  const safeOffset = Math.min(Math.max(0, endIndexOffset), dataLen - visibleCount);
  const visibleKlines = klines.slice(Math.max(0, dataLen - visibleCount - safeOffset), dataLen - safeOffset);
  const width = 800; const totalHeight = 500; const kLineHeight = 350;
  const paddingX = 10; const xStep = (width - paddingX * 2) / visibleKlines.length;
  const lows = visibleKlines.map(k => k.low); const highs = visibleKlines.map(k => k.high);
  const minPrice = Math.min(...lows); const maxPrice = Math.max(...highs);
  const getPriceY = (p) => kLineHeight - 20 - ((p - minPrice) / ((maxPrice - minPrice) || 1)) * (kLineHeight - 40);

  return (
    <div ref={containerRef} className="w-full h-[500px] overflow-hidden cursor-crosshair relative" onMouseMove={(e) => {
      if (isDragging) {
        const dx = e.clientX - dragStartX;
        if (Math.abs(dx) > 5) { setEndIndexOffset(prev => Math.max(0, Math.min(prev + Math.round(dx / 5), dataLen - visibleCount))); setDragStartX(e.clientX); }
      } else {
        const rect = containerRef.current.getBoundingClientRect();
        setHoveredIndex(Math.floor(((e.clientX - rect.left) * (width / rect.width) - paddingX) / xStep));
      }
    }} onMouseDown={(e) => { setIsDragging(true); setDragStartX(e.clientX); }} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setHoveredIndex(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="font-mono">
        <line x1="0" y1={kLineHeight} x2={width} y2={kLineHeight} stroke="#2a2f3a" />
        {signalData?.poc && <><line x1="0" y1={getPriceY(signalData.poc)} x2={width} y2={getPriceY(signalData.poc)} stroke="#3b82f6" strokeDasharray="5 5" opacity="0.5" /><text x={5} y={getPriceY(signalData.poc) - 5} fill="#3b82f6" fontSize="9">POC</text></>}
        {visibleKlines.map((k, i) => {
          const x = paddingX + i * xStep; const isUp = k.close >= k.open; const color = isUp ? '#0ecb81' : '#f6465d';
          return (
            <g key={i}>
              <line x1={x + xStep/2} y1={getPriceY(k.high)} x2={x + xStep/2} y2={getPriceY(k.low)} stroke={color} strokeWidth="1" />
              <rect x={x + xStep*0.1} y={Math.min(getPriceY(k.open), getPriceY(k.close))} width={xStep*0.8} height={Math.max(1, Math.abs(getPriceY(k.open) - getPriceY(k.close)))} fill={color} />
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// --- 市場分析頁 ---
function Dashboard({ allTickers, fundingRates, loading }) {
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('dashboardTab') || 'ALL'); 
  const [timeframe, setTimeframe] = useState(() => sessionStorage.getItem('dashboardTF') || '15m');
  const [searchTerm, setSearchTerm] = useState('');
  const [aiSignals, setAiSignals] = useState({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0); 

  useEffect(() => {
    sessionStorage.setItem('dashboardTab', activeTab);
    sessionStorage.setItem('dashboardTF', timeframe);
  }, [activeTab, timeframe]);

  useEffect(() => {
    if (!loading && allTickers.length > 0) {
      const savedPos = sessionStorage.getItem('dashboardScroll');
      if (savedPos) { setTimeout(() => { window.scrollTo({ top: parseInt(savedPos), behavior: 'auto' }); sessionStorage.removeItem('dashboardScroll'); }, 150); }
    }
  }, [loading, allTickers.length]);

  useEffect(() => {
    let isMounted = true; if (!allTickers.length) return;
    const scan = async () => {
      setIsScanning(true); setScanProgress(0); setAiSignals({});
      const targets = allTickers.slice(0, 150); const batch = 15;
      for (let i = 0; i < targets.length; i += batch) {
        if (!isMounted) return;
        const chunk = targets.slice(i, i + batch);
        const results = await Promise.all(chunk.map(async (coin) => {
          try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${timeframe}&limit=80`);
            const data = await res.json();
            const parsed = data.map(d => ({ open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }));
            const sig = generateAdvancedSignal(parsed, parseFloat(coin.lastPrice), fundingRates[coin.symbol]);
            return sig && sig.signal !== 'NEUTRAL' ? { s: coin.symbol, sig: {...sig, timeframe} } : null;
          } catch(e) { return null; }
        }));
        if (isMounted) {
          const valid = results.filter(r => r);
          if (valid.length) setAiSignals(prev => { 
            const n = {...prev}; valid.forEach(v => n[v.s] = v.sig); return n; 
          });
          setScanProgress(Math.min(100, Math.round(((i + batch) / targets.length) * 100)));
        }
        await new Promise(r => setTimeout(r, 200));
      }
      if (isMounted) setIsScanning(false);
    };
    scan(); return () => { isMounted = false; };
  }, [allTickers.length > 0, timeframe]);

  if (loading && !allTickers.length) return <div className="text-center py-32 text-slate-500 animate-pulse"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 初始化市場數據...</div>;

  let filtered = allTickers;
  if (activeTab === 'LONG') filtered = allTickers.filter(t => aiSignals[t.symbol]?.signal === 'LONG');
  else if (activeTab === 'SHORT') filtered = allTickers.filter(t => aiSignals[t.symbol]?.signal === 'SHORT');
  if (searchTerm) filtered = filtered.filter(t => t.symbol.includes(searchTerm.toUpperCase()));
  filtered = filtered.slice(0, 150);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sticky top-[64px] z-10 py-3 bg-[#0b0e14]/95 backdrop-blur border-b border-[#2a2f3a]/50">
          <div className="flex flex-wrap gap-2">
              <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a]">
                  {['ALL', 'LONG', 'SHORT'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-1.5 text-xs rounded transition-all ${activeTab === t ? 'bg-blue-600 text-white font-bold' : 'text-slate-400'}`}>
                      {t === 'ALL' ? '全部' : t === 'LONG' ? '做多推薦' : '做空推薦'}
                    </button>
                  ))}
              </div>
              {(activeTab === 'LONG' || activeTab === 'SHORT') && (
                  <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a]">
                      {['15m', '1h', '4h'].map(tf => (
                        <button key={tf} onClick={() => setTimeframe(tf)} className={`px-3 py-1.5 text-xs rounded transition-all ${timeframe === tf ? 'bg-amber-600/20 text-amber-500 font-bold' : 'text-slate-500'}`}>{tf}</button>
                      ))}
                  </div>
              )}
          </div>
          <div className="flex items-center gap-4 w-full xl:w-auto">
              {isScanning && <div className="text-xs text-blue-400 flex items-center gap-2"><RefreshCw className="w-3 h-3 animate-spin" /> {timeframe} 掃描中 {scanProgress}%</div>}
              <div className="relative flex-1 xl:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input type="text" placeholder="搜尋幣種..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white focus:border-blue-500 outline-none" /></div>
          </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {filtered.map(t => <MarketCard key={t.symbol} ticker={t} signalData={aiSignals[t.symbol]} onSelectCoin={(s) => window.location.hash = `#/trade/${s}`} />)}
      </div>
    </div>
  );
}

// --- 持倉與管理頁 ---
function PositionsPage({ allTickers, paperAccount, openPosition, closePosition, adjustPosition }) {
  const activeSymbols = [...new Set(paperAccount.positions.map(p => p.symbol))];
  const activeTickers = allTickers.filter(t => activeSymbols.includes(t.symbol));
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <h2 className="text-xl font-bold text-white flex items-center gap-2"><Layers className="w-6 h-6 text-blue-500" /> 當前持倉</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {paperAccount.positions.map(pos => <PositionCard key={pos.id} pos={pos} currentPrice={parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice)} balance={paperAccount.balance} onSelectCoin={c => window.location.hash = `#/trade/${c.symbol}`} onClose={() => closePosition(pos.id, parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice))} onAdjust={(t, v) => adjustPosition(pos.id, t, v, parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice))} />)}
      </div>
      {activeTickers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeTickers.map(t => <div key={t.symbol} className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg"><h3 className="font-bold text-white mb-4">{t.symbol} 快捷下單</h3><TradeForm symbol={t.symbol} currentPrice={parseFloat(t.lastPrice)} balance={paperAccount.balance} onOpenPosition={openPosition} /></div>)}
        </div>
      )}
    </div>
  );
}

// --- 資產中心頁 ---
function AssetsPage({ paperAccount, allTickers }) {
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

// --- 交易詳情頁 (多週期分析) ---
function TradingWorkspace({ coin, fundingRate, paperAccount, openPosition, closePosition, adjustPosition }) {
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
          const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${tf}&limit=100`);
          const data = await res.json();
          const parsed = data.map(d => ({ open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), time: d[0] }));
          if (tf === '15m') setKlines(parsed);
          signals[tf] = generateAdvancedSignal(parsed, parseFloat(coin.lastPrice), fundingRate);
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
      <button onClick={() => window.location.hash = '#/home'} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded border border-[#2a2f3a]"><ArrowLeft className="w-4 h-4" /> 返回市場</button>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg">
            <h2 className="text-3xl font-black text-white">{coin.symbol.replace('USDT','')} <span className="text-sm font-normal text-slate-500">USDT</span></h2>
            <div className="text-3xl font-mono font-bold text-white mt-2">${formatPrice(currentPrice)}</div>
          </div>
          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg"><TradeForm symbol={coin.symbol} currentPrice={currentPrice} balance={paperAccount.balance} onOpenPosition={openPosition} /></div>
          
          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2"><Waves className="w-4 h-4 text-amber-500" /> 多週期 SMC 解析</h3>
              {['15m', '1h', '4h'].map(tf => {
                const sig = multiSignals[tf];
                return (
                  <div key={tf} className="bg-[#0b0e14] p-3 rounded border border-[#1e2330]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-slate-400 font-bold">{tf} 週期</span>
                      <span className={`text-xs font-black ${sig?.signal === 'LONG' ? 'text-[#0ecb81]' : sig?.signal === 'SHORT' ? 'text-[#f6465d]' : 'text-slate-500'}`}>{sig?.signal || 'WAITING...'}</span>
                    </div>
                    {sig?.analysisLog && <div className="text-[10px] text-slate-500 truncate">{sig.analysisLog[0]}</div>}
                  </div>
                );
              })}
          </div>
        </div>
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-xl p-1 border border-[#2a2f3a] shadow-lg"><AdvancedKLineChart klines={klines} signalData={multiSignals['15m']} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paperAccount.positions.filter(p => p.symbol === coin.symbol).map(pos => <PositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(t,v) => adjustPosition(pos.id,t,v,currentPrice)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- 應用程式進入點與 Router ---
export default function App() {
  const [isStylesLoaded, setIsStylesLoaded] = useState(false);
  const [allTickers, setAllTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fundingRates, setFundingRates] = useState({});
  const [currentRoute, setCurrentRoute] = useState('home');
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [paperAccount, setPaperAccount] = useState(() => { try { const s = localStorage.getItem('paperAccount'); return s ? JSON.parse(s) : { balance: 10000, positions: [], history: [] }; } catch(e) { return { balance: 10000, positions: [], history: [] }; } });

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const s = document.createElement('script'); s.id = 'tailwind-cdn'; s.src = 'https://cdn.tailwindcss.com';
      s.onload = () => setIsStylesLoaded(true); document.head.appendChild(s);
    } else { setIsStylesLoaded(true); }
  }, []);

  useEffect(() => { localStorage.setItem('paperAccount', JSON.stringify(paperAccount)); }, [paperAccount]);

  const fetchMarkets = async () => {
    try {
      const [tRes, fRes] = await Promise.all([fetch('https://fapi.binance.com/fapi/v1/ticker/24hr'), fetch('https://fapi.binance.com/fapi/v1/premiumIndex')]);
      const tData = await tRes.json(); const fData = await fRes.json();
      setAllTickers(tData.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)));
      const frMap = {}; fData.forEach(i => { frMap[i.symbol] = i.lastFundingRate; }); setFundingRates(frMap);
    } catch(e) {} finally { setLoading(false); }
  };

  useEffect(() => { fetchMarkets(); const i = setInterval(fetchMarkets, 8000); return () => clearInterval(i); }, []);

  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace('#/', '');
      if (!h || h === 'home') { setCurrentRoute('home'); setSelectedCoin(null); }
      else if (h === 'positions') { setCurrentRoute('positions'); setSelectedCoin(null); }
      else if (h === 'assets') { setCurrentRoute('assets'); setSelectedCoin(null); }
      else if (h.startsWith('trade/')) {
          const s = h.replace('trade/', '');
          const c = allTickers.find(t => t.symbol === s);
          if (c) { setSelectedCoin(c); setCurrentRoute('trade'); }
      }
    };
    handleHash(); window.addEventListener('hashchange', handleHash); return () => window.removeEventListener('hashchange', handleHash);
  }, [allTickers]);

  const openPosition = (symbol, type, margin, leverage, size, liq, mode, auto, price) => {
    setPaperAccount(prev => ({ ...prev, balance: prev.balance - margin, positions: [...prev.positions, { id: Date.now(), symbol, type, margin, leverage, size, entryPrice: price, liqPrice: liq, marginMode: mode, autoMargin: auto }] }));
  };

  const closePosition = (id, price) => {
    setPaperAccount(prev => {
      const p = prev.positions.find(x => x.id === id); if (!p) return prev;
      const pnl = p.type === 'LONG' ? (price - p.entryPrice) * p.size : (p.entryPrice - price) * p.size;
      return { ...prev, balance: prev.balance + p.margin + pnl, positions: prev.positions.filter(x => x.id !== id), history: [{ ...p, closePrice: price, pnl, closeTime: new Date().toLocaleString() }, ...prev.history].slice(0, 50) };
    });
  };

  const adjustPosition = (id, type, amount, price) => {
    setPaperAccount(prev => {
      const p = prev.positions.find(x => x.id === id); if (!p) return prev;
      if (type === 'add') {
        const sz = (amount * p.leverage) / price;
        return { ...prev, balance: prev.balance - amount, positions: prev.positions.map(x => x.id === id ? { ...x, size: x.size + sz, margin: x.margin + amount, entryPrice: ((x.size * x.entryPrice) + (sz * price)) / (x.size + sz) } : x) };
      } else {
        const r = amount / p.margin;
        return { ...prev, balance: prev.balance + amount, positions: prev.positions.map(x => x.id === id ? { ...x, size: x.size * (1 - r), margin: x.margin - amount } : x) };
      }
    });
  };

  if (!isStylesLoaded) return <div className="h-screen bg-[#0b0e14] flex items-center justify-center text-white font-mono">LOADING ASSETS...</div>;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-blue-500/30">
      <header className="bg-[#121620]/95 backdrop-blur border-b border-[#2a2f3a] sticky top-0 z-20 h-16 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 h-full flex justify-between items-center">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-blue-500 cursor-pointer" onClick={() => window.location.hash = '#/home'}><Zap className="w-6 h-6 fill-blue-500/20" /><h1 className="text-xl font-bold text-white tracking-tighter">SMC PRO</h1></div>
            <nav className="flex gap-1 text-sm font-bold">
              <button onClick={() => window.location.hash = '#/home'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'home' || currentRoute === 'trade' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>市場</button>
              <button onClick={() => window.location.hash = '#/positions'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'positions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>持倉 {paperAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full ml-1">{paperAccount.positions.length}</span>}</button>
              <button onClick={() => window.location.hash = '#/assets'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'assets' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>帳戶</button>
            </nav>
          </div>
          <div className="bg-[#1a1e27] px-4 py-2 rounded border border-[#2a2f3a] flex items-center gap-3"><Wallet className="w-4 h-4 text-blue-400" /><span className="text-sm font-mono text-white font-bold">${paperAccount.balance.toFixed(2)}</span></div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {currentRoute === 'home' && <Dashboard allTickers={allTickers} fundingRates={fundingRates} loading={loading} />}
        {currentRoute === 'positions' && <PositionsPage allTickers={allTickers} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
        {currentRoute === 'assets' && <AssetsPage allTickers={allTickers} paperAccount={paperAccount} />}
        {currentRoute === 'trade' && selectedCoin && <TradingWorkspace coin={selectedCoin} fundingRate={fundingRates[selectedCoin.symbol]} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
      </main>
    </div>
  );
}
