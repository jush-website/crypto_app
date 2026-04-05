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
  Waves // 新增：流動性圖示
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

/**
 * 成交量分佈 (Volume Profile) 與 POC 計算
 */
const calculateVolumeProfile = (klines, bins = 20) => {
  if (!klines || klines.length === 0) return { poc: 0, bins: [] };
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const step = (max - min) / bins;
  
  const profile = Array(bins).fill(0).map((_, i) => ({
    price: min + step * i,
    volume: 0
  }));

  klines.forEach(k => {
    const index = Math.min(bins - 1, Math.floor((k.close - min) / step));
    profile[index].volume += k.volume;
  });

  let maxVol = 0;
  let poc = 0;
  profile.forEach(p => {
    if (p.volume > maxVol) {
      maxVol = p.volume;
      poc = p.price;
    }
  });

  return { poc, profile };
};

/**
 * 錨定 VWAP (Anchored VWAP)
 */
const calculateAVWAP = (klines) => {
  if (!klines || klines.length === 0) return 0;
  let totalPV = 0;
  let totalV = 0;
  klines.forEach(k => {
    const avgPrice = (k.high + k.low + k.close) / 3;
    totalPV += avgPrice * k.volume;
    totalV += k.volume;
  });
  return totalV === 0 ? 0 : totalPV / totalV;
};

/**
 * 流動性獵取偵測 (Liquidity Sweep)
 */
const detectLiquiditySweep = (klines) => {
  if (klines.length < 21) return { sweepLong: false, sweepShort: false };
  
  const lastK = klines[klines.length - 1];
  const prevKlines = klines.slice(-21, -1);
  
  const localHigh = Math.max(...prevKlines.map(k => k.high));
  const localLow = Math.min(...prevKlines.map(k => k.low));
  
  // 做多掃描：價格跌破近期低點後收盤拉回低點上方
  const sweepLong = lastK.low < localLow && lastK.close > localLow;
  // 做空掃描：價格突破近期高點後收盤跌回高點下方
  const sweepShort = lastK.high > localHigh && lastK.close < localHigh;
  
  return { sweepLong, sweepShort, localHigh, localLow };
};

/**
 * 模擬訂單流分析 (Order Flow Simulation)
 */
const analyzeOrderFlow = (klines) => {
  const lastK = klines[klines.length - 1];
  const bodySize = Math.abs(lastK.close - lastK.open);
  const upperWick = lastK.high - Math.max(lastK.open, lastK.close);
  const lowerWick = Math.min(lastK.open, lastK.close) - lastK.low;
  
  // 吸收跡象：成交量極大但 K 線實體極小且影線長
  const avgVol = klines.slice(-10).reduce((a, b) => a + b.volume, 0) / 10;
  const isAbsorption = lastK.volume > avgVol * 1.5 && bodySize < (upperWick + lowerWick);
  
  // 侵略性：陽線收最高或陰線收最低
  const isAggressiveBuy = lastK.close > lastK.open && upperWick < bodySize * 0.1;
  const isAggressiveSell = lastK.close < lastK.open && lowerWick < bodySize * 0.1;
  
  return { isAbsorption, isAggressiveBuy, isAggressiveSell };
};

/**
 * 核心策略引擎：SMC + Order Flow
 */
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

  // 1. VWAP 與 POC 基調 (趨勢定位)
  if (currentPrice > avwap) {
    score += 1;
    analysisLog.push("AVWAP：價格位於加權平均成本之上，結構偏多 (+1)");
  } else {
    score -= 1;
    analysisLog.push("AVWAP：價格位於加權平均成本之下，結構偏空 (-1)");
  }

  if (currentPrice > poc) {
    score += 1;
    analysisLog.push("Volume Profile：價格站上 POC 成交密集區，視為支撐 (+1)");
  } else {
    score -= 1;
    analysisLog.push("Volume Profile：價格跌破 POC 成交密集區，視為壓力 (-1)");
  }

  // 2. 流動性獵取 (高權重)
  if (sweep.sweepLong) {
    score += 4;
    analysisLog.push("Liquidity Sweep：偵測到低點流動性獵取，機構洗盤結束跡象 (+4)");
  }
  if (sweep.sweepShort) {
    score -= 4;
    analysisLog.push("Liquidity Sweep：偵測到高點流動性獵取，潛在派發出貨跡象 (-4)");
  }

  // 3. 訂單流分析
  if (flow.isAggressiveBuy) {
    score += 2;
    analysisLog.push("Order Flow：主動買盤表現強勁，侵略性十足 (+2)");
  }
  if (flow.isAggressiveSell) {
    score -= 2;
    analysisLog.push("Order Flow：主動賣盤表現強勁，侵略性十足 (-2)");
  }
  if (flow.isAbsorption && currentPrice < poc) {
    score += 1.5;
    analysisLog.push("Order Flow：低位出現大額成交吸收，疑似吸籌行為 (+1.5)");
  }

  // 4. 籌碼過熱修正
  if (fr > 0.0006) {
    score -= 1.5;
    analysisLog.push("Funding Rate：資金費率過高，多頭過於擁擠，防範多殺多 (-1.5)");
  } else if (fr < -0.0002) {
    score += 1.5;
    analysisLog.push("Funding Rate：資金費率為負，空頭過於擁擠，具備軋空潛力 (+1.5)");
  }

  if (score >= 4) signal = 'LONG';
  else if (score <= -4) signal = 'SHORT';

  const confidence = Math.min(Math.round(40 + (Math.abs(score) * 8)), 98);

  return { signal, score, currentPrice, confidence, analysisLog, poc, avwap };
};

// --- 組件：TradeForm (維持保證金模式與百分比滑桿) ---
function TradeForm({ symbol, currentPrice, balance, onOpenPosition }) {
  const [leverage, setLeverage] = useState(10);
  const [marginMode, setMarginMode] = useState('ISOLATED'); 
  const [autoMargin, setAutoMargin] = useState(false); 
  const [inputValue, setInputValue] = useState(''); 
  const [tradeError, setTradeError] = useState('');

  const val = parseFloat(inputValue) || 0;
  const marginReq = val; 
  const notionalSize = marginReq * leverage;
  const coinSize = currentPrice > 0 ? notionalSize / currentPrice : 0;

  let liqLong, liqShort;
  if (marginMode === 'CROSS') {
      const balanceFactor = (balance - marginReq) / (coinSize || 1);
      liqLong = currentPrice - (currentPrice / leverage) - balanceFactor * 0.9;
      liqShort = currentPrice + (currentPrice / leverage) + balanceFactor * 0.9;
  } else {
      liqLong = currentPrice * (1 - 1/leverage + 0.004);
      liqShort = currentPrice * (1 + 1/leverage - 0.004);
  }
  liqLong = Math.max(0, liqLong);
  liqShort = Math.max(0, liqShort);

  const handleSliderChange = (e) => {
      const pct = parseFloat(e.target.value);
      if (balance > 0) {
          const newMargin = (balance * (pct / 100)).toFixed(2);
          setInputValue(newMargin);
      }
  };

  const handleSubmit = (type) => {
      setTradeError('');
      if(marginReq > balance) return setTradeError("可用餘額不足！");
      if(marginReq <= 0) return setTradeError("金額必須大於 0");
      onOpenPosition(symbol, type, marginReq, leverage, coinSize, type === 'LONG' ? liqLong : liqShort, marginMode, autoMargin, currentPrice);
      setInputValue(''); 
  };

  const sliderValue = balance > 0 ? Math.min(100, (val / balance) * 100) : 0;

  return (
      <div className="space-y-4">
          <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <label>槓桿倍數</label>
                  <span className="text-white font-bold">{leverage}x</span>
              </div>
              <input type="range" min="1" max="100" value={leverage} onChange={(e) => setLeverage(e.target.value)} className="w-full accent-blue-500" />
          </div>
          
          <div className="flex bg-[#0b0e14] p-1 rounded-lg border border-[#2a2f3a] mb-2">
              <button onClick={() => setMarginMode('CROSS')} className={`flex-1 text-xs py-1.5 rounded transition-colors ${marginMode === 'CROSS' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}>全倉</button>
              <button onClick={() => setMarginMode('ISOLATED')} className={`flex-1 text-xs py-1.5 rounded transition-colors ${marginMode === 'ISOLATED' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}>逐倉</button>
          </div>

          <div>
              <label className="text-xs text-slate-400 mb-1 block">投入保證金 (Margin)</label>
              <div className="relative mb-3">
                  <input type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="0.00" className={`w-full bg-[#1a1e27] border ${tradeError ? 'border-red-500/50' : 'border-[#2a2f3a]'} rounded p-2 text-white font-mono text-sm outline-none focus:border-blue-500`} />
                  <span className="absolute right-3 top-2 text-xs text-slate-500">USDT</span>
              </div>
              <div className="px-1 mb-2">
                  <input type="range" min="0" max="100" value={sliderValue} onChange={handleSliderChange} className="w-full accent-blue-500 h-1 bg-[#2a2f3a] rounded-lg appearance-none cursor-pointer" />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span className="cursor-pointer" onClick={() => handleSliderChange({target:{value:25}})}>25%</span>
                      <span className="cursor-pointer" onClick={() => handleSliderChange({target:{value:50}})}>50%</span>
                      <span className="cursor-pointer" onClick={() => handleSliderChange({target:{value:75}})}>75%</span>
                      <span className="cursor-pointer" onClick={() => handleSliderChange({target:{value:100}})}>100%</span>
                  </div>
              </div>
              {tradeError && <div className="text-[10px] text-red-400 mt-1">{tradeError}</div>}
          </div>

          <div className="bg-[#0b0e14] rounded p-3 text-[11px] space-y-1.5 border border-[#1e2330]">
              <div className="flex justify-between text-slate-400">做多強平: <span className="text-[#0ecb81]">{formatPrice(liqLong)}</span></div>
              <div className="flex justify-between text-slate-400">做空強平: <span className="text-[#f6465d]">{formatPrice(liqShort)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
              <button onClick={() => handleSubmit('LONG')} className="bg-[#0ecb81]/20 hover:bg-[#0ecb81]/30 text-[#0ecb81] border border-[#0ecb81]/30 py-2 rounded font-bold transition-all">做多</button>
              <button onClick={() => handleSubmit('SHORT')} className="bg-[#f6465d]/20 hover:bg-[#f6465d]/30 text-[#f6465d] border border-[#f6465d]/30 py-2 rounded font-bold transition-all">做空</button>
          </div>
      </div>
  );
}

// --- 獨立持倉管理卡片 ---
function PositionCard({ pos, currentPrice, balance, onSelectCoin, onClose, onAdjust }) {
  const [activeModal, setActiveModal] = useState(null); 
  const [adjustInput, setAdjustInput] = useState('');
  const [modalError, setModalError] = useState('');

  const pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
  const roe = (pnl / pos.margin) * 100;
  const isProfit = pnl >= 0;

  const handleAdjustSubmit = () => {
      const val = parseFloat(adjustInput);
      if(isNaN(val) || val <= 0) return setModalError('無效金額');
      if(activeModal === 'add' && val > balance) return setModalError('餘額不足');
      onAdjust(activeModal, val);
      setActiveModal(null); setAdjustInput('');
  };

  return (
      <div className={`bg-[#121620] border ${isProfit ? 'border-[#0ecb81]/30' : 'border-[#f6465d]/30'} rounded-xl p-4 flex flex-col relative shadow-lg`}>
          <div className="flex justify-between items-start mb-3">
              <div>
                  <h3 
                    className="text-lg font-black text-white cursor-pointer hover:text-blue-400 transition-colors underline underline-offset-4 decoration-blue-500/20"
                    onClick={() => {
                        // 返回時需要回到這個高度
                        sessionStorage.setItem('dashboardScroll', window.scrollY.toString());
                        onSelectCoin && onSelectCoin({symbol: pos.symbol});
                    }}
                  >
                      {pos.symbol}
                  </h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold mt-1 inline-block ${pos.type === 'LONG' ? 'bg-[#0ecb81] text-white' : 'bg-[#f6465d] text-white'}`}>
                      {pos.type} {pos.leverage}x
                  </span>
              </div>
              <div className="text-right">
                  <div className={`text-lg font-mono font-black ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {isProfit ? '+' : ''}{pnl.toFixed(2)}
                  </div>
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
                      <input type="number" value={adjustInput} onChange={e => setAdjustInput(e.target.value)} placeholder="金額" className="flex-1 bg-[#0b0e14] border border-[#2a2f3a] rounded px-2 text-xs text-white outline-none" />
                      <button onClick={handleAdjustSubmit} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded">確認</button>
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
  const baseAsset = ticker.symbol.replace('USDT', '');
  
  return (
      <div 
        onClick={() => {
          sessionStorage.setItem('dashboardScroll', window.scrollY.toString());
          onSelectCoin(ticker.symbol);
        }} 
        className="bg-[#121620] rounded-lg p-4 border border-[#2a2f3a] hover:border-blue-500/40 cursor-pointer transition-all flex flex-col justify-between shadow-md"
      >
          <div>
              <div className="flex justify-between mb-1">
                  <h3 className="font-bold text-slate-100">{baseAsset}</h3>
                  <div className={`text-xs font-bold ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{isPositive ? '+' : ''}{change.toFixed(2)}%</div>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">Vol: {formatVolume(ticker.quoteVolume)}</div>
              <div className="text-lg font-mono font-semibold text-white mb-2">{formatPrice(ticker.lastPrice)}</div>
          </div>
          
          {signalData && signalData.signal !== 'NEUTRAL' && (
              <div className={`mt-2 text-[10px] p-2 rounded border ${signalData.signal === 'LONG' ? 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]' : 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]'}`}>
                  <div className="font-bold mb-1 flex items-center gap-1">
                      <Target className="w-3 h-3"/> AI {signalData.timeframe}: {signalData.signal}
                  </div>
                  <div className="truncate text-slate-400 opacity-80">{signalData.analysisLog[0]}</div>
              </div>
          )}
      </div>
  );
}

// --- K線圖組件 (SMC 圖層：顯示 POC 與 AVWAP) ---
const AdvancedKLineChart = ({ klines, signalData }) => {
  const containerRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(60); 
  const [endIndexOffset, setEndIndexOffset] = useState(0); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const dataLen = klines ? klines.length : 0;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || dataLen === 0) return;
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

  if (!klines || dataLen === 0) return <div className="h-[500px] flex items-center justify-center text-slate-600">無數據</div>;
  
  const maxOffset = Math.max(0, dataLen - visibleCount);
  const safeOffset = Math.min(Math.max(0, endIndexOffset), maxOffset);
  const safeVisibleCount = Math.min(visibleCount, dataLen);
  const startIndex = Math.max(0, dataLen - safeVisibleCount - safeOffset);
  const endIndex = dataLen - safeOffset;
  const visibleKlines = klines.slice(startIndex, endIndex);

  // 繪圖常數
  const width = 800; const totalHeight = 500; const kLineHeight = 350;
  const paddingX = 10; const xStep = (width - paddingX * 2) / safeVisibleCount; const candleWidth = Math.max(xStep * 0.7, 1);
  
  const lows = visibleKlines.map(k => k.low); const highs = visibleKlines.map(k => k.high);
  const minPrice = Math.min(...lows); const maxPrice = Math.max(...highs);
  const priceRange = (maxPrice - minPrice) || 1;
  const getPriceY = (p) => kLineHeight - 20 - ((p - minPrice) / priceRange) * (kLineHeight - 40);

  const updateHover = (clientX) => {
    const rect = containerRef.current.getBoundingClientRect();
    const dataIndex = Math.floor(((clientX - rect.left) * (width / rect.width) - paddingX) / xStep);
    setHoveredIndex((dataIndex >= 0 && dataIndex < visibleKlines.length) ? dataIndex : null);
  };

  const hoveredK = hoveredIndex !== null ? visibleKlines[hoveredIndex] : null;

  return (
    <div className="w-full relative group touch-none" style={{ height: '500px' }}>
      {/* 工具提示 */}
      <div className="absolute top-2 left-2 flex flex-col gap-1 text-[10px] font-mono z-10 pointer-events-none">
        {hoveredK ? (
          <div className="bg-[#0b0e14]/90 backdrop-blur p-2 rounded border border-[#2a2f3a] text-slate-300">
            <div>TIME: {new Date(hoveredK.time).toLocaleString()}</div>
            <div className="flex gap-2">
              <span>O: {formatPrice(hoveredK.open)}</span>
              <span>H: {formatPrice(hoveredK.high)}</span>
              <span>L: {formatPrice(hoveredK.low)}</span>
              <span>C: {formatPrice(hoveredK.close)}</span>
            </div>
          </div>
        ) : (
          <div className="bg-[#0b0e14]/50 p-1 rounded text-slate-500 flex items-center gap-1">
             <MoveHorizontal className="w-3 h-3" /> 滾輪縮放 / 拖曳平移
          </div>
        )}
      </div>

      <div 
        ref={containerRef} 
        className="w-full h-full overflow-hidden cursor-crosshair" 
        onMouseMove={(e) => {
          if (isDragging) {
            const dx = e.clientX - dragStartX;
            if (Math.abs(dx) > 5) {
              setEndIndexOffset(prev => Math.max(0, Math.min(prev + Math.round(dx / 5), maxOffset)));
              setDragStartX(e.clientX);
            }
          } else updateHover(e.clientX);
        }}
        onMouseDown={(e) => { setIsDragging(true); setDragStartX(e.clientX); }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => { setIsDragging(false); setHoveredIndex(null); }}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          {/* 網格線 */}
          <line x1="0" y1={kLineHeight} x2={width} y2={kLineHeight} stroke="#2a2f3a" strokeWidth="1" />
          
          {/* SMC 指標圖層：POC (控制點) */}
          {signalData?.poc && (
              <g>
                <line x1="0" y1={getPriceY(signalData.poc)} x2={width} y2={getPriceY(signalData.poc)} stroke="#3b82f6" strokeWidth="1" strokeDasharray="5 5" opacity="0.6" />
                <text x={5} y={getPriceY(signalData.poc) - 5} fill="#3b82f6" fontSize="9">POC</text>
              </g>
          )}

          {/* SMC 指標圖層：Anchored VWAP */}
          {signalData?.avwap && (
              <g>
                <line x1="0" y1={getPriceY(signalData.avwap)} x2={width} y2={getPriceY(signalData.avwap)} stroke="#f59e0b" strokeWidth="1" opacity="0.4" />
                <text x={width - 40} y={getPriceY(signalData.avwap) + 12} fill="#f59e0b" fontSize="9">AVWAP</text>
              </g>
          )}

          {/* 繪製 K 線 */}
          {visibleKlines.map((k, i) => {
            const x = paddingX + i * xStep; 
            const isUp = k.close >= k.open; 
            const color = isUp ? '#0ecb81' : '#f6465d';
            const openY = getPriceY(k.open); const closeY = getPriceY(k.close);
            const highY = getPriceY(k.high); const lowY = getPriceY(k.low);
            
            return (
              <g key={k.time || i}>
                {hoveredIndex === i && (
                  <line x1={x + candleWidth/2} y1={0} x2={x + candleWidth/2} y2={totalHeight} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
                )}
                <line x1={x + candleWidth/2} y1={highY} x2={x + candleWidth/2} y2={lowY} stroke={color} strokeWidth="1" />
                <rect x={x} y={Math.min(openY, closeY)} width={candleWidth} height={Math.max(1, Math.abs(openY - closeY))} fill={color} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// --- 分頁組件：市場分析 ---
function Dashboard({ allTickers, fundingRates, loading }) {
  const [activeTab, setActiveTab] = useState('ALL'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [aiSignals, setAiSignals] = useState({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0); 
  const [timeframe, setTimeframe] = useState('15m');

  // 偵測返回後恢復滾動位置
  useEffect(() => {
    if (!loading && allTickers.length > 0) {
      const savedPos = sessionStorage.getItem('dashboardScroll');
      if (savedPos) {
        // 延遲執行以確保 DOM 渲染完成
        setTimeout(() => {
          window.scrollTo({ top: parseInt(savedPos), behavior: 'auto' });
          sessionStorage.removeItem('dashboardScroll'); // 使用完畢後清除
        }, 100);
      }
    }
  }, [loading, allTickers.length]);

  useEffect(() => {
    let isMounted = true;
    const scanMarkets = async () => {
      if (allTickers.length === 0) return;
      setIsScanning(true);
      setScanProgress(0);
      setAiSignals({});
      
      const topCoins = allTickers.slice(0, 150); 
      const chunkSize = 15; 
      
      for (let i = 0; i < topCoins.length; i += chunkSize) {
        if (!isMounted) return;
        const chunk = topCoins.slice(i, i + chunkSize);
        const chunkSignals = {};
        
        await Promise.all(chunk.map(async (coin) => {
          try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${timeframe}&limit=80`);
            if (!res.ok) return;
            const data = await res.json();
            const parsed = data.map(d => ({ high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), open: parseFloat(d[1]) }));
            const sig = generateAdvancedSignal(parsed, parseFloat(coin.lastPrice), fundingRates[coin.symbol]);
            if (sig && sig.signal !== 'NEUTRAL') {
               chunkSignals[coin.symbol] = { ...sig, timeframe };
            }
          } catch (e) { }
        }));

        if (isMounted) {
           if (Object.keys(chunkSignals).length > 0) setAiSignals(prev => ({ ...prev, ...chunkSignals }));
           setScanProgress(Math.min(100, Math.round(((i + chunkSize) / topCoins.length) * 100)));
        }
        await new Promise(r => setTimeout(r, 200));
      }
      if (isMounted) setIsScanning(false);
    };
    
    scanMarkets();
    return () => { isMounted = false; };
  }, [allTickers.length > 0, timeframe]); 

  if (loading && allTickers.length === 0) return <div className="text-center py-32 text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-4 text-amber-500" /> Connecting to Binance...</div>;

  let displayTickers = allTickers;
  if (activeTab === 'LONG') displayTickers = allTickers.filter(t => aiSignals[t.symbol]?.signal === 'LONG');
  else if (activeTab === 'SHORT') displayTickers = allTickers.filter(t => aiSignals[t.symbol]?.signal === 'SHORT');
  
  if (searchTerm) displayTickers = displayTickers.filter(t => t.symbol.includes(searchTerm.toUpperCase()));

  displayTickers = displayTickers.slice(0, 150);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 sticky top-[64px] z-10 py-2 bg-[#0b0e14]/90 backdrop-blur">
          <div className="flex flex-wrap gap-2">
              <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a]">
                  <button onClick={() => setActiveTab('ALL')} className={`px-4 py-2 text-sm rounded transition-colors ${activeTab === 'ALL' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}>全部</button>
                  <button onClick={() => setActiveTab('LONG')} className={`px-4 py-2 text-sm rounded transition-colors flex items-center gap-1 ${activeTab === 'LONG' ? 'bg-[#0ecb81]/20 text-[#0ecb81] font-bold' : 'text-slate-500 hover:text-[#0ecb81]'}`}>🔥 推薦做多</button>
                  <button onClick={() => setActiveTab('SHORT')} className={`px-4 py-2 text-sm rounded transition-colors flex items-center gap-1 ${activeTab === 'SHORT' ? 'bg-[#f6465d]/20 text-[#f6465d] font-bold' : 'text-slate-500 hover:text-[#f6465d]'}`}>🩸 推薦做空</button>
              </div>
              {(activeTab === 'LONG' || activeTab === 'SHORT') && (
                  <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a]">
                      <button onClick={() => setTimeframe('15m')} className={`px-3 py-2 text-xs rounded transition-colors ${timeframe === '15m' ? 'bg-[#2a2f3a] text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>15m</button>
                      <button onClick={() => setTimeframe('1h')} className={`px-3 py-2 text-xs rounded transition-colors ${timeframe === '1h' ? 'bg-[#2a2f3a] text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>1h</button>
                      <button onClick={() => setTimeframe('4h')} className={`px-3 py-2 text-xs rounded transition-colors ${timeframe === '4h' ? 'bg-[#2a2f3a] text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>4h</button>
                  </div>
              )}
          </div>
          <div className="flex items-center gap-4 w-full xl:w-auto">
              {isScanning && <div className="flex items-center gap-2 text-xs text-amber-500 whitespace-nowrap"><RefreshCw className="w-3 h-3 animate-spin" /> 機構流掃描中 {scanProgress}%</div>}
              <div className="relative flex-1 xl:w-64">
                  <Search className="absolute left-3 top-2 h-4 w-4 text-slate-500" />
                  <input type="text" placeholder="搜尋..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-9 pr-3 py-1.5 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white focus:border-blue-500 outline-none" />
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {displayTickers.map((ticker) => (
              <MarketCard key={ticker.symbol} ticker={ticker} fundingRate={fundingRates[ticker.symbol]} signalData={aiSignals[ticker.symbol]} onSelectCoin={(symbol) => window.location.hash = `#/trade/${symbol}`} />
          ))}
      </div>
    </div>
  );
}

// --- 分頁組件：持倉管理 ---
function PositionsPage({ allTickers, paperAccount, openPosition, closePosition, adjustPosition }) {
  const activeSymbols = [...new Set(paperAccount.positions.map(p => p.symbol))];
  const activeTickers = allTickers.filter(t => activeSymbols.includes(t.symbol));

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
          <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2"><Layers className="w-6 h-6 text-blue-500" /> 當前持倉管理</h2>
          {paperAccount.positions.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {paperAccount.positions.map(pos => {
                      const currentPrice = parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice);
                      return <PositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onSelectCoin={(coin) => window.location.hash = `#/trade/${coin.symbol}`} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(type, val) => adjustPosition(pos.id, type, val, currentPrice)} />;
                  })}
              </div>
          ) : (
              <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-10 text-center text-slate-500">尚無持倉</div>
          )}
      </div>

      {activeTickers.length > 0 && (
          <div>
              <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2"><Zap className="w-6 h-6 text-amber-500" /> 快捷交易區</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeTickers.map((ticker) => (
                      <div key={ticker.symbol} className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                          <div className="flex justify-between items-start mb-4 border-b border-[#2a2f3a] pb-3">
                              <div>
                                  <h3 className="font-black text-white text-xl cursor-pointer hover:text-blue-400" onClick={() => window.location.hash = `#/trade/${ticker.symbol}`}>{ticker.symbol.replace('USDT', '')}</h3>
                                  <div className="text-[10px] text-slate-500 mt-1">Vol: {formatVolume(ticker.quoteVolume)}</div>
                              </div>
                              <span className="text-xl font-mono text-white">${formatPrice(ticker.lastPrice)}</span>
                          </div>
                          <TradeForm symbol={ticker.symbol} currentPrice={parseFloat(ticker.lastPrice)} balance={paperAccount.balance} onOpenPosition={openPosition} />
                      </div>
                  ))}
              </div>
          </div>
      )}

      {paperAccount.history.length > 0 && (
          <div>
              <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2"><Clock className="w-6 h-6 text-blue-500" /> 歷史交易紀錄</h2>
              <div className="bg-[#121620] rounded-lg border border-[#2a2f3a] overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-[#0b0e14] text-slate-500">
                          <tr><th className="px-4 py-3">時間</th><th className="px-4 py-3">合約</th><th className="px-4 py-3">方向</th><th className="px-4 py-3 text-right">實現盈虧</th></tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2f3a]">
                          {paperAccount.history.map((item, idx) => (
                              <tr key={idx} className="hover:bg-[#1a1e27]">
                                  <td className="px-4 py-3 text-slate-400">{item.closeTime}</td>
                                  <td className="px-4 py-3 font-bold text-white cursor-pointer hover:text-amber-500" onClick={() => window.location.hash = `#/trade/${item.symbol}`}>{item.symbol}</td>
                                  <td className="px-4 py-3"><span className={`px-1.5 py-0.5 rounded font-bold ${item.type === 'LONG' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>{item.type}</span></td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-white">{item.pnl >= 0 ? '+' : ''}{item.pnl.toFixed(2)} USDT</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
    </div>
  );
}

// --- 分頁組件：資產中心 ---
function AssetsPage({ paperAccount, allTickers }) {
  let totalUnrealizedPnL = 0; let usedMargin = 0;
  paperAccount.positions.forEach(pos => {
      usedMargin += pos.margin;
      const currentPrice = parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice);
      const pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
      totalUnrealizedPnL += pnl;
  });
  const availableBalance = paperAccount.balance;
  const totalEquity = availableBalance + usedMargin + totalUnrealizedPnL;
  const totalTrades = paperAccount.history.length;
  const winRate = totalTrades > 0 ? ((paperAccount.history.filter(h => h.pnl > 0).length / totalTrades) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
        <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2"><BarChart2 className="w-6 h-6 text-blue-500" /> 資產中心總覽</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg"><div className="text-xs text-slate-400 mb-1">總權益 (USDT)</div><div className="text-2xl font-mono font-bold text-white">${totalEquity.toFixed(2)}</div></div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg"><div className="text-xs text-slate-400 mb-1">可用餘額</div><div className="text-2xl font-mono font-bold text-blue-400">${availableBalance.toFixed(2)}</div></div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg"><div className="text-xs text-slate-400 mb-1">未實現盈虧</div><div className={`text-2xl font-mono font-bold ${totalUnrealizedPnL >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{totalUnrealizedPnL >= 0 ? '+' : ''}{totalUnrealizedPnL.toFixed(2)}</div></div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg"><div className="text-xs text-slate-400 mb-1">歷史勝率</div><div className="text-2xl font-mono font-bold text-white">{winRate}%</div></div>
        </div>
    </div>
  );
}

// --- 單一幣種專屬交易面板 ---
function TradingWorkspace({ coin, fundingRate, paperAccount, openPosition, closePosition, adjustPosition }) {
  const [klines, setKlines] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(parseFloat(coin.lastPrice));
  const [signalData, setSignalData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchDetailData = async () => {
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=15m&limit=100`);
        const data = await res.json();
        if (isMounted) {
            const parsed = data.map(c => ({ time: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]) }));
            setKlines(parsed);
            if(parsed.length > 0) {
              const latestPrice = parsed[parsed.length - 1].close;
              setCurrentPrice(latestPrice);
              setSignalData(generateAdvancedSignal(parsed, latestPrice, fundingRate));
            }
        }
      } catch (err) {}
    };
    fetchDetailData();
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${coin.symbol}`);
            const data = await res.json();
            if(isMounted) {
                const price = parseFloat(data.price); setCurrentPrice(price);
                setKlines(prev => { if (prev.length === 0) return prev; const n = [...prev]; const l = n[n.length - 1]; l.close = price; l.high = Math.max(l.high, price); l.low = Math.min(l.low, price); return n; });
            }
        } catch(e) {}
    }, 1500); 
    return () => { isMounted = false; clearInterval(interval); };
  }, [coin.symbol]);

  return (
    <div className="animate-in fade-in duration-300">
      <button onClick={() => window.location.hash = '#/home'} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded border border-[#2a2f3a]"><ArrowLeft className="w-4 h-4" /> 返回市場</button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] rounded-xl p-5 border border-[#2a2f3a] shadow-lg">
            <h2 className="text-3xl font-black text-white">{coin.symbol.replace('USDT', '')} <span className="text-sm font-normal text-slate-500">USDT</span></h2>
            <div className="text-xs text-slate-400 mt-1">24h Vol: {formatVolume(coin.quoteVolume)}</div>
            <div className="text-3xl font-mono font-bold text-white mt-2">${formatPrice(currentPrice)}</div>
          </div>

          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 bg-blue-600 text-[10px] text-white px-3 py-1 rounded-bl-lg font-bold">PAPER TRADING</div>
             <TradeForm symbol={coin.symbol} currentPrice={currentPrice} balance={paperAccount.balance} onOpenPosition={openPosition} />
          </div>

          {signalData && (
             <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg">
                 <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2"><Waves className="w-4 h-4 text-amber-500" /> SMC 機構級分析 (15m)</h3>
                 <div className="flex justify-between items-center bg-[#0b0e14] p-3 rounded border border-[#1e2330]">
                     <span className={`text-2xl font-black ${signalData.signal === 'LONG' ? 'text-[#0ecb81]' : signalData.signal === 'SHORT' ? 'text-[#f6465d]' : 'text-slate-400'}`}>{signalData.signal}</span>
                     <span className="text-lg font-mono text-white">{signalData.confidence}%</span>
                 </div>
                 <div className="mt-3 space-y-1.5 pt-3 border-t border-[#2a2f3a]">
                    {signalData.analysisLog.map((log, idx) => (
                        <div key={idx} className="text-[10px] text-slate-300 flex items-start gap-1.5">
                            <span className={`mt-0.5 w-1 h-1 rounded-full flex-shrink-0 ${log.includes('+') ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`}></span>
                            {log}
                        </div>
                    ))}
                 </div>
             </div>
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-xl p-1 border border-[#2a2f3a] shadow-lg">
             <AdvancedKLineChart klines={klines} signalData={signalData} />
          </div>

          <div>
              <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-500" /> 持倉詳情</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paperAccount.positions.filter(p => p.symbol === coin.symbol).map(pos => (
                      <PositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(type, val) => adjustPosition(pos.id, type, val, currentPrice)} />
                  ))}
              </div>
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

  const [paperAccount, setPaperAccount] = useState(() => {
    try { const saved = localStorage.getItem('paperAccount'); return saved ? JSON.parse(saved) : { balance: 10000, positions: [], history: [] }; }
    catch { return { balance: 10000, positions: [], history: [] }; }
  });

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script'); script.id = 'tailwind-cdn'; script.src = 'https://cdn.tailwindcss.com';
      script.onload = () => setIsStylesLoaded(true); document.head.appendChild(script);
    } else { setIsStylesLoaded(true); }
  }, []);

  useEffect(() => { localStorage.setItem('paperAccount', JSON.stringify(paperAccount)); }, [paperAccount]);

  const fetchFuturesData = async () => {
    try {
      const [tickerRes, fundingRes] = await Promise.all([fetch('https://fapi.binance.com/fapi/v1/ticker/24hr'), fetch('https://fapi.binance.com/fapi/v1/premiumIndex')]);
      if (tickerRes.ok && fundingRes.ok) {
          const tickersData = await tickerRes.json(); const fundingData = await fundingRes.json();
          setAllTickers(tickersData.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)));
          const frMap = {}; fundingData.forEach(item => { frMap[item.symbol] = item.lastFundingRate; }); setFundingRates(frMap);
      }
    } catch (err) {} finally { setLoading(false); }
  };

  useEffect(() => { fetchFuturesData(); const interval = setInterval(fetchFuturesData, 8000); return () => clearInterval(interval); }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '');
      if (hash === '' || hash === 'home') { setCurrentRoute('home'); setSelectedCoin(null); }
      else if (hash === 'positions') { setCurrentRoute('positions'); setSelectedCoin(null); }
      else if (hash === 'assets') { setCurrentRoute('assets'); setSelectedCoin(null); }
      else if (hash.startsWith('trade/')) {
          const symbol = hash.replace('trade/', '');
          const coin = allTickers.find(t => t.symbol === symbol);
          if (coin) { setSelectedCoin(coin); setCurrentRoute('trade'); }
      }
    };
    handleHashChange(); window.addEventListener('hashchange', handleHashChange); return () => window.removeEventListener('hashchange', handleHashChange);
  }, [allTickers]);

  const openPosition = (symbol, type, marginReq, leverage, coinSize, liqPrice, marginMode, autoMargin, currentPrice) => {
    const newPosition = { id: Date.now(), symbol, type, margin: marginReq, leverage, size: coinSize, entryPrice: currentPrice, liqPrice, marginMode, autoMargin, openTime: new Date().toLocaleString() };
    setPaperAccount(prev => ({ ...prev, balance: prev.balance - marginReq, positions: [...prev.positions, newPosition] }));
  };

  const closePosition = (posId, currentPrice) => {
    setPaperAccount(prev => {
        const pos = prev.positions.find(p => p.id === posId); if(!pos) return prev;
        let pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
        return { ...prev, balance: prev.balance + pos.margin + pnl, positions: prev.positions.filter(p => p.id !== posId), history: [{ ...pos, closePrice: currentPrice, pnl, closeTime: new Date().toLocaleString() }, ...prev.history].slice(0, 50) };
    });
  };

  const adjustPosition = (posId, type, adjustAmount, currentPrice) => {
    setPaperAccount(prev => {
        const pos = prev.positions.find(p => p.id === posId); if(!pos) return prev;
        if(type === 'add') {
            const addedMargin = parseFloat(adjustAmount); const addedSize = (addedMargin * pos.leverage) / currentPrice;
            const newSize = pos.size + addedSize; const newEntry = ((pos.size * pos.entryPrice) + (addedSize * currentPrice)) / newSize;
            return { ...prev, balance: prev.balance - addedMargin, positions: prev.positions.map(p => p.id === posId ? { ...p, size: newSize, margin: pos.margin + addedMargin, entryPrice: newEntry } : p) };
        } else if(type === 'reduce') {
            const reducedMargin = parseFloat(adjustAmount); const ratio = reducedMargin / pos.margin;
            if(ratio >= 1) return prev; // 應直接平倉
            const reducedSize = pos.size * ratio;
            return { ...prev, balance: prev.balance + reducedMargin, positions: prev.positions.map(p => p.id === posId ? { ...p, size: pos.size - reducedSize, margin: pos.margin - reducedMargin } : p) };
        }
        return prev;
    });
  };

  if (!isStylesLoaded) return <div className="h-screen bg-[#0b0e14] flex items-center justify-center text-white">載入樣式中...</div>;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-indigo-500/30 pb-10">
      <header className="bg-[#121620]/95 backdrop-blur-md border-b border-[#2a2f3a] sticky top-0 z-20 shadow-sm h-16">
        <div className="max-w-7xl mx-auto px-4 h-full flex justify-between items-center">
          <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-amber-500 cursor-pointer" onClick={() => window.location.hash = '#/home'}>
                <Zap className="w-6 h-6 fill-amber-500/20" />
                <h1 className="text-xl font-bold text-white tracking-wide hidden sm:block">ProTrade</h1>
              </div>
              <nav className="flex gap-1">
                  <button onClick={() => window.location.hash = '#/home'} className={`px-3 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${currentRoute === 'home' || currentRoute === 'trade' ? 'bg-[#2a2f3a] text-white' : 'text-slate-400 hover:text-white'}`}><Activity className="w-4 h-4"/> 市場</button>
                  <button onClick={() => window.location.hash = '#/positions'} className={`px-3 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${currentRoute === 'positions' ? 'bg-[#2a2f3a] text-white' : 'text-slate-400 hover:text-white'}`}><Briefcase className="w-4 h-4"/> 持倉 {paperAccount.positions.length > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">{paperAccount.positions.length}</span>}</button>
                  <button onClick={() => window.location.hash = '#/assets'} className={`px-3 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${currentRoute === 'assets' ? 'bg-[#2a2f3a] text-white' : 'text-slate-400 hover:text-white'}`}><BarChart2 className="w-4 h-4"/> 資產</button>
              </nav>
          </div>
          <div className="flex items-center gap-4 bg-[#1a1e27] px-3 py-1.5 rounded border border-[#2a2f3a]">
                <Wallet className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-mono text-white">${paperAccount.balance.toFixed(2)}</span>
          </div>
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
