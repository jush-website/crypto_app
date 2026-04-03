import React, { useState, useEffect, useMemo } from 'react';
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
        analysisLog.push("均線多頭排列 (+1.5)");
    }
    else if (sma7 < sma20 && price < sma7) {
        score -= 1.5; 
        analysisLog.push("均線空頭排列 (-1.5)");
    }
  }

  if (macd.dif > macd.dea && macd.hist > 0) {
      score += 2;
      analysisLog.push("MACD 金叉多頭 (+2)");
  } else if (macd.dif < macd.dea && macd.hist < 0) {
      score -= 2;
      analysisLog.push("MACD 死叉空頭 (-2)");
  }

  if (boll.lower && price <= boll.lower) {
      score += 2.5; 
      analysisLog.push("觸及布林下軌 (+2.5)");
  } else if (boll.upper && price >= boll.upper) {
      score -= 2.5; 
      analysisLog.push("觸及布林上軌 (-2.5)");
  } else if (boll.mid) {
      if (price > boll.mid) score += 0.5;
      else score -= 0.5;
  }

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

// --- 主應用程序 ---
export default function App() {
  const [allTickers, setAllTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [fundingRates, setFundingRates] = useState({});

  const fetchFuturesData = async () => {
    try {
      // 呼叫 Vercel Serverless Function (代理 API)
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

  useEffect(() => {
    fetchFuturesData();
    let interval;
    if (!selectedCoin) {
      interval = setInterval(fetchFuturesData, 15000); 
    }
    return () => clearInterval(interval);
  }, [selectedCoin]);

  const filteredTickers = useMemo(() => {
    if (!searchTerm) return allTickers.slice(0, 24); 
    const term = searchTerm.toUpperCase();
    return allTickers.filter(t => t.symbol.includes(term)).slice(0, 50); 
  }, [allTickers, searchTerm]);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-indigo-500/30">
      <header className="bg-[#121620] border-b border-[#2a2f3a] sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-amber-500">
            <Zap className="w-6 h-6 fill-amber-500/20" />
            <h1 className="text-xl font-bold text-white tracking-wide">ProSignal <span className="font-light text-slate-400">Futures</span></h1>
          </div>
          
          {!selectedCoin && (
            <div className="relative w-full sm:w-96">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="text"
                placeholder="搜尋永續合約 (例: BTCUSDT)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-9 pr-3 py-1.5 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all"
              />
            </div>
          )}
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
          <FuturesDetail 
            coin={selectedCoin} 
            fundingRate={fundingRates[selectedCoin.symbol]}
            onBack={() => setSelectedCoin(null)} 
          />
        ) : (
          <Dashboard 
            tickers={filteredTickers} 
            fundingRates={fundingRates}
            loading={loading} 
            onSelectCoin={setSelectedCoin}
            searchTerm={searchTerm}
          />
        )}
      </main>
    </div>
  );
}

// --- 首頁列表組件 ---
function Dashboard({ tickers, fundingRates, loading, onSelectCoin, searchTerm }) {
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
      <div className="mb-4 border-b border-[#2a2f3a] pb-2">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          {searchTerm ? 'Search Results' : 'Market Overview'}
        </h2>
      </div>

      {tickers.length === 0 ? (
        <div className="text-center py-20 text-slate-500 text-sm">
          未找到合約「{searchTerm}」
        </div>
      ) : (
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
      )}
    </div>
  );
}

// --- 合約詳情與策略分析 ---
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
        // 呼叫代理 API 取得 K 線數據
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
    
    // 實時報價更新 (透過代理)
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
    <div className="animate-in fade-in duration-200 pb-20">
      <button 
        onClick={onBack}
        className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm transition-colors w-fit px-2 py-1 rounded bg-[#121620] border border-[#2a2f3a]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Markets
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* 左側：AI 策略面板 */}
        <div className="lg:col-span-5 space-y-4">
          
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

          <div className="bg-[#121620] rounded-lg border border-[#2a2f3a] overflow-hidden">
            <div className="p-3 border-b border-[#2a2f3a] bg-[#1a1e27] flex justify-between items-center">
                 <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-amber-500" /> Multi-Indicator Strategy (15m)
                 </h3>
            </div>
            
            {loadingHistory || !strategy ? (
                <div className="p-10 flex flex-col items-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mb-3 text-amber-500" />
                    <span className="text-xs">計算 MACD, BOLL 等多重指標中...</span>
                </div>
            ) : (
                <div className="p-4">
                    <div className="flex items-center justify-between mb-5 bg-[#0b0e14] p-3 rounded-lg border border-[#1e2330]">
                        <div>
                            <span className="text-[10px] text-slate-500 mb-1 uppercase tracking-wider block">Direction</span>
                            <div className={`text-3xl font-black tracking-widest ${
                                strategy.signal === 'LONG' ? 'text-[#0ecb81]' : 
                                strategy.signal === 'SHORT' ? 'text-[#f6465d]' : 'text-slate-400'
                            }`}>
                                {strategy.signal}
                            </div>
                        </div>
                        {strategy.signal !== 'NEUTRAL' && (
                            <div className="text-right">
                                <span className="text-[10px] text-slate-500 mb-1 block uppercase tracking-wider">Win Rate Est.</span>
                                <span className="text-2xl font-mono text-white">{strategy.confidence}%</span>
                            </div>
                        )}
                    </div>

                    {strategy.signal !== 'NEUTRAL' && (
                        <div className="space-y-3 mb-5">
                            <div className="flex justify-between items-center bg-[#1a1e27] p-2.5 rounded border border-[#2a2f3a]">
                                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                                    <Target className="w-3.5 h-3.5" /> 推薦入場區間 (Entry)
                                </span>
                                <span className="text-base font-mono font-bold text-white">
                                    ${formatPrice(strategy.entry)}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[#1a1e27]/50 p-2.5 rounded border border-[#0ecb81]/20">
                                    <span className="text-[10px] text-slate-500 block mb-1">目標止盈 (TP)</span>
                                    <span className="text-sm font-mono text-[#0ecb81] block">${formatPrice(strategy.takeProfit)}</span>
                                </div>
                                <div className="bg-[#1a1e27]/50 p-2.5 rounded border border-[#f6465d]/20">
                                    <span className="text-[10px] text-slate-500 block mb-1">嚴格止損 (SL)</span>
                                    <span className="text-sm font-mono text-[#f6465d] block">${formatPrice(strategy.stopLoss)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {strategy.signal === 'NEUTRAL' && (
                         <div className="text-sm text-slate-400 bg-[#1a1e27] p-4 rounded-lg text-center border border-[#2a2f3a] mb-5">
                            目前指標互相衝突或無明顯方向，建議觀望。
                         </div>
                    )}

                    <div className="border-t border-[#2a2f3a] pt-3">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 block">AI Analysis Log</span>
                        <div className="space-y-1.5">
                            {strategy.analysisLog.map((log, idx) => (
                                <div key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.includes('+') ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`}></span>
                                    {log}
                                </div>
                            ))}
                            {strategy.analysisLog.length === 0 && <div className="text-xs text-slate-500">無明顯指標特徵</div>}
                        </div>
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* 右側：詳細指標儀表板 */}
        <div className="lg:col-span-7 space-y-4">
          {!loadingHistory && strategy && (
            <div className="grid grid-cols-2 gap-4">
               
               <div className="bg-[#121620] rounded-lg p-4 border border-[#2a2f3a]">
                   <span className="text-xs text-slate-400 uppercase tracking-wider mb-3 block">Bollinger Bands (20,2)</span>
                   <div className="space-y-2">
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500">Upper (壓力)</span>
                           <span className="font-mono text-slate-300">${formatPrice(strategy.boll?.upper)}</span>
                       </div>
                       <div className="flex justify-between items-center text-xs bg-[#1a1e27] p-1 rounded">
                           <span className="text-amber-500/80">Mid (中軌)</span>
                           <span className="font-mono text-amber-500/80">${formatPrice(strategy.boll?.mid)}</span>
                       </div>
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500">Lower (支撐)</span>
                           <span className="font-mono text-slate-300">${formatPrice(strategy.boll?.lower)}</span>
                       </div>
                   </div>
                   <div className="mt-3 pt-2 border-t border-[#2a2f3a] text-[10px] text-slate-400">
                       目前價格: <span className={currentPrice > strategy.boll?.mid ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
                           {currentPrice > strategy.boll?.upper ? '突破上軌 (超買)' : 
                            currentPrice < strategy.boll?.lower ? '跌破下軌 (超賣)' : 
                            currentPrice > strategy.boll?.mid ? '中軌上方 (偏多)' : '中軌下方 (偏空)'}
                       </span>
                   </div>
               </div>

               <div className="bg-[#121620] rounded-lg p-4 border border-[#2a2f3a] flex flex-col justify-between">
                   <span className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">MACD (12,26,9)</span>
                   <div className="flex justify-between items-end mb-2">
                       <div className="text-xs text-slate-500">
                           DIF: <span className="text-blue-400">{strategy.macd?.dif.toFixed(4)}</span><br/>
                           DEA: <span className="text-orange-400">{strategy.macd?.dea.toFixed(4)}</span>
                       </div>
                       <div className={`text-xl font-bold font-mono ${strategy.macd?.hist > 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                           {strategy.macd?.hist > 0 ? '+' : ''}{strategy.macd?.hist.toFixed(4)}
                       </div>
                   </div>
                   <div className="text-[10px] text-slate-400 bg-[#1a1e27] p-1.5 rounded text-center">
                       {strategy.macd?.dif > strategy.macd?.dea ? '✅ 金叉 (多頭動能)' : '❌ 死叉 (空頭動能)'}
                   </div>
               </div>

               <div className="bg-[#121620] rounded-lg p-4 border border-[#2a2f3a]">
                  <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-slate-400 uppercase tracking-wider">RSI (14)</span>
                      <span className={`text-lg font-mono font-bold ${
                          strategy.rsi > 70 ? 'text-[#f6465d]' : strategy.rsi < 30 ? 'text-[#0ecb81]' : 'text-slate-200'
                      }`}>
                          {strategy.rsi.toFixed(2)}
                      </span>
                  </div>
                  <div className="relative h-1.5 bg-[#1a1e27] rounded-full overflow-hidden mt-2">
                      <div className="absolute left-[30%] w-px h-full bg-[#2a2f3a] z-10"></div>
                      <div className="absolute left-[70%] w-px h-full bg-[#2a2f3a] z-10"></div>
                      <div 
                          className={`absolute top-0 left-0 h-full transition-all duration-300 ${
                              strategy.rsi > 70 ? 'bg-[#f6465d]' : strategy.rsi < 30 ? 'bg-[#0ecb81]' : 'bg-slate-500'
                          }`}
                          style={{ width: `${Math.min(Math.max(strategy.rsi, 0), 100)}%` }}
                      ></div>
                  </div>
               </div>

               <div className="bg-[#121620] rounded-lg p-4 border border-[#2a2f3a]">
                   <span className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Trend (SMA)</span>
                   <div className="space-y-1.5">
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500">SMA 7:</span>
                           <span className="font-mono text-slate-300">${formatPrice(strategy.sma7)}</span>
                       </div>
                       <div className="flex justify-between items-center text-xs">
                           <span className="text-slate-500">SMA 20:</span>
                           <span className="font-mono text-slate-300">${formatPrice(strategy.sma20)}</span>
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