import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Crosshair
} from 'lucide-react';

// ==========================================
// 1. 內嵌全域 CSS 樣式
// ==========================================
const injectedCSS = `
  :root {
    --bg-main: #0b0e14;
    --bg-panel: #121620;
    --bg-card: #1a1e27;
    --border: #2a2f3a;
    --text-main: #f1f5f9;
    --text-muted: #94a3b8;
    --text-dark: #64748b;
    --green: #0ecb81;
    --red: #f6465d;
    --amber: #f59e0b;
    --blue: #60a5fa;
    --orange: #fb923c;
  }
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg-main); color: var(--text-main); font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  
  /* Layout & Flexbox */
  .flex { display: flex; }
  .flex-col { flex-direction: column; }
  .items-center { align-items: center; }
  .items-start { align-items: flex-start; }
  .items-end { align-items: flex-end; }
  .justify-between { justify-content: space-between; }
  .justify-center { justify-content: center; }
  .gap-1 { gap: 4px; }
  .gap-2 { gap: 8px; }
  .gap-3 { gap: 12px; }
  .gap-4 { gap: 16px; }
  
  /* Typography */
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .font-bold { font-weight: 700; }
  .font-semibold { font-weight: 600; }
  .font-mono { font-family: monospace; }
  .text-xs { font-size: 0.75rem; }
  .text-sm { font-size: 0.875rem; }
  .text-base { font-size: 1rem; }
  .text-lg { font-size: 1.125rem; }
  .text-xl { font-size: 1.25rem; }
  .text-2xl { font-size: 1.5rem; }
  .text-3xl { font-size: 1.875rem; }
  .uppercase { text-transform: uppercase; }
  .tracking-wider { letter-spacing: 0.05em; }
  .tracking-widest { letter-spacing: 0.1em; }
  
  /* Colors */
  .text-green { color: var(--green); }
  .text-red { color: var(--red); }
  .text-amber { color: var(--amber); }
  .text-muted { color: var(--text-muted); }
  .text-dark { color: var(--text-dark); }
  .text-white { color: #fff; }
  .text-blue { color: var(--blue); }
  .text-orange { color: var(--orange); }
  
  .bg-main { background-color: var(--bg-main); }
  .bg-panel { background-color: var(--bg-panel); }
  .bg-card { background-color: var(--bg-card); }
  
  /* Borders & Radius */
  .border { border: 1px solid var(--border); }
  .border-b { border-bottom: 1px solid var(--border); }
  .border-t { border-top: 1px solid var(--border); }
  .rounded { border-radius: 0.25rem; }
  .rounded-md { border-radius: 0.375rem; }
  .rounded-lg { border-radius: 0.5rem; }
  .rounded-full { border-radius: 9999px; }
  
  /* Spacing */
  .p-2 { padding: 0.5rem; }
  .p-3 { padding: 0.75rem; }
  .p-4 { padding: 1rem; }
  .p-5 { padding: 1.25rem; }
  .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
  .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
  .py-6 { padding-top: 1.5rem; padding-bottom: 1.5rem; }
  .py-20 { padding-top: 5rem; padding-bottom: 5rem; }
  .mb-1 { margin-bottom: 0.25rem; }
  .mb-2 { margin-bottom: 0.5rem; }
  .mb-3 { margin-bottom: 0.75rem; }
  .mb-4 { margin-bottom: 1rem; }
  .mb-5 { margin-bottom: 1.25rem; }
  .mt-1 { margin-top: 0.25rem; }
  .mt-2 { margin-top: 0.5rem; }
  .mt-3 { margin-top: 0.75rem; }
  .mt-4 { margin-top: 1rem; }
  .pt-3 { padding-top: 0.75rem; }
  
  /* Specific Components */
  .app-header { background: var(--bg-panel); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 20; }
  .container { max-width: 1280px; margin: 0 auto; padding-left: 1rem; padding-right: 1rem; }
  
  .search-wrapper { position: relative; width: 100%; max-width: 384px; }
  .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-dark); }
  .search-input { width: 100%; padding: 8px 12px 8px 36px; background: var(--bg-card); border: 1px solid var(--border); color: #fff; border-radius: 4px; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
  .search-input:focus { border-color: rgba(245, 158, 11, 0.5); }
  
  /* Grids */
  .grid-dashboard { display: grid; grid-template-columns: repeat(1, 1fr); gap: 12px; }
  @media (min-width: 640px) { .grid-dashboard { grid-template-columns: repeat(2, 1fr); } }
  @media (min-width: 1024px) { .grid-dashboard { grid-template-columns: repeat(4, 1fr); } }
  
  .grid-detail { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (min-width: 1024px) { .grid-detail { grid-template-columns: 5fr 7fr; } }
  
  .grid-indicators { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (min-width: 640px) { .grid-indicators { grid-template-columns: 1fr 1fr; } }
  
  /* Hover Effects */
  .card-hover { cursor: pointer; transition: all 0.2s; }
  .card-hover:hover { border-color: rgba(14, 203, 129, 0.4); transform: translateY(-2px); }
  
  .btn-back { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-muted); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.875rem; transition: all 0.2s; margin-bottom: 16px; }
  .btn-back:hover { color: #fff; background: var(--bg-card); }
  
  /* Animations */
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .animate-spin { animation: spin 1s linear infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  
  /* Custom Elements */
  .stat-box { background: rgba(26, 30, 39, 0.5); padding: 10px; border-radius: 4px; border: 1px solid rgba(42, 47, 58, 0.5); }
  .rsi-bar-container { position: relative; height: 6px; background: var(--bg-card); border-radius: 9999px; overflow: hidden; margin-top: 8px; }
  .rsi-bar-marker { position: absolute; top: 0; width: 1px; height: 100%; background: var(--border); z-index: 10; }
  .rsi-bar-fill { position: absolute; top: 0; left: 0; height: 100%; transition: width 0.3s, background-color 0.3s; }
  
  /* Tabs UI */
  .tabs-container { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .tabs-group { display: flex; gap: 6px; }
  .tab-btn { background: transparent; border: 1px solid transparent; color: var(--text-muted); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 0.875rem; transition: all 0.2s; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .tab-btn:hover { color: var(--text-main); background: rgba(255,255,255,0.05); }
  .tab-btn.active { background: var(--bg-card); color: var(--text-main); border-color: var(--border); }
  .tab-btn.long.active { border-bottom: 2px solid var(--green); color: var(--green); border-bottom-left-radius: 2px; border-bottom-right-radius: 2px; }
  .tab-btn.short.active { border-bottom: 2px solid var(--red); color: var(--red); border-bottom-left-radius: 2px; border-bottom-right-radius: 2px; }
  
  .signal-badge { padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; margin-left: 8px; }
  .signal-badge.long { background: rgba(14, 203, 129, 0.1); color: var(--green); border: 1px solid rgba(14, 203, 129, 0.3); }
  .signal-badge.short { background: rgba(246, 70, 93, 0.1); color: var(--red); border: 1px solid rgba(246, 70, 93, 0.3); }
  .signal-badge.neutral { background: rgba(148, 163, 184, 0.1); color: var(--text-muted); border: 1px solid rgba(148, 163, 184, 0.3); }
  
  .btn-scan { display: flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); color: var(--amber); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.875rem; transition: all 0.2s; font-weight: 600; }
  .btn-scan:hover:not(:disabled) { background: rgba(245, 158, 11, 0.2); }
  .btn-scan:disabled { opacity: 0.5; cursor: not-allowed; }

  .block { display: block; }
  .w-full { width: 100%; }
  .h-full { height: 100%; }
  .relative { position: relative; }
  .absolute { position: absolute; }
  .overflow-hidden { overflow: hidden; }
  .flex-shrink-0 { flex-shrink: 0; }
`;

// ==========================================
// 2. 輔助函數與指標計算
// ==========================================
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

const calculateMACD = (prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  if (prices.length < slowPeriod + signalPeriod) return { dif: 0, dea: 0, hist: 0 };
  
  const difArray = [];
  let fastEMA = prices.slice(0, fastPeriod).reduce((a, b) => a + b, 0) / fastPeriod;
  let slowEMA = prices.slice(0, slowPeriod).reduce((a, b) => a + b, 0) / slowPeriod;
  
  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);

  for(let i = slowPeriod; i < prices.length; i++){
      fastEMA = (prices[i] - fastEMA) * kFast + fastEMA;
      slowEMA = (prices[i] - slowEMA) * kSlow + slowEMA;
      difArray.push(fastEMA - slowEMA);
  }

  const currentDIF = difArray[difArray.length - 1];
  
  let dea = difArray.slice(0, signalPeriod).reduce((a,b)=>a+b,0) / signalPeriod;
  const kSignal = 2 / (signalPeriod + 1);
  for(let i = signalPeriod; i < difArray.length; i++){
      dea = (difArray[i] - dea) * kSignal + dea;
  }

  const hist = (currentDIF - dea) * 2; 

  return { dif: currentDIF, dea: dea, hist: hist };
};

const calculateBOLL = (prices, period = 20, multiplier = 2) => {
    if (prices.length < period) return { upper: null, mid: null, lower: null };
    
    const recentPrices = prices.slice(-period);
    const mid = recentPrices.reduce((a, b) => a + b, 0) / period;
    
    const variance = recentPrices.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
        upper: mid + (stdDev * multiplier),
        mid: mid,
        lower: mid - (stdDev * multiplier)
    };
};

const calculateVolatility = (prices, period = 14) => {
    if (prices.length < period) return 0.01;
    const recentPrices = prices.slice(-period);
    const mean = recentPrices.reduce((a, b) => a + b, 0) / period;
    const variance = recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    return (stdDev / mean);
};

// --- 多維度合約交易策略引擎 ---
const generateTradingSignal = (currentPrice, history, fundingRate) => {
  if (!history || history.length < 50) return null;

  const price = parseFloat(currentPrice);
  const fr = parseFloat(fundingRate || 0);

  const rsi = calculateRSI(history, 14);
  const sma7 = calculateSMA(history, 7);  
  const sma20 = calculateSMA(history, 20); 
  const macd = calculateMACD(history, 12, 26, 9);
  const boll = calculateBOLL(history, 20, 2);
  const volatilityPct = calculateVolatility(history, 14);

  let signal = 'NEUTRAL';
  let score = 0; 
  let analysisLog = []; 

  if (sma7 && sma20) {
    if (sma7 > sma20 && price > sma7) {
        score += 1.5; 
        analysisLog.push("+1.5 均線多頭排列");
    }
    else if (sma7 < sma20 && price < sma7) {
        score -= 1.5; 
        analysisLog.push("-1.5 均線空頭排列");
    }
  }

  if (macd.dif > macd.dea && macd.hist > 0) {
      score += 2;
      analysisLog.push("+2.0 MACD 金叉多頭");
  } else if (macd.dif < macd.dea && macd.hist < 0) {
      score -= 2;
      analysisLog.push("-2.0 MACD 死叉空頭");
  }

  if (boll.lower && price <= boll.lower) {
      score += 2.5; 
      analysisLog.push("+2.5 觸及布林下軌(超賣)");
  } else if (boll.upper && price >= boll.upper) {
      score -= 2.5; 
      analysisLog.push("-2.5 觸及布林上軌(超買)");
  } else if (boll.mid) {
      if (price > boll.mid) score += 0.5;
      else score -= 0.5;
  }

  if (rsi < 30) { score += 1.5; analysisLog.push("+1.5 RSI 超賣"); }
  else if (rsi > 70) { score -= 1.5; analysisLog.push("-1.5 RSI 超買"); }

  if (fr > 0.0004) { score -= 1.5; analysisLog.push("-1.5 資金費率過熱偏空"); }
  else if (fr < -0.0001) { score += 1.5; analysisLog.push("+1.5 資金費率負值偏多"); }

  if (score >= 4) signal = 'LONG';
  else if (score <= -4) signal = 'SHORT';

  let recommendedEntry = price;
  let takeProfit = 0;
  let stopLoss = 0;
  const baseBuffer = Math.min(Math.max(volatilityPct * 2, 0.004), 0.03); 

  if (signal === 'LONG') {
      recommendedEntry = (price > boll.mid && boll.mid) ? (price + boll.mid) / 2 : price;
      stopLoss = recommendedEntry * (1 - baseBuffer);
      const potentialTP = boll.upper ? boll.upper : recommendedEntry * (1 + (baseBuffer * 1.5));
      takeProfit = Math.max(potentialTP, recommendedEntry * 1.005); 
  } else if (signal === 'SHORT') {
      recommendedEntry = (price < boll.mid && boll.mid) ? (price + boll.mid) / 2 : price;
      stopLoss = recommendedEntry * (1 + baseBuffer);
      const potentialTP = boll.lower ? boll.lower : recommendedEntry * (1 - (baseBuffer * 1.5));
      takeProfit = Math.min(potentialTP, recommendedEntry * 0.995);
  }

  const confidence = Math.min(Math.abs(score) * 10 + 30, 95);

  return {
    signal,
    rsi,
    sma7,
    sma20,
    macd,
    boll,
    score,
    currentPrice: price,
    entry: recommendedEntry,
    takeProfit: signal !== 'NEUTRAL' ? takeProfit : null,
    stopLoss: signal !== 'NEUTRAL' ? stopLoss : null,
    confidence: signal !== 'NEUTRAL' ? confidence : 0,
    analysisLog
  };
};

// ==========================================
// 3. SVG 走勢圖組件
// ==========================================
const LineChart = ({ data, color = '#3b82f6', height = 200 }) => {
  if (!data || data.length === 0) return null;
  const width = 800;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const paddingY = (max - min) * 0.05; 
  const displayMin = min - paddingY;
  const displayMax = max + paddingY;
  const range = displayMax - displayMin || 1;
  const paddingX = 0;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - paddingX * 2) + paddingX;
    const y = height - ((d - displayMin) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const polygonPoints = `${paddingX},${height} ${points} ${width - paddingX},${height}`;

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.5))' }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.0"/>
          </linearGradient>
        </defs>
        <polygon fill={`url(#gradient-${color})`} points={polygonPoints} />
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
    </div>
  );
};

// ==========================================
// 4. 主應用程式
// ==========================================
export default function App() {
  const [allTickers, setAllTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [fundingRates, setFundingRates] = useState({});
  
  // 新增：首頁市場掃描狀態
  const [marketSignals, setMarketSignals] = useState({});
  const [isScanning, setIsScanning] = useState(false);

  const fetchFuturesData = async () => {
    try {
      const res = await fetch(`/api/binance?action=overview`);
      if (!res.ok) throw new Error(`API 錯誤: ${res.status}`);
      const data = await res.json();
      
      const usdtPairs = data.tickers
        .filter(t => t.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
      
      setAllTickers(usdtPairs);

      const frMap = {};
      data.fundingRates.forEach(item => {
          frMap[item.symbol] = item.lastFundingRate;
      });
      setFundingRates(frMap);
      
      setError(null);
    } catch (err) {
      console.error(err);
      setError('數據獲取失敗。請確認 API 是否已正確部署於 /api/binance。');
    } finally {
      setLoading(false);
    }
  };

  // 背景自動掃描市場 (擴大到前 150 大幣種)
  const runMarketScan = useCallback(async (tickersToScan, frMap) => {
    if(tickersToScan.length === 0) return;
    setIsScanning(true);
    const topTickers = tickersToScan.slice(0, 150); // 擴大掃描範圍至前 150 大市場
    const chunkSize = 10; // 每次批發 10 個請求以加快掃描速度
    
    for (let i = 0; i < topTickers.length; i += chunkSize) {
      const chunk = topTickers.slice(i, i + chunkSize);
      const chunkSignals = {};
      
      await Promise.all(chunk.map(async (ticker) => {
        try {
          const res = await fetch(`/api/binance?action=klines&symbol=${ticker.symbol}`);
          if (res.ok) {
            const data = await res.json();
            const closes = data.map(c => parseFloat(c[4]));
            const fr = frMap[ticker.symbol];
            const sig = generateTradingSignal(ticker.lastPrice, closes, fr);
            if (sig) {
               chunkSignals[ticker.symbol] = sig;
            }
          }
        } catch(e) {}
      }));
      
      // 分段更新畫面，讓使用者感覺到進度
      setMarketSignals(prev => ({ ...prev, ...chunkSignals }));
    }
    setIsScanning(false);
  }, []);

  // 1. 初始化資料
  useEffect(() => {
    fetchFuturesData();
    let interval;
    if (!selectedCoin) {
      interval = setInterval(fetchFuturesData, 15000); 
    }
    return () => clearInterval(interval);
  }, [selectedCoin]);

  // 2. 當第一次獲取完資料時，自動觸發背景掃描
  useEffect(() => {
    if (allTickers.length > 0 && Object.keys(marketSignals).length === 0 && !isScanning) {
      runMarketScan(allTickers, fundingRates);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTickers.length]);

  const filteredTickers = useMemo(() => {
    if (!searchTerm) return allTickers.slice(0, 150); // 預設顯示擴大到 150 個市場
    const term = searchTerm.toUpperCase();
    return allTickers.filter(t => t.symbol.includes(term)).slice(0, 150); // 搜尋結果也擴大限制
  }, [allTickers, searchTerm]);

  // 全螢幕載入畫面 (處理 React 渲染後但等待 API 時的畫面)
  if (loading && allTickers.length === 0) {
    return (
      <div className="bg-main flex flex-col items-center justify-center" style={{ minHeight: '100vh' }}>
        <style dangerouslySetInnerHTML={{ __html: injectedCSS }} />
        <Zap className="animate-pulse text-amber mb-4" size={48} />
        <h1 className="text-2xl font-bold text-white tracking-widest mb-2">系統載入中...</h1>
        <p className="text-dark text-sm uppercase tracking-widest">INITIALIZING AI ENGINE</p>
      </div>
    );
  }

  return (
    <div className="bg-main" style={{ minHeight: '100vh' }}>
      <style dangerouslySetInnerHTML={{ __html: injectedCSS }} />
      
      <header className="app-header">
        <div className="container py-3 flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div className="flex items-center gap-2 text-amber">
            <Zap size={24} />
            <h1 className="text-xl font-bold text-white tracking-wide">ProSignal <span className="text-muted" style={{ fontWeight: 'normal' }}>Futures</span></h1>
          </div>
          
          {!selectedCoin && (
            <div className="search-wrapper">
              <Search className="search-icon" size={16} />
              <input
                type="text"
                placeholder="搜尋永續合約 (例: BTCUSDT)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
          )}
        </div>
      </header>

      <main className="container py-6">
        {error && (
          <div className="mb-6 p-3 rounded text-sm flex items-center gap-2" style={{ backgroundColor: 'rgba(246, 70, 93, 0.1)', color: 'var(--red)', border: '1px solid rgba(246, 70, 93, 0.3)' }}>
            <AlertCircle size={16} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {selectedCoin ? (
          <FuturesDetail 
            coin={selectedCoin} 
            fundingRate={fundingRates[selectedCoin.symbol]}
            onBack={() => setSelectedCoin(null)} 
          />
        ) : (
          <Dashboard 
            tickers={filteredTickers} 
            fundingRates={fundingRates}
            marketSignals={marketSignals}
            isScanning={isScanning}
            onRescan={() => runMarketScan(allTickers, fundingRates)}
            onSelectCoin={setSelectedCoin}
            searchTerm={searchTerm}
          />
        )}
      </main>
    </div>
  );
}

// ==========================================
// 5. 首頁列表組件 (新增多空分頁)
// ==========================================
function Dashboard({ tickers, fundingRates, marketSignals, isScanning, onRescan, onSelectCoin, searchTerm }) {
  const [activeTab, setActiveTab] = useState('ALL');

  // 計算分頁數量 (只計算目前已搜尋/過濾的結果中符合的數量)
  const longCount = tickers.filter(t => marketSignals[t.symbol]?.signal === 'LONG').length;
  const shortCount = tickers.filter(t => marketSignals[t.symbol]?.signal === 'SHORT').length;

  // 根據目前的分頁過濾幣種
  const displayedTickers = useMemo(() => {
    if (activeTab === 'LONG') {
      return tickers.filter(t => marketSignals[t.symbol]?.signal === 'LONG');
    }
    if (activeTab === 'SHORT') {
      return tickers.filter(t => marketSignals[t.symbol]?.signal === 'SHORT');
    }
    return tickers;
  }, [tickers, activeTab, marketSignals]);

  return (
    <div>
      {/* 分頁與掃描區塊 */}
      <div className="tabs-container">
        <div className="tabs-group">
          <button 
            className={`tab-btn ${activeTab === 'ALL' ? 'active' : ''}`} 
            onClick={() => setActiveTab('ALL')}
          >
            全部市場 ({tickers.length})
          </button>
          <button 
            className={`tab-btn long ${activeTab === 'LONG' ? 'active' : ''}`} 
            onClick={() => setActiveTab('LONG')}
          >
            做多 LONG ({longCount})
          </button>
          <button 
            className={`tab-btn short ${activeTab === 'SHORT' ? 'active' : ''}`} 
            onClick={() => setActiveTab('SHORT')}
          >
            做空 SHORT ({shortCount})
          </button>
        </div>
        
        <button className="btn-scan" onClick={onRescan} disabled={isScanning}>
          {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
          {isScanning ? '正在背景分析市場...' : '更新市場掃描'}
        </button>
      </div>

      {/* 列表顯示 */}
      {displayedTickers.length === 0 ? (
        <div className="text-center py-20 text-dark text-sm flex flex-col items-center">
          {isScanning ? (
             <>
                <RefreshCw size={24} className="animate-spin text-amber mb-3" />
                <p>AI 正在努力分析各幣種指標，請稍候...</p>
             </>
          ) : (
             <p>此分頁目前沒有符合條件的合約</p>
          )}
        </div>
      ) : (
        <div className="grid-dashboard">
          {displayedTickers.map((ticker) => {
            const change = parseFloat(ticker.priceChangePercent);
            const isPositive = change >= 0;
            const baseAsset = ticker.symbol.replace('USDT', '');
            const fr = fundingRates[ticker.symbol];
            const signalData = marketSignals[ticker.symbol];
            
            let frColor = 'text-muted';
            if (fr > 0.0001) frColor = 'text-amber';
            else if (fr < 0) frColor = 'text-purple';

            return (
              <div 
                key={ticker.symbol}
                onClick={() => onSelectCoin(ticker)}
                className="bg-panel rounded-lg p-4 border card-hover"
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center">
                    <h3 className="text-base font-bold text-white">{baseAsset}</h3>
                    {/* 即時策略小標籤 */}
                    {signalData?.signal === 'LONG' && <span className="signal-badge long">LONG</span>}
                    {signalData?.signal === 'SHORT' && <span className="signal-badge short">SHORT</span>}
                  </div>
                  <div className={`text-xs font-semibold ${isPositive ? 'text-green' : 'text-red'}`}>
                    {change > 0 ? '+' : ''}{change.toFixed(2)}%
                  </div>
                </div>
                <div className="text-xl font-mono font-semibold text-white mb-3 flex items-end gap-2">
                  {formatPrice(ticker.lastPrice)}
                </div>
                <div className="flex justify-between text-xs border-t pt-2" style={{ color: 'var(--text-dark)' }}>
                  <span>Vol: {formatVolume(ticker.quoteVolume)}</span>
                  <span className={frColor}>FR: {fr !== undefined ? formatFundingRate(fr) : '--'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 6. 合約詳情與策略分析
// ==========================================
function FuturesDetail({ coin, fundingRate, onBack }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(parseFloat(coin.lastPrice));
  
  const baseAsset = coin.symbol.replace('USDT', '');

  useEffect(() => {
    let isMounted = true;

    const fetchDetailData = async () => {
      setLoadingHistory(true);
      try {
        const resKlines = await fetch(`/api/binance?action=klines&symbol=${coin.symbol}`);
        const dataKlines = await resKlines.json();
        
        if (!isMounted) return;

        const closes = dataKlines.map(candle => parseFloat(candle[4]));
        setHistory(closes);
        if(closes.length > 0) {
            setCurrentPrice(closes[closes.length - 1]);
        }
      } catch (err) {
        console.error('K線數據獲取失敗', err);
      } finally {
        if(isMounted) setLoadingHistory(false);
      }
    };

    fetchDetailData();
    
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/binance?action=price&symbol=${coin.symbol}`);
            const data = await res.json();
            if(isMounted) {
                const latestPrice = parseFloat(data.price);
                setCurrentPrice(latestPrice);
                setHistory(prev => {
                    const newHist = [...prev];
                    newHist[newHist.length - 1] = latestPrice;
                    return newHist;
                });
            }
        } catch(e) {}
    }, 5000);

    return () => {
        isMounted = false;
        clearInterval(interval);
    };
  }, [coin.symbol]);

  const strategy = useMemo(() => {
    if (history.length === 0) return null;
    return generateTradingSignal(currentPrice, history, fundingRate);
  }, [currentPrice, history, fundingRate]);

  return (
    <div>
      <button 
        onClick={onBack}
        className="btn-back"
      >
        <ArrowLeft size={16} /> Back to Markets
      </button>

      <div className="grid-detail">
        
        {/* 左側：AI 策略面板 */}
        <div className="flex flex-col gap-4">
          
          <div className="bg-panel border rounded-lg p-5 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-end gap-2">
                {baseAsset} <span className="text-muted text-sm" style={{ fontWeight: 'normal' }}>USDT</span>
              </h2>
              <div className="text-3xl font-mono font-bold text-white mt-1">
                ${formatPrice(currentPrice)}
              </div>
            </div>
            <div className="text-right">
                <span className="text-xs text-dark block mb-1">Funding Rate</span>
                <span className={`text-sm font-mono ${parseFloat(fundingRate) > 0.0001 ? 'text-amber' : parseFloat(fundingRate) < 0 ? 'text-purple' : 'text-white'}`}>
                    {fundingRate ? formatFundingRate(fundingRate) : '--'}
                </span>
            </div>
          </div>

          <div className="bg-panel rounded-lg border overflow-hidden">
            <div className="p-3 border-b bg-card flex justify-between items-center">
                 <h3 className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Crosshair size={14} className="text-amber" /> Multi-Indicator Strategy (15m)
                 </h3>
            </div>
            
            {loadingHistory || !strategy ? (
                <div className="p-10 flex flex-col items-center justify-center text-dark">
                    <RefreshCw className="animate-spin mb-3 text-amber" size={24} />
                    <span className="text-xs">計算 MACD, BOLL 等多重指標中...</span>
                </div>
            ) : (
                <div className="p-4">
                    <div className="flex items-center justify-between mb-5 p-3 rounded-lg border" style={{ backgroundColor: 'var(--bg-main)' }}>
                        <div>
                            <span className="text-xs text-dark mb-1 uppercase tracking-wider block">Direction</span>
                            <div className={`text-3xl font-bold tracking-widest ${
                                strategy.signal === 'LONG' ? 'text-green' : 
                                strategy.signal === 'SHORT' ? 'text-red' : 'text-muted'
                            }`}>
                                {strategy.signal}
                            </div>
                        </div>
                        {strategy.signal !== 'NEUTRAL' && (
                            <div className="text-right">
                                <span className="text-xs text-dark mb-1 block uppercase tracking-wider">Win Rate Est.</span>
                                <span className="text-2xl font-mono text-white">{strategy.confidence}%</span>
                            </div>
                        )}
                    </div>

                    {strategy.signal !== 'NEUTRAL' && (
                        <div className="mb-5 flex flex-col gap-3">
                            <div className="bg-card p-3 rounded border flex justify-between items-center">
                                <span className="text-xs text-muted flex items-center gap-2">
                                    <Target size={14} /> 推薦入場區間 (Entry)
                                </span>
                                <span className="text-base font-mono font-bold text-white">
                                    ${formatPrice(strategy.entry)}
                                </span>
                            </div>
                            <div className="grid-indicators">
                                <div className="stat-box" style={{ borderColor: 'rgba(14, 203, 129, 0.2)' }}>
                                    <span className="text-xs text-dark block mb-1">目標止盈 (TP)</span>
                                    <span className="text-sm font-mono text-green block">${formatPrice(strategy.takeProfit)}</span>
                                </div>
                                <div className="stat-box" style={{ borderColor: 'rgba(246, 70, 93, 0.2)' }}>
                                    <span className="text-xs text-dark block mb-1">嚴格止損 (SL)</span>
                                    <span className="text-sm font-mono text-red block">${formatPrice(strategy.stopLoss)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {strategy.signal === 'NEUTRAL' && (
                         <div className="text-sm text-muted bg-card p-4 rounded-lg text-center border mb-5">
                            目前指標互相衝突或無明顯方向，建議觀望。
                         </div>
                    )}

                    <div className="border-t pt-3 mt-4">
                        <span className="text-xs text-dark uppercase tracking-wider mb-2 block">AI Analysis Log</span>
                        <div className="flex flex-col gap-2">
                            {strategy.analysisLog.map((log, idx) => (
                                <div key={idx} className="text-xs text-muted flex items-start gap-2">
                                    <span className={`mt-1 flex-shrink-0 w-1.5 h-1.5 rounded-full ${log.includes('+') ? 'bg-green' : 'bg-red'}`} style={{ backgroundColor: log.includes('+') ? 'var(--green)' : 'var(--red)' }}></span>
                                    {log}
                                </div>
                            ))}
                            {strategy.analysisLog.length === 0 && <div className="text-xs text-dark">無明顯指標特徵</div>}
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* 右側：圖表與指標儀表板 */}
        <div className="flex flex-col gap-4">
          
          <div className="bg-panel border rounded-lg overflow-hidden flex flex-col" style={{ height: '300px' }}>
             <div className="p-3 border-b flex justify-between items-center">
                 <span className="text-xs font-semibold text-muted uppercase tracking-wider">Price Chart (15m)</span>
                 <span className="text-xs text-dark">Last 24H</span>
             </div>
             <div className="relative flex-grow bg-main p-2">
                {loadingHistory ? (
                    <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                        <RefreshCw className="animate-spin text-dark" size={24} />
                    </div>
                ) : history.length > 0 ? (
                    <LineChart 
                        data={history} 
                        color={strategy?.signal === 'LONG' ? '#0ecb81' : strategy?.signal === 'SHORT' ? '#f6465d' : '#94a3b8'} 
                        height={250} 
                    />
                ) : null}
             </div>
          </div>

          {!loadingHistory && strategy && (
            <div className="grid-indicators">
               
               <div className="bg-panel border rounded-lg p-4">
                   <span className="text-xs text-muted uppercase tracking-wider mb-3 block">Bollinger Bands (20,2)</span>
                   <div className="flex flex-col gap-2">
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-dark">Upper (壓力)</span>
                           <span className="font-mono text-muted">${formatPrice(strategy.boll?.upper)}</span>
                       </div>
                       <div className="flex justify-between items-center text-xs bg-card p-1 rounded">
                           <span className="text-amber" style={{ opacity: 0.8 }}>Mid (中軌)</span>
                           <span className="font-mono text-amber" style={{ opacity: 0.8 }}>${formatPrice(strategy.boll?.mid)}</span>
                       </div>
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-dark">Lower (支撐)</span>
                           <span className="font-mono text-muted">${formatPrice(strategy.boll?.lower)}</span>
                       </div>
                   </div>
                   <div className="mt-3 pt-3 border-t text-xs text-dark">
                       目前價格: <span className={currentPrice > strategy.boll?.mid ? 'text-green' : 'text-red'}>
                           {currentPrice > strategy.boll?.upper ? '突破上軌 (超買)' : 
                            currentPrice < strategy.boll?.lower ? '跌破下軌 (超賣)' : 
                            currentPrice > strategy.boll?.mid ? '中軌上方 (偏多)' : '中軌下方 (偏空)'}
                       </span>
                   </div>
               </div>

               <div className="bg-panel border rounded-lg p-4 flex flex-col justify-between">
                   <span className="text-xs text-muted uppercase tracking-wider mb-2 block">MACD (12,26,9)</span>
                   <div className="flex justify-between items-end mb-2">
                       <div className="text-xs text-dark">
                           DIF: <span className="text-blue">{strategy.macd?.dif.toFixed(4)}</span><br/>
                           DEA: <span className="text-orange">{strategy.macd?.dea.toFixed(4)}</span>
                       </div>
                       <div className={`text-xl font-bold font-mono ${strategy.macd?.hist > 0 ? 'text-green' : 'text-red'}`}>
                           {strategy.macd?.hist > 0 ? '+' : ''}{strategy.macd?.hist.toFixed(4)}
                       </div>
                   </div>
                   <div className="text-xs text-muted bg-card p-2 rounded text-center">
                       {strategy.macd?.dif > strategy.macd?.dea ? '✅ 金叉 (多頭動能)' : '❌ 死叉 (空頭動能)'}
                   </div>
               </div>

               <div className="bg-panel border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-muted uppercase tracking-wider">RSI (14)</span>
                      <span className={`text-lg font-mono font-bold ${
                          strategy.rsi > 70 ? 'text-red' : strategy.rsi < 30 ? 'text-green' : 'text-white'
                      }`}>
                          {strategy.rsi.toFixed(2)}
                      </span>
                  </div>
                  <div className="rsi-bar-container">
                      <div className="rsi-bar-marker" style={{ left: '30%' }}></div>
                      <div className="rsi-bar-marker" style={{ left: '70%' }}></div>
                      <div className="rsi-bar-fill" style={{ 
                          width: `${Math.min(Math.max(strategy.rsi, 0), 100)}%`,
                          backgroundColor: strategy.rsi > 70 ? 'var(--red)' : strategy.rsi < 30 ? 'var(--green)' : 'var(--text-dark)'
                      }}></div>
                  </div>
               </div>

               <div className="bg-panel border rounded-lg p-4">
                   <span className="text-xs text-muted uppercase tracking-wider mb-3 block">Trend (SMA)</span>
                   <div className="flex flex-col gap-2">
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-dark">SMA 7:</span>
                           <span className="font-mono text-muted">${formatPrice(strategy.sma7)}</span>
                       </div>
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-dark">SMA 20:</span>
                           <span className="font-mono text-muted">${formatPrice(strategy.sma20)}</span>
                       </div>
                   </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
