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
  Crosshair,
  Wallet,
  PieChart,
  XSquare
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

// --- 組件：專業 SVG K線圖表 (包含 MACD 與 Volume) ---
const AdvancedKLineChart = ({ klines, macdSeries }) => {
  if (!klines || klines.length === 0) return null;
  
  const width = 800;
  const totalHeight = 500;
  const kLineHeight = 300;
  const volHeight = 100;
  const macdHeight = 100;
  
  const paddingX = 10;
  const dataLen = klines.length;
  const xStep = (width - paddingX * 2) / dataLen;
  const candleWidth = Math.max(xStep * 0.7, 1);

  // K線 Y軸縮放
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceRange = (maxPrice - minPrice) || 1;
  const getPriceY = (price) => kLineHeight - 10 - ((price - minPrice) / priceRange) * (kLineHeight - 20);

  // 交易量 Y軸縮放
  const vols = klines.map(k => k.volume);
  const maxVol = Math.max(...vols) || 1;
  const getVolY = (vol) => totalHeight - macdHeight - 5 - (vol / maxVol) * (volHeight - 10);

  // MACD Y軸縮放
  const macdData = macdSeries.slice(-dataLen); // 確保與 klines 長度一致
  let maxMacdAbs = 0.0001;
  macdData.forEach(m => {
    maxMacdAbs = Math.max(maxMacdAbs, Math.abs(m.dif), Math.abs(m.dea), Math.abs(m.hist));
  });
  const getMacdY = (val) => totalHeight - (macdHeight / 2) - (val / maxMacdAbs) * (macdHeight / 2 - 10);

  // 繪製路徑
  let difPath = "";
  let deaPath = "";

  return (
    <div className="w-full overflow-x-auto relative" style={{ height: '500px' }}>
      <svg viewBox={`0 0 ${width} ${totalHeight}`} className="w-full h-full text-xs font-mono">
        {/* 背景格線 */}
        <line x1="0" y1={kLineHeight} x2={width} y2={kLineHeight} stroke="#2a2f3a" strokeWidth="1" />
        <line x1="0" y1={kLineHeight + volHeight} x2={width} y2={kLineHeight + volHeight} stroke="#2a2f3a" strokeWidth="1" />
        
        {/* MACD 零軸 */}
        <line x1="0" y1={totalHeight - macdHeight/2} x2={width} y2={totalHeight - macdHeight/2} stroke="#2a2f3a" strokeWidth="1" strokeDasharray="4 4" />

        {klines.map((k, i) => {
          const x = paddingX + i * xStep;
          const isUp = k.close >= k.open;
          const color = isUp ? '#0ecb81' : '#f6465d';
          
          const openY = getPriceY(k.open);
          const closeY = getPriceY(k.close);
          const highY = getPriceY(k.high);
          const lowY = getPriceY(k.low);
          
          const bodyY = Math.min(openY, closeY);
          const bodyH = Math.max(Math.abs(openY - closeY), 1);

          // 交易量
          const volY = getVolY(k.volume);
          const volH = (totalHeight - macdHeight) - volY;

          // MACD
          const macd = macdData[i];
          if (macd) {
             const cx = x + candleWidth / 2;
             difPath += `${i===0?'M':'L'}${cx},${getMacdY(macd.dif)} `;
             deaPath += `${i===0?'M':'L'}${cx},${getMacdY(macd.dea)} `;
             
             const histY = getMacdY(Math.max(macd.hist, 0));
             const histZero = getMacdY(0);
             const histH = Math.abs(getMacdY(macd.hist) - histZero) || 1;
             const histColor = macd.hist >= 0 ? '#0ecb81' : '#f6465d';

             return (
               <g key={i}>
                 {/* K線 上下影線 */}
                 <line x1={x + candleWidth/2} y1={highY} x2={x + candleWidth/2} y2={lowY} stroke={color} strokeWidth="1.5" />
                 {/* K線 實體 */}
                 <rect x={x} y={bodyY} width={candleWidth} height={bodyH} fill={color} stroke={color} strokeWidth="1" />
                 {/* 交易量柱 */}
                 <rect x={x} y={volY} width={candleWidth} height={volH} fill={color} opacity="0.4" />
                 {/* MACD 柱 */}
                 <rect x={x + candleWidth/4} y={macd.hist >= 0 ? histY : histZero} width={candleWidth/2} height={histH} fill={histColor} opacity="0.6" />
               </g>
             );
          }
          return null;
        })}

        {/* MACD 線條繪製在最上層 */}
        <path d={difPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
        <path d={deaPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" />

        {/* 右側價格標籤提示 (簡單實作) */}
        <text x={width - 5} y={20} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(maxPrice)}</text>
        <text x={width - 5} y={kLineHeight - 10} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(minPrice)}</text>
      </svg>
    </div>
  );
};

// --- 主應用程序 ---
export default function App() {
  const [allTickers, setAllTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [fundingRates, setFundingRates] = useState({});

  // 模擬帳戶狀態 (存放於 localStorage)
  const [paperAccount, setPaperAccount] = useState(() => {
    const saved = localStorage.getItem('paperAccount');
    return saved ? JSON.parse(saved) : { balance: 10000, positions: [], history: [] };
  });

  useEffect(() => {
    localStorage.setItem('paperAccount', JSON.stringify(paperAccount));
  }, [paperAccount]);

  const fetchFuturesData = async () => {
    try {
      const res = await fetch(`/api/binance?action=overview`);
      if (!res.ok) throw new Error(`API 錯誤: ${res.status}`);
      const data = await res.json();
      const usdtPairs = data.tickers.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
      setAllTickers(usdtPairs);
      const frMap = {};
      data.fundingRates.forEach(item => { frMap[item.symbol] = item.lastFundingRate; });
      setFundingRates(frMap);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('數據獲取失敗。請確認 API 是否已正確部署。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFuturesData();
    const interval = setInterval(fetchFuturesData, 15000); 
    return () => clearInterval(interval);
  }, []);

  const filteredTickers = useMemo(() => {
    if (!searchTerm) return allTickers.slice(0, 24); 
    return allTickers.filter(t => t.symbol.includes(searchTerm.toUpperCase())).slice(0, 50); 
  }, [allTickers, searchTerm]);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="bg-[#121620] border-b border-[#2a2f3a] sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-amber-500">
            <Zap className="w-6 h-6 fill-amber-500/20" />
            <h1 className="text-xl font-bold text-white tracking-wide">ProTrade <span className="font-light text-slate-400">Terminal</span></h1>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
             {/* 模擬帳戶餘額顯示 */}
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
            onBack={() => setSelectedCoin(null)} 
          />
        ) : (
          <Dashboard tickers={filteredTickers} fundingRates={fundingRates} loading={loading} onSelectCoin={setSelectedCoin} />
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
        <p className="text-sm tracking-widest uppercase">Connecting to Server...</p>
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
        const resKlines = await fetch(`/api/binance?action=klines&symbol=${coin.symbol}&limit=120`);
        const dataKlines = await resKlines.json();
        
        if (!isMounted) return;

        const parsedKlines = dataKlines.map(c => ({
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
            const res = await fetch(`/api/binance?action=price&symbol=${coin.symbol}`);
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
                    return newHist;
                });
            }
        } catch(e) {}
    }, 3000);

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
        type, // 'LONG' or 'SHORT'
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
    // 使用最新市場價結算
    const markPrice = currentPrice; // 簡化：在同一個幣種頁面直接用 currentPrice，若是其他幣種需要另外獲取
    
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
