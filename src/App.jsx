import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ArrowLeft, 
  Search,
  Target,
  ShieldAlert,
  AlertCircle,
  Zap,
  Crosshair,
  Wallet,
  PieChart,
  ZoomIn,         // 新增：圖表縮放按鈕圖示
  ZoomOut,        // 新增：圖表縮小按鈕圖示
  RotateCcw,      // 新增：圖表重置按鈕圖示
  MoveHorizontal, // 新增：提示圖示
  Pencil,         // 新增：畫筆工具圖示
  Trash2          // 新增：垃圾桶圖示
} from 'lucide-react';

// --- 輔助函數 ---
const formatPrice = (price) => {
  const p = parseFloat(price);
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return p.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
};

const formatVolume = (vol) => {
  const v = parseFloat(vol);
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return v.toFixed(2);
};

const formatFundingRate = (rate) => {
  return (parseFloat(rate) * 100).toFixed(4) + '%';
};

// --- 技術指標計算函數 ---
const calculateSMA = (prices, period) => {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
};

const calculateRSI = (prices, period = 14) => {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateMACDSeries = (prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  if (prices.length < slowPeriod + signalPeriod) return [];
  
  const macdData = [];
  let fastEMA = prices.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let slowEMA = prices.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
  const difArray = [];

  for(let i = 0; i < prices.length; i++){
      if(i >= slowPeriod) {
        fastEMA = (prices[i] - fastEMA) * kFast + fastEMA;
        slowEMA = (prices[i] - slowEMA) * kSlow + slowEMA;
      }
      const dif = fastEMA - slowEMA;
      difArray.push(dif);
  }

  let dea = difArray.slice(0, signalPeriod).reduce((a,b)=>a+b,0) / signalPeriod;
  const kSignal = 2 / (signalPeriod + 1);

  for(let i = 0; i < prices.length; i++){
      if(i >= slowPeriod + signalPeriod) {
          dea = (difArray[i] - dea) * kSignal + dea;
      }
      const dif = difArray[i];
      const hist = (dif - dea) * 2;
      macdData.push({ dif, dea, hist });
  }
  return macdData;
};

const calculateBOLL = (prices, period = 20, multiplier = 2) => {
    if (prices.length < period) return { upper: null, mid: null, lower: null };
    const recentPrices = prices.slice(-period);
    const mid = recentPrices.reduce((a, b) => a + b, 0) / period;
    const variance = recentPrices.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return { upper: mid + (stdDev * multiplier), mid, lower: mid - (stdDev * multiplier) };
};

const calculateVolatilityPct = (prices, period = 14) => {
    if (prices.length < period) return 0.01;
    const recentPrices = prices.slice(-period);
    const mean = recentPrices.reduce((a, b) => a + b, 0) / period;
    const variance = recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    return Math.sqrt(variance) / mean;
};

// --- 多維度合約交易策略引擎 ---
const generateTradingSignal = (currentPrice, historyCloses, fundingRate) => {
  if (!historyCloses || historyCloses.length < 50) return null;

  const price = parseFloat(currentPrice);
  const fr = parseFloat(fundingRate || 0);

  const rsi = calculateRSI(historyCloses, 14);
  const sma7 = calculateSMA(historyCloses, 7);  
  const sma20 = calculateSMA(historyCloses, 20); 
  const macdSeries = calculateMACDSeries(historyCloses);
  const macd = macdSeries[macdSeries.length - 1] || {dif:0, dea:0, hist:0};
  const boll = calculateBOLL(historyCloses, 20, 2);
  const volatilityPct = calculateVolatilityPct(historyCloses, 14);

  let signal = 'NEUTRAL';
  let score = 0; 
  let analysisLog = []; 

  if (sma7 && sma20) {
    if (sma7 > sma20 && price > sma7) { score += 1.5; analysisLog.push("均線多頭排列 (+1.5)"); }
    else if (sma7 < sma20 && price < sma7) { score -= 1.5; analysisLog.push("均線空頭排列 (-1.5)"); }
  }

  if (macd.dif > macd.dea && macd.hist > 0) { score += 2; analysisLog.push("MACD 金叉多頭 (+2)"); } 
  else if (macd.dif < macd.dea && macd.hist < 0) { score -= 2; analysisLog.push("MACD 死叉空頭 (-2)"); }

  if (boll.lower && price <= boll.lower) { score += 2.5; analysisLog.push("觸及布林下軌 (+2.5)"); } 
  else if (boll.upper && price >= boll.upper) { score -= 2.5; analysisLog.push("觸及布林上軌 (-2.5)"); } 
  else if (boll.mid) { if (price > boll.mid) score += 0.5; else score -= 0.5; }

  if (rsi < 30) { score += 1.5; analysisLog.push("RSI 超賣 (+1.5)"); }
  else if (rsi > 70) { score -= 1.5; analysisLog.push("RSI 超買 (-1.5)"); }

  if (fr > 0.0004) { score -= 1.5; analysisLog.push("資金費率過熱偏空 (-1.5)"); }
  else if (fr < -0.0001) { score += 1.5; analysisLog.push("資金費率負值偏多 (+1.5)"); }

  if (score >= 4) signal = 'LONG';
  else if (score <= -4) signal = 'SHORT';

  let recommendedEntry = price;
  let takeProfit = 0;
  let stopLoss = 0;
  const baseBuffer = Math.min(Math.max(volatilityPct * 2, 0.004), 0.03); 

  if (signal === 'LONG') {
      recommendedEntry = (price > boll.mid && boll.mid) ? (price + boll.mid) / 2 : price;
      stopLoss = recommendedEntry * (1 - baseBuffer);
      takeProfit = Math.max(boll.upper ? boll.upper : recommendedEntry * (1 + (baseBuffer * 1.5)), recommendedEntry * 1.005); 
  } else if (signal === 'SHORT') {
      recommendedEntry = (price < boll.mid && boll.mid) ? (price + boll.mid) / 2 : price;
      stopLoss = recommendedEntry * (1 + baseBuffer);
      takeProfit = Math.min(boll.lower ? boll.lower : recommendedEntry * (1 - (baseBuffer * 1.5)), recommendedEntry * 0.995);
  }

  const confidence = Math.min(Math.abs(score) * 10 + 30, 95);

  return { signal, rsi, sma7, sma20, macd, boll, score, currentPrice: price, entry: recommendedEntry, takeProfit: signal !== 'NEUTRAL' ? takeProfit : null, stopLoss: signal !== 'NEUTRAL' ? stopLoss : null, confidence: signal !== 'NEUTRAL' ? confidence : 0, analysisLog };
};

// --- 組件：專業 SVG K線圖表 (包含互動縮放、MACD 與 Volume) ---
const AdvancedKLineChart = ({ klines, macdSeries }) => {
  const containerRef = useRef(null);
  
  // 圖表互動狀態
  const [visibleCount, setVisibleCount] = useState(60); // 預設顯示的 K 棒數量
  const [endIndexOffset, setEndIndexOffset] = useState(0); // 0 代表靠最右側(最新資料)，大於 0 代表往回看
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // 新增：畫線與觸控縮放狀態
  const [drawMode, setDrawMode] = useState(false);
  const [drawings, setDrawings] = useState([]);
  const [currentDrawing, setCurrentDrawing] = useState(null);
  const [touchDist, setTouchDist] = useState(0);

  if (!klines || klines.length === 0) return null;
  
  const dataLen = klines.length;
  
  // 邊界檢查機制
  const maxOffset = Math.max(0, dataLen - visibleCount);
  const safeOffset = Math.min(Math.max(0, endIndexOffset), maxOffset);
  const safeVisibleCount = Math.min(visibleCount, dataLen);

  const startIndex = Math.max(0, dataLen - safeVisibleCount - safeOffset);
  const endIndex = dataLen - safeOffset;

  // 切割出當前視野範圍內的資料
  const visibleKlines = klines.slice(startIndex, endIndex);
  const visibleMacd = macdSeries.slice(startIndex, endIndex);

  // ---------------- 繪圖比例與座標計算 (提前宣告供畫線工具使用) ----------------
  const width = 800;
  const totalHeight = 500;
  const kLineHeight = 300;
  const volHeight = 100;
  const macdHeight = 100;
  
  const paddingX = 10;
  const xStep = (width - paddingX * 2) / safeVisibleCount;
  const candleWidth = Math.max(xStep * 0.7, 1);

  // K線 Y軸縮放
  const lows = visibleKlines.map(k => k.low);
  const highs = visibleKlines.map(k => k.high);
  const minPrice = Math.min(...lows, klines[klines.length-1].close); 
  const maxPrice = Math.max(...highs, klines[klines.length-1].close);
  const priceRange = (maxPrice - minPrice) || 1;
  const paddedMinPrice = minPrice - priceRange * 0.05;
  const paddedMaxPrice = maxPrice + priceRange * 0.05;
  const paddedPriceRange = paddedMaxPrice - paddedMinPrice;
  const getPriceY = (price) => kLineHeight - 10 - ((price - paddedMinPrice) / paddedPriceRange) * (kLineHeight - 20);

  // 交易量 Y軸縮放
  const vols = visibleKlines.map(k => k.volume);
  const maxVol = Math.max(...vols, 1);
  const getVolY = (vol) => totalHeight - macdHeight - 5 - (vol / maxVol) * (volHeight - 10);

  // MACD Y軸縮放
  let maxMacdAbs = 0.0001;
  visibleMacd.forEach(m => {
    maxMacdAbs = Math.max(maxMacdAbs, Math.abs(m.dif), Math.abs(m.dea), Math.abs(m.hist));
  });
  const getMacdY = (val) => totalHeight - (macdHeight / 2) - (val / maxMacdAbs) * (macdHeight / 2 - 10);

  // ---------------- 畫圖與互動輔助函數 ----------------
  const getSvgCoords = (clientX, clientY) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = totalHeight / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const xToTime = (x) => {
    const dataIndex = Math.floor((x - paddingX) / xStep);
    const boundedIndex = Math.max(0, Math.min(dataIndex, safeVisibleCount - 1));
    return visibleKlines[boundedIndex]?.time;
  };

  const yToPrice = (y) => paddedMinPrice + ((kLineHeight - 10 - y) / (kLineHeight - 20)) * paddedPriceRange;

  const timeToX = (time) => {
    const absoluteIndex = klines.findIndex(k => k.time === time);
    if (absoluteIndex === -1) return -1000;
    const visibleIndex = absoluteIndex - startIndex;
    return paddingX + visibleIndex * xStep + candleWidth / 2;
  };

  const startDrawing = (clientX, clientY) => {
    if (!drawMode) return;
    const coords = getSvgCoords(clientX, clientY);
    const t1 = xToTime(coords.x);
    const p1 = yToPrice(coords.y);
    if (t1) setCurrentDrawing({ t1, p1, t2: t1, p2: p1 });
  };

  const updateDrawing = (clientX, clientY) => {
    if (!drawMode || !currentDrawing) return;
    const coords = getSvgCoords(clientX, clientY);
    const t2 = xToTime(coords.x);
    const p2 = yToPrice(coords.y);
    if (t2) setCurrentDrawing(prev => ({ ...prev, t2, p2 }));
  };

  const finishDrawing = () => {
    if (!drawMode || !currentDrawing) return;
    setDrawings(prev => [...prev, currentDrawing]);
    setCurrentDrawing(null);
  };

  const updateHover = (clientX) => {
    const coords = getSvgCoords(clientX, 0);
    const dataIndex = Math.floor((coords.x - paddingX) / xStep);
    if (dataIndex >= 0 && dataIndex < visibleKlines.length) {
        setHoveredIndex(dataIndex);
    } else {
        setHoveredIndex(null);
    }
  };

  // 處理滾輪縮放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e) => {
      e.preventDefault(); 
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      let newCount = Math.round(visibleCount * zoomFactor);
      
      newCount = Math.max(15, Math.min(newCount, dataLen));
      
      setVisibleCount(newCount);
      const newMaxOffset = Math.max(0, dataLen - newCount);
      if (endIndexOffset > newMaxOffset) {
        setEndIndexOffset(newMaxOffset);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [visibleCount, dataLen, endIndexOffset]);

  // 滑鼠事件
  const handleMouseDown = (e) => {
    if (drawMode) startDrawing(e.clientX, e.clientY);
    else {
      setIsDragging(true);
      setDragStartX(e.clientX);
    }
  };
  
  const handleMouseUp = () => {
    if (drawMode) finishDrawing();
    else setIsDragging(false);
  };

  const handleMouseLeave = () => {
    if (drawMode) finishDrawing();
    setIsDragging(false);
    setHoveredIndex(null);
  };
  
  const handleMouseMove = (e) => {
    if (drawMode) {
      updateDrawing(e.clientX, e.clientY);
    } else if (isDragging) {
      const dx = e.clientX - dragStartX;
      const sensitivity = 5; 
      if (Math.abs(dx) > sensitivity) {
        const shift = Math.round(dx / sensitivity);
        setEndIndexOffset(prev => Math.max(0, Math.min(prev + shift, maxOffset)));
        setDragStartX(e.clientX);
      }
    } else {
      updateHover(e.clientX);
    }
  };

  // 手機觸控事件 (解決無法縮放平移問題)
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      if (drawMode) {
        startDrawing(e.touches[0].clientX, e.touches[0].clientY);
      } else {
        setIsDragging(true);
        setDragStartX(e.touches[0].clientX);
        updateHover(e.touches[0].clientX); // 觸控時顯示資訊
      }
    } else if (e.touches.length === 2 && !drawMode) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchDist(dist);
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 1) {
      if (drawMode) {
        updateDrawing(e.touches[0].clientX, e.touches[0].clientY);
      } else if (isDragging) {
        const dx = e.touches[0].clientX - dragStartX;
        const sensitivity = 3; // 手機滑動靈敏度略高
        if (Math.abs(dx) > sensitivity) {
          const shift = Math.round(dx / sensitivity);
          setEndIndexOffset(prev => Math.max(0, Math.min(prev + shift, maxOffset)));
          setDragStartX(e.touches[0].clientX);
        }
      }
      if (!drawMode) updateHover(e.touches[0].clientX);
    } else if (e.touches.length === 2 && !drawMode) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (touchDist > 0) {
        const diff = dist - touchDist;
        if (Math.abs(diff) > 5) {
          const zoomFactor = diff > 0 ? 0.95 : 1.05; 
          let newCount = Math.round(visibleCount * zoomFactor);
          newCount = Math.max(15, Math.min(newCount, dataLen));
          setVisibleCount(newCount);
          const newMaxOffset = Math.max(0, dataLen - newCount);
          if (endIndexOffset > newMaxOffset) {
            setEndIndexOffset(newMaxOffset);
          }
          setTouchDist(dist);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (drawMode) finishDrawing();
    setIsDragging(false);
    setTouchDist(0);
  };

  // 按鈕功能
  const zoomIn = () => setVisibleCount(prev => Math.max(15, Math.round(prev * 0.8)));
  const zoomOut = () => setVisibleCount(prev => Math.min(dataLen, Math.round(prev * 1.2)));
  const resetZoom = () => {
    setVisibleCount(60);
    setEndIndexOffset(0);
  };

  let difPath = "";
  let deaPath = "";
  const hoveredK = hoveredIndex !== null ? visibleKlines[hoveredIndex] : null;

  return (
    <div className="w-full relative group touch-none" style={{ height: '500px' }}>
      
      {/* 互動按鈕列 (加入畫圖工具按鈕，並確保手機版常態可見或半透明) */}
      <div className="absolute top-2 right-2 flex gap-1.5 z-10 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => setDrawMode(!drawMode)} className={`p-1.5 rounded backdrop-blur border border-[#2a2f3a] ${drawMode ? 'bg-amber-500/20 text-amber-500' : 'bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300'}`} title="畫線工具">
          <Pencil className="w-4 h-4" />
        </button>
        {drawings.length > 0 && (
          <button onClick={() => setDrawings([])} className="p-1.5 bg-[#1a1e27]/80 hover:bg-red-500/20 text-red-400 rounded backdrop-blur border border-[#2a2f3a]" title="清除所有畫線">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <div className="w-px h-6 bg-[#2a2f3a] mx-1 self-center"></div>
        <button onClick={zoomIn} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded backdrop-blur border border-[#2a2f3a]">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button onClick={zoomOut} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded backdrop-blur border border-[#2a2f3a]">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button onClick={resetZoom} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded backdrop-blur border border-[#2a2f3a]">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Hover 資訊顯示 (左上角) */}
      <div className="absolute top-2 left-2 flex gap-3 text-[11px] font-mono z-10 pointer-events-none">
        {hoveredK ? (
          <div className="flex gap-3 bg-[#0b0e14]/80 backdrop-blur px-2 py-1 rounded border border-[#2a2f3a]">
            <span className="text-slate-400">{new Date(hoveredK.time).toLocaleString(undefined, {hour12:false, month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
            <span className="text-slate-500">O:<span className="text-white ml-1">{formatPrice(hoveredK.open)}</span></span>
            <span className="text-slate-500">H:<span className="text-white ml-1">{formatPrice(hoveredK.high)}</span></span>
            <span className="text-slate-500">L:<span className="text-white ml-1">{formatPrice(hoveredK.low)}</span></span>
            <span className="text-slate-500">C:<span className={hoveredK.close >= hoveredK.open ? "text-[#0ecb81] ml-1" : "text-[#f6465d] ml-1"}>{formatPrice(hoveredK.close)}</span></span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-500 bg-[#0b0e14]/50 backdrop-blur px-2 py-1 rounded">
             <MoveHorizontal className="w-3.5 h-3.5" /> 滾輪縮放 / 拖曳平移
          </div>
        )}
      </div>

      {/* SVG 繪圖容器 */}
      <div 
        ref={containerRef}
        className={`w-full h-full overflow-hidden touch-none ${drawMode ? 'cursor-crosshair' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          {/* 背景格線 */}
          <line x1="0" y1={kLineHeight} x2={width} y2={kLineHeight} stroke="#2a2f3a" strokeWidth="1" />
          <line x1="0" y1={kLineHeight + volHeight} x2={width} y2={kLineHeight + volHeight} stroke="#2a2f3a" strokeWidth="1" />
          
          {/* MACD 零軸 */}
          <line x1="0" y1={totalHeight - macdHeight/2} x2={width} y2={totalHeight - macdHeight/2} stroke="#2a2f3a" strokeWidth="1" strokeDasharray="4 4" />

          {/* 繪製 K 線資料 */}
          {visibleKlines.map((k, i) => {
            const x = paddingX + i * xStep;
            const isUp = k.close >= k.open;
            const color = isUp ? '#0ecb81' : '#f6465d';
            
            const openY = getPriceY(k.open);
            const closeY = getPriceY(k.close);
            const highY = getPriceY(k.high);
            const lowY = getPriceY(k.low);
            
            const bodyY = Math.min(openY, closeY);
            const bodyH = Math.max(Math.abs(openY - closeY), 1);

            const volY = getVolY(k.volume);
            const volH = (totalHeight - macdHeight) - volY;

            const macd = visibleMacd[i];
            if (macd) {
               const cx = x + candleWidth / 2;
               difPath += `${i===0?'M':'L'}${cx},${getMacdY(macd.dif)} `;
               deaPath += `${i===0?'M':'L'}${cx},${getMacdY(macd.dea)} `;
               
               const histY = getMacdY(Math.max(macd.hist, 0));
               const histZero = getMacdY(0);
               const histH = Math.abs(getMacdY(macd.hist) - histZero) || 1;
               const histColor = macd.hist >= 0 ? '#0ecb81' : '#f6465d';

               return (
                 <g key={k.time || i}>
                   {/* 十字線 (Hover狀態) */}
                   {hoveredIndex === i && (
                     <g>
                       <line x1={cx} y1={0} x2={cx} y2={totalHeight} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
                       <line x1={0} y1={closeY} x2={width} y2={closeY} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" />
                     </g>
                   )}
                   
                   <line x1={x + candleWidth/2} y1={highY} x2={x + candleWidth/2} y2={lowY} stroke={color} strokeWidth="1.5" />
                   <rect x={x} y={bodyY} width={candleWidth} height={bodyH} fill={color} stroke={color} strokeWidth="1" />
                   <rect x={x} y={volY} width={candleWidth} height={volH} fill={color} opacity={hoveredIndex === i ? "0.7" : "0.4"} />
                   <rect x={x + candleWidth/4} y={macd.hist >= 0 ? histY : histZero} width={candleWidth/2} height={histH} fill={histColor} opacity="0.6" />
                 </g>
               );
            }
            return null;
          })}

          {/* MACD 均線 */}
          <path d={difPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          <path d={deaPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" />

          {/* 繪製使用者畫線 (Trend Lines) */}
          {drawings.concat(currentDrawing ? [currentDrawing] : []).map((line, idx) => {
            const x1 = timeToX(line.t1);
            const y1 = getPriceY(line.p1);
            const x2 = timeToX(line.t2);
            const y2 = getPriceY(line.p2);
            return (
              <line key={idx} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f59e0b" strokeWidth="2" />
            );
          })}

          {/* Y軸價格標籤 */}
          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(paddedMaxPrice)}</text>
          <text x={width - 5} y={kLineHeight - 10} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(paddedMinPrice)}</text>
        </svg>
      </div>
    </div>
  );
};

// --- 主應用程序 ---
export default function App() {
  // 動態載入 Tailwind CSS 並加上 Loading 遮罩
  const [isStylesLoaded, setIsStylesLoaded] = useState(false);

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com';
      script.onload = () => setIsStylesLoaded(true);
      document.head.appendChild(script);
    } else {
      setIsStylesLoaded(true);
    }
  }, []);

  const [allTickers, setAllTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 狀態改為受 Hash 控制
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [fundingRates, setFundingRates] = useState({});

  // 模擬帳戶狀態
  const [paperAccount, setPaperAccount] = useState(() => {
    try {
      const saved = localStorage.getItem('paperAccount');
      return saved ? JSON.parse(saved) : { balance: 10000, positions: [], history: [] };
    } catch {
      return { balance: 10000, positions: [], history: [] };
    }
  });

  useEffect(() => {
    localStorage.setItem('paperAccount', JSON.stringify(paperAccount));
  }, [paperAccount]);

  const fetchFuturesData = async () => {
    try {
      const [tickerRes, fundingRes] = await Promise.all([
        fetch('https://fapi.binance.com/fapi/v1/ticker/24hr'),
        fetch('https://fapi.binance.com/fapi/v1/premiumIndex')
      ]);

      if (!tickerRes.ok || !fundingRes.ok) throw new Error(`API 錯誤`);
      
      const tickersData = await tickerRes.json();
      const fundingData = await fundingRes.json();
      
      const usdtPairs = tickersData
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
      
      setAllTickers(usdtPairs);

      const frMap = {};
      fundingData.forEach(item => { frMap[item.symbol] = item.lastFundingRate; });
      setFundingRates(frMap);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('數據獲取失敗。可能受到跨域限制，請稍後重試。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFuturesData();
    // 為了避免 Binance API 頻率限制 (Rate Limit) 導致 IP 被封鎖，首頁列表最快建議 5 秒更新一次
    const interval = setInterval(fetchFuturesData, 5000); 
    return () => clearInterval(interval);
  }, []);

  // ---------------- Hash 路由邏輯 ----------------
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '');
      if (!hash) {
        setSelectedCoin(null);
      } else if (allTickers.length > 0) {
        const coin = allTickers.find(t => t.symbol === hash);
        if (coin) setSelectedCoin(coin);
      }
    };

    // 如果資料剛載入完畢且網址有帶 Hash，立刻觸發解析
    if (allTickers.length > 0) {
      handleHashChange();
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [allTickers]);

  const handleSelectCoin = (coin) => {
    window.location.hash = `/${coin.symbol}`; // 改變網址自動觸發狀態更新
  };

  const handleBackToHome = () => {
    window.location.hash = ''; // 清除網址回首頁
  };
  // ---------------------------------------------

  const filteredTickers = useMemo(() => {
    if (!searchTerm) return allTickers.slice(0, 24); 
    return allTickers.filter(t => t.symbol.includes(searchTerm.toUpperCase())).slice(0, 50); 
  }, [allTickers, searchTerm]);

  // 在 Tailwind 載入完成前，顯示簡潔的純 CSS 系統載入畫面
  if (!isStylesLoaded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#0b0e14', color: '#64748b', fontFamily: 'sans-serif' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #1e293b', borderTop: '3px solid #f59e0b', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '20px' }}></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        <div style={{ letterSpacing: '0.1em', fontSize: '14px' }}>系統載入中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="bg-[#121620] border-b border-[#2a2f3a] sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-amber-500 cursor-pointer" onClick={handleBackToHome}>
            <Zap className="w-6 h-6 fill-amber-500/20" />
            <h1 className="text-xl font-bold text-white tracking-wide">ProTrade <span className="font-light text-slate-400">Terminal</span></h1>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
             <div className="hidden sm:flex items-center gap-2 bg-[#1a1e27] px-3 py-1.5 rounded border border-[#2a2f3a]">
                <Wallet className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-mono text-white">${paperAccount.balance.toFixed(2)} USDT</span>
             </div>

            {!selectedCoin && (
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="text"
                  placeholder="搜尋合約..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-9 pr-3 py-1.5 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white focus:border-amber-500/50 focus:outline-none transition-all"
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded text-sm flex items-center gap-2 mb-6">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {selectedCoin ? (
          <TradingWorkspace 
            coin={selectedCoin} 
            fundingRate={fundingRates[selectedCoin.symbol]}
            paperAccount={paperAccount}
            setPaperAccount={setPaperAccount}
            onBack={handleBackToHome} 
          />
        ) : (
          <Dashboard tickers={filteredTickers} fundingRates={fundingRates} loading={loading} onSelectCoin={handleSelectCoin} />
        )}
      </main>
    </div>
  );
}

// --- 首頁列表組件 ---
function Dashboard({ tickers, fundingRates, loading, onSelectCoin }) {
  if (loading && tickers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mb-4 text-amber-500" />
        <p className="text-sm tracking-widest uppercase">Connecting to Binance...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {tickers.map((ticker) => {
          const change = parseFloat(ticker.priceChangePercent);
          const isPositive = change >= 0;
          const baseAsset = ticker.symbol.replace('USDT', '');
          const fr = fundingRates[ticker.symbol];
          
          let frColor = 'text-slate-500';
          if (fr > 0.0001) frColor = 'text-amber-500';
          else if (fr < 0) frColor = 'text-purple-400';

          return (
            <div 
              key={ticker.symbol}
              onClick={() => onSelectCoin(ticker)}
              className="bg-[#121620] rounded-lg p-4 border border-[#2a2f3a] hover:border-[#0ecb81]/40 cursor-pointer transition-all duration-200"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-base font-bold text-slate-100">{baseAsset}</h3>
                <div className={`text-xs font-medium ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                  {change > 0 ? '+' : ''}{change.toFixed(2)}%
                </div>
              </div>
              <div className="text-xl font-mono font-semibold text-white mb-3">
                {formatPrice(ticker.lastPrice)}
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 border-t border-[#1e2330] pt-2">
                <span>Vol: {formatVolume(ticker.quoteVolume)}</span>
                <span className={frColor}>FR: {fr !== undefined ? formatFundingRate(fr) : '--'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- 核心交易工作區 ---
function TradingWorkspace({ coin, fundingRate, paperAccount, setPaperAccount, onBack }) {
  const [klines, setKlines] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(parseFloat(coin.lastPrice));
  
  const baseAsset = coin.symbol.replace('USDT', '');

  // 模擬交易表單狀態
  const [leverage, setLeverage] = useState(10);
  const [marginInput, setMarginInput] = useState(100);

  useEffect(() => {
    let isMounted = true;

    const fetchDetailData = async () => {
      setLoadingHistory(true);
      try {
        const resKlines = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=15m&limit=120`);
        const dataKlines = await resKlines.json();
        
        if (!isMounted) return;

        const parsedKlines = dataKlines.map(c => ({
           time: c[0], // 新增保留時間戳，方便圖表 hover 時顯示日期時間
           open: parseFloat(c[1]),
           high: parseFloat(c[2]),
           low: parseFloat(c[3]),
           close: parseFloat(c[4]),
           volume: parseFloat(c[5])
        }));
        setKlines(parsedKlines);
        if(parsedKlines.length > 0) setCurrentPrice(parsedKlines[parsedKlines.length - 1].close);
      } catch (err) {
        console.error('K線數據獲取失敗', err);
      } finally {
        if(isMounted) setLoadingHistory(false);
      }
    };

    fetchDetailData();
    
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${coin.symbol}`);
            const data = await res.json();
            if(isMounted) {
                const latestPrice = parseFloat(data.price);
                setCurrentPrice(latestPrice);
                setKlines(prev => {
                    const newHist = [...prev];
                    const last = newHist[newHist.length - 1];
                    last.close = latestPrice;
                    last.high = Math.max(last.high, latestPrice);
                    last.low = Math.min(last.low, latestPrice);
                    // 這裡暫時忽略 volume 的即時跳動，保持圖表順暢
                    return newHist;
                });
            }
        } catch(e) {}
    }, 1000); // 將單一幣種報價改為 1000 毫秒 (1秒) 更新一次

    return () => { isMounted = false; clearInterval(interval); };
  }, [coin.symbol]);

  const historyCloses = useMemo(() => klines.map(k => k.close), [klines]);
  const macdSeries = useMemo(() => calculateMACDSeries(historyCloses), [historyCloses]);
  const strategy = useMemo(() => generateTradingSignal(currentPrice, historyCloses, fundingRate), [currentPrice, historyCloses, fundingRate]);

  // --- 模擬交易邏輯 ---
  const handleOpenPosition = (type) => {
    const margin = parseFloat(marginInput);
    if(margin > paperAccount.balance) return alert("餘額不足！");
    if(margin <= 0) return alert("保證金必須大於 0");

    const size = (margin * leverage) / currentPrice;
    const liqPrice = type === 'LONG' 
        ? currentPrice * (1 - 1/leverage + 0.004) 
        : currentPrice * (1 + 1/leverage - 0.004);

    const newPosition = {
        id: Date.now(),
        symbol: coin.symbol,
        type, 
        margin,
        leverage,
        size,
        entryPrice: currentPrice,
        liqPrice: Math.max(liqPrice, 0),
        openTime: new Date().toLocaleString()
    };

    setPaperAccount(prev => ({
        ...prev,
        balance: prev.balance - margin,
        positions: [...prev.positions, newPosition]
    }));
  };

  const handleClosePosition = (pos) => {
    const markPrice = currentPrice; 
    
    let pnl = 0;
    if(pos.type === 'LONG') pnl = (markPrice - pos.entryPrice) * pos.size;
    else pnl = (pos.entryPrice - markPrice) * pos.size;

    const returnAmount = pos.margin + pnl;

    setPaperAccount(prev => ({
        ...prev,
        balance: prev.balance + returnAmount,
        positions: prev.positions.filter(p => p.id !== pos.id),
        history: [{ ...pos, closePrice: markPrice, pnl, closeTime: new Date().toLocaleString() }, ...prev.history].slice(0, 50)
    }));
  };

  return (
    <div className="animate-in fade-in duration-200 pb-20">
      <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm transition-colors w-fit px-2 py-1 rounded bg-[#121620] border border-[#2a2f3a]">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* 左側：報價、AI 策略、模擬交易面板 */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* 報價卡片 */}
          <div className="bg-[#121620] rounded-lg p-5 border border-[#2a2f3a] flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-end gap-2">
                {baseAsset} <span className="text-slate-500 text-sm font-normal">USDT</span>
              </h2>
              <div className="text-3xl font-mono font-semibold text-white mt-1">
                ${formatPrice(currentPrice)}
              </div>
            </div>
            <div className="text-right">
                <span className="text-xs text-slate-500 block mb-1">Funding Rate</span>
                <span className={`text-sm font-mono ${parseFloat(fundingRate) > 0.0001 ? 'text-amber-500' : parseFloat(fundingRate) < 0 ? 'text-purple-400' : 'text-slate-200'}`}>
                    {fundingRate ? formatFundingRate(fundingRate) : '--'}
                </span>
            </div>
          </div>

          {/* 模擬交易下單區 */}
          <div className="bg-[#121620] rounded-lg border border-[#2a2f3a] p-4 relative overflow-hidden">
             <div className="absolute top-0 right-0 bg-blue-600 text-[10px] text-white px-2 py-0.5 rounded-bl font-bold">PAPER TRADING</div>
             <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
                 <PieChart className="w-4 h-4 text-blue-400" /> 模擬合約交易
             </h3>
             
             <div className="space-y-4">
                 <div>
                     <div className="flex justify-between text-xs text-slate-400 mb-1">
                         <label>槓桿倍數 (Leverage)</label>
                         <span>{leverage}x</span>
                     </div>
                     <input type="range" min="1" max="50" value={leverage} onChange={(e) => setLeverage(e.target.value)} className="w-full accent-blue-500" />
                 </div>
                 
                 <div>
                     <label className="text-xs text-slate-400 mb-1 block">保證金 (Margin USDT)</label>
                     <div className="relative">
                         <input type="number" value={marginInput} onChange={(e) => setMarginInput(e.target.value)} className="w-full bg-[#1a1e27] border border-[#2a2f3a] rounded p-2 text-white font-mono text-sm focus:border-blue-500 outline-none" />
                         <span className="absolute right-3 top-2 text-xs text-slate-500">USDT</span>
                     </div>
                     <div className="text-right text-[10px] text-slate-500 mt-1">可用餘額: ${paperAccount.balance.toFixed(2)}</div>
                 </div>

                 <div className="grid grid-cols-2 gap-2 pt-2">
                     <button onClick={() => handleOpenPosition('LONG')} className="bg-[#0ecb81]/10 hover:bg-[#0ecb81]/20 text-[#0ecb81] border border-[#0ecb81]/30 py-2.5 rounded font-bold transition-colors">
                         開多 (Long)
                     </button>
                     <button onClick={() => handleOpenPosition('SHORT')} className="bg-[#f6465d]/10 hover:bg-[#f6465d]/20 text-[#f6465d] border border-[#f6465d]/30 py-2.5 rounded font-bold transition-colors">
                         開空 (Short)
                     </button>
                 </div>
             </div>
          </div>

          {/* AI 策略面板 */}
          {strategy && (
            <div className="bg-[#121620] rounded-lg border border-[#2a2f3a] overflow-hidden">
                <div className="p-3 border-b border-[#2a2f3a] bg-[#1a1e27] flex justify-between items-center">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Crosshair className="w-3.5 h-3.5 text-amber-500" /> AI 策略分析 (15m)
                    </h3>
                </div>
                <div className="p-4">
                    <div className="flex items-center justify-between mb-4 bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330]">
                        <div>
                            <span className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider block">Direction</span>
                            <div className={`text-2xl font-black tracking-widest ${strategy.signal === 'LONG' ? 'text-[#0ecb81]' : strategy.signal === 'SHORT' ? 'text-[#f6465d]' : 'text-slate-400'}`}>
                                {strategy.signal}
                            </div>
                        </div>
                        {strategy.signal !== 'NEUTRAL' && (
                            <div className="text-right">
                                <span className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Win Rate</span>
                                <span className="text-xl font-mono text-white">{strategy.confidence}%</span>
                            </div>
                        )}
                    </div>
                    {/* Log */}
                    <div className="border-t border-[#2a2f3a] pt-3">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 block">Analysis Log</span>
                        <div className="space-y-1.5">
                            {strategy.analysisLog.map((log, idx) => (
                                <div key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.includes('+') ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`}></span>
                                    {log}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
          )}
        </div>

        {/* 右側：專業 K 線圖表與當前倉位 */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* 真實 K 線圖 + 副圖 */}
          <div className="bg-[#121620] rounded-lg p-1 border border-[#2a2f3a] flex flex-col relative">
             <div className="px-3 py-2 border-b border-[#2a2f3a] flex justify-between items-center bg-[#1a1e27] rounded-t-lg">
                 <span className="text-xs font-semibold text-slate-300 uppercase flex gap-4">
                     <span>K-LINE</span>
                     <span className="text-slate-500">VOL</span>
                     <span className="text-slate-500">MACD(12,26,9)</span>
                 </span>
                 <span className="text-[10px] text-slate-500 bg-[#0b0e14] px-2 py-0.5 rounded border border-[#2a2f3a]">15m Interval</span>
             </div>
             <div className="relative p-2 bg-[#0b0e14]">
                {loadingHistory ? (
                    <div className="h-[500px] flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-slate-600" />
                    </div>
                ) : (
                    <AdvancedKLineChart klines={klines} macdSeries={macdSeries} />
                )}
             </div>
          </div>

          {/* 當前持倉列表 (Paper Trading) */}
          <div className="bg-[#121620] rounded-lg border border-[#2a2f3a] overflow-hidden">
              <div className="p-3 border-b border-[#2a2f3a] bg-[#1a1e27]">
                 <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Current Positions (Simulated)</h3>
              </div>
              <div className="p-0 overflow-x-auto">
                 <table className="w-full text-left text-xs whitespace-nowrap">
                     <thead className="bg-[#0b0e14] text-slate-500">
                         <tr>
                             <th className="px-4 py-2 font-normal">合約</th>
                             <th className="px-4 py-2 font-normal">方向/槓桿</th>
                             <th className="px-4 py-2 font-normal text-right">數量(Size)</th>
                             <th className="px-4 py-2 font-normal text-right">開倉價</th>
                             <th className="px-4 py-2 font-normal text-right">強平價</th>
                             <th className="px-4 py-2 font-normal text-right">未實現盈虧 (ROE%)</th>
                             <th className="px-4 py-2 font-normal text-center">操作</th>
                         </tr>
                     </thead>
                     <tbody className="divide-y divide-[#2a2f3a]">
                         {paperAccount.positions.filter(p => p.symbol === coin.symbol).map(pos => {
                             // 即時計算損益
                             let pnl = 0;
                             if(pos.type === 'LONG') pnl = (currentPrice - pos.entryPrice) * pos.size;
                             else pnl = (pos.entryPrice - currentPrice) * pos.size;
                             const roe = (pnl / pos.margin) * 100;
                             const isProfit = pnl >= 0;

                             return (
                                 <tr key={pos.id} className="hover:bg-[#1a1e27] transition-colors">
                                     <td className="px-4 py-3 font-bold text-white">{pos.symbol}</td>
                                     <td className="px-4 py-3">
                                         <span className={`px-1.5 py-0.5 rounded font-bold ${pos.type === 'LONG' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
                                             {pos.type} {pos.leverage}x
                                         </span>
                                     </td>
                                     <td className="px-4 py-3 text-right font-mono text-slate-300">{pos.size.toFixed(4)}</td>
                                     <td className="px-4 py-3 text-right font-mono text-slate-300">${formatPrice(pos.entryPrice)}</td>
                                     <td className="px-4 py-3 text-right font-mono text-amber-500/80">${formatPrice(pos.liqPrice)}</td>
                                     <td className="px-4 py-3 text-right">
                                         <div className={`font-mono font-bold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                             {isProfit ? '+' : ''}{pnl.toFixed(2)} USDT
                                         </div>
                                         <div className={`text-[10px] ${isProfit ? 'text-[#0ecb81]/70' : 'text-[#f6465d]/70'}`}>
                                             {isProfit ? '+' : ''}{roe.toFixed(2)}%
                                         </div>
                                     </td>
                                     <td className="px-4 py-3 text-center">
                                         <button onClick={() => handleClosePosition(pos)} className="text-slate-400 hover:text-white transition-colors bg-[#2a2f3a] hover:bg-[#f6465d] px-2 py-1 rounded">
                                             平倉
                                         </button>
                                     </td>
                                 </tr>
                             );
                         })}
                         {paperAccount.positions.filter(p => p.symbol === coin.symbol).length === 0 && (
                             <tr>
                                 <td colSpan="7" className="px-4 py-8 text-center text-slate-500">目前無持倉紀錄</td>
                             </tr>
                         )}
                     </tbody>
                 </table>
              </div>
          </div>

        </div>

      </div>
    </div>
  );
}
