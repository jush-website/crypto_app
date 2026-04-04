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
  BarChart2
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

// --- 技術指標與策略計算 ---
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

const generateTradingSignal = (currentPrice, historyCloses, fundingRate) => {
  if (!historyCloses || historyCloses.length < 50) return null;
  const price = parseFloat(currentPrice);
  const fr = parseFloat(fundingRate || 0);

  const rsi = calculateRSI(historyCloses, 14);
  const sma7 = calculateSMA(historyCloses, 7);  
  const sma20 = calculateSMA(historyCloses, 20); 
  const macdSeries = calculateMACDSeries(historyCloses);
  const macd = macdSeries[macdSeries.length - 1] || {dif:0, dea:0, hist:0};
  const prevMacd = macdSeries[macdSeries.length - 2] || {hist:0};
  const boll = calculateBOLL(historyCloses, 20, 2);

  let signal = 'NEUTRAL';
  let score = 0; 
  let analysisLog = []; 

  // 1. 趨勢分析 (SMA)
  if (sma7 && sma20) {
    if (sma7 > sma20 && price > sma7) { 
        score += 2; analysisLog.push("強勢多頭：價格站上均線且短均線大於長均線 (+2)"); 
    }
    else if (sma7 < sma20 && price < sma7) { 
        score -= 2; analysisLog.push("強勢空頭：價格跌破均線且短均線小於長均線 (-2)"); 
    }
    else if (price > sma20) { 
        score += 1; analysisLog.push("多方佔優：價格維持在20T均線之上 (+1)"); 
    }
    else if (price < sma20) { 
        score -= 1; analysisLog.push("空方承壓：價格跌落於20T均線之下 (-1)"); 
    }
  }

  // 2. 動能分析 (MACD)
  if (macd.dif > macd.dea) { 
      score += 2; analysisLog.push("MACD：快線大於慢線，呈現金叉偏多 (+2)"); 
  } else { 
      score -= 2; analysisLog.push("MACD：快線小於慢線，呈現死叉偏空 (-2)"); 
  }
  
  if (macd.hist > prevMacd.hist) {
      score += 1; analysisLog.push("MACD柱狀圖：多方動能增強或空方動能減弱 (+1)");
  } else {
      score -= 1; analysisLog.push("MACD柱狀圖：空方動能增強或多方動能減弱 (-1)");
  }

  // 3. 波動與支撐壓力 (Bollinger Bands)
  if (boll.lower && price <= boll.lower * 1.005) { 
      score += 2.5; analysisLog.push("布林通道：價格觸及下軌區域，具備潛在超賣反彈契機 (+2.5)"); 
  } 
  else if (boll.upper && price >= boll.upper * 0.995) { 
      score -= 2.5; analysisLog.push("布林通道：價格觸及上軌區域，具備潛在超買回落風險 (-2.5)"); 
  } 
  else if (boll.mid) { 
      if (price > boll.mid) { score += 0.5; analysisLog.push("布林通道：價格位於中軌之上，趨勢偏多 (+0.5)"); } 
      else { score -= 0.5; analysisLog.push("布林通道：價格位於中軌之下，趨勢偏空 (-0.5)"); }
  }

  // 4. 強弱指標 (RSI)
  if (rsi < 30) { 
      score += 2; analysisLog.push(`RSI (${rsi.toFixed(1)})：進入嚴重超賣區間，買盤有望介入 (+2)`); 
  }
  else if (rsi > 70) { 
      score -= 2; analysisLog.push(`RSI (${rsi.toFixed(1)})：進入嚴重超買區間，賣盤壓力大 (-2)`); 
  }
  else if (rsi >= 50) {
      score += 1; analysisLog.push(`RSI (${rsi.toFixed(1)})：大於50中軸，多方力道較強 (+1)`);
  }
  else {
      score -= 1; analysisLog.push(`RSI (${rsi.toFixed(1)})：小於50中軸，空方力道較強 (-1)`);
  }

  // 5. 市場籌碼情緒 (Funding Rate)
  if (fr > 0.0005) { 
      score -= 1.5; analysisLog.push(`資金費率 (${(fr*100).toFixed(3)}%)：過度偏多擁擠，需慎防多殺多 (-1.5)`); 
  }
  else if (fr < -0.0001) { 
      score += 1.5; analysisLog.push(`資金費率 (${(fr*100).toFixed(3)}%)：偏空擁擠，具備軋空上漲潛力 (+1.5)`); 
  }

  // 綜合判定 (提高觸發門檻，使訊號更準確)
  if (score >= 5) signal = 'LONG';
  else if (score <= -5) signal = 'SHORT';

  // 動態勝率計算 (分數越高，信心指數越高)
  let confidence = 0;
  if (signal !== 'NEUTRAL') {
      const absScore = Math.abs(score);
      confidence = Math.min(Math.round(50 + (absScore - 4) * 7.5), 95); // 最高給到 95%
  }

  return { signal, rsi, sma7, sma20, macd, boll, score, currentPrice: price, confidence, analysisLog };
};

// --- 共用下單表單組件 ---
function TradeForm({ symbol, currentPrice, balance, onOpenPosition }) {
  const [leverage, setLeverage] = useState(10);
  const [marginMode, setMarginMode] = useState('ISOLATED'); 
  const [autoMargin, setAutoMargin] = useState(false); 
  const [orderMode, setOrderMode] = useState('margin'); 
  const [inputValue, setInputValue] = useState(100);
  const [tradeError, setTradeError] = useState('');

  const val = parseFloat(inputValue) || 0;
  const marginReq = orderMode === 'margin' ? val : val / leverage;
  const notionalSize = orderMode === 'margin' ? val * leverage : val;
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

  const handleSubmit = (type) => {
      setTradeError('');
      if(marginReq > balance) return setTradeError("可用餘額不足！請調降金額");
      if(marginReq <= 0) return setTradeError("金額必須大於 0");
      onOpenPosition(symbol, type, marginReq, leverage, coinSize, type === 'LONG' ? liqLong : liqShort, marginMode, autoMargin, currentPrice);
      setInputValue(''); 
  };

  return (
      <div className="space-y-4">
          <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <label>槓桿倍數 (Leverage)</label>
                  <span className="text-white font-bold">{leverage}x</span>
              </div>
              <input type="range" min="1" max="100" value={leverage} onChange={(e) => setLeverage(e.target.value)} className="w-full accent-blue-500" />
          </div>
          
          <div className="flex bg-[#0b0e14] p-1 rounded-lg border border-[#2a2f3a] mb-2">
              <button onClick={() => setMarginMode('CROSS')} className={`flex-1 text-xs py-1.5 rounded transition-colors ${marginMode === 'CROSS' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}>全倉 (Cross)</button>
              <button onClick={() => setMarginMode('ISOLATED')} className={`flex-1 text-xs py-1.5 rounded transition-colors ${marginMode === 'ISOLATED' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}>逐倉 (Isolated)</button>
          </div>

          {marginMode === 'ISOLATED' && (
              <div className="flex items-center gap-2 mb-2 px-1">
                  <input type="checkbox" id={`autoMargin-${symbol}`} checked={autoMargin} onChange={(e) => setAutoMargin(e.target.checked)} className="accent-blue-500 cursor-pointer" />
                  <label htmlFor={`autoMargin-${symbol}`} className="text-xs text-slate-300 cursor-pointer select-none">開啟自動追加保證金</label>
              </div>
          )}

          <div className="flex gap-2">
              <button onClick={() => setOrderMode('margin')} className={`text-[10px] px-2 py-1 rounded border ${orderMode === 'margin' ? 'border-blue-500 text-blue-400' : 'border-[#2a2f3a] text-slate-500'}`}>依保證金</button>
              <button onClick={() => setOrderMode('size')} className={`text-[10px] px-2 py-1 rounded border ${orderMode === 'size' ? 'border-blue-500 text-blue-400' : 'border-[#2a2f3a] text-slate-500'}`}>依名目交易額</button>
          </div>

          <div>
              <div className="relative">
                  <input type="number" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={orderMode === 'margin' ? '輸入投入保證金' : '輸入總交易金額'} className={`w-full bg-[#1a1e27] border ${tradeError ? 'border-red-500/50' : 'border-[#2a2f3a]'} rounded p-2 text-white font-mono text-sm outline-none focus:border-blue-500 transition-all`} />
                  <span className="absolute right-3 top-2 text-xs text-slate-500">USDT</span>
              </div>
              {tradeError ? (
                  <div className="text-[10px] text-red-400 mt-1">{tradeError}</div>
              ) : (
                  <div className="text-right text-[10px] text-slate-500 mt-1">可用: ${balance.toFixed(2)}</div>
              )}
          </div>

          <div className="bg-[#0b0e14] rounded p-3 text-xs space-y-1.5 border border-[#1e2330]">
              <div className="flex justify-between text-slate-400">扣除保證金: <span className="text-white font-mono">{marginReq.toFixed(2)} USDT</span></div>
              <div className="flex justify-between text-slate-400">開倉數量: <span className="text-white font-mono">{coinSize.toFixed(4)} {symbol.replace('USDT','')}</span></div>
              <div className="border-t border-[#1e2330] my-1"></div>
              <div className="flex justify-between text-[#0ecb81]/80 font-bold">預估多頭強平價: <span className="font-mono bg-[#0ecb81]/10 px-1 rounded">{formatPrice(liqLong)}</span></div>
              <div className="flex justify-between text-[#f6465d]/80 font-bold">預估空頭強平價: <span className="font-mono bg-[#f6465d]/10 px-1 rounded">{formatPrice(liqShort)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
              <button onClick={() => handleSubmit('LONG')} className="bg-[#0ecb81]/10 hover:bg-[#0ecb81]/20 text-[#0ecb81] border border-[#0ecb81]/30 py-2.5 rounded font-bold transition-all transform active:scale-95">做多 (Long)</button>
              <button onClick={() => handleSubmit('SHORT')} className="bg-[#f6465d]/10 hover:bg-[#f6465d]/20 text-[#f6465d] border border-[#f6465d]/30 py-2.5 rounded font-bold transition-all transform active:scale-95">做空 (Short)</button>
          </div>
      </div>
  );
}

// --- 獨立的持倉操作卡片 ---
function PositionCard({ pos, currentPrice, balance, onSelectCoin, onClose, onAdjust }) {
  const [activeModal, setActiveModal] = useState(null); 
  const [adjustInput, setAdjustInput] = useState('');
  const [modalError, setModalError] = useState('');

  const pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
  const roe = (pnl / pos.margin) * 100;
  const isProfit = pnl >= 0;

  const handleAdjustSubmit = () => {
      const val = parseFloat(adjustInput);
      if(isNaN(val) || val <= 0) return setModalError('請輸入有效金額');
      if(activeModal === 'add' && val > balance) return setModalError('可用餘額不足');
      if(activeModal === 'reduce' && val > pos.margin) return setModalError(`最多可減 ${pos.margin.toFixed(2)}`);

      onAdjust(activeModal, val);
      setActiveModal(null);
      setAdjustInput('');
      setModalError('');
  };

  return (
      <div className={`bg-[#121620] border ${isProfit ? 'border-[#0ecb81]/30' : 'border-[#f6465d]/30'} rounded-xl p-4 flex flex-col relative overflow-hidden shadow-lg`}>
          <div className="flex justify-between items-start mb-3">
              <div>
                  <h3 
                    className="text-xl font-black text-white cursor-pointer hover:text-blue-400 transition-colors underline decoration-blue-500/30 underline-offset-4"
                    onClick={() => onSelectCoin && onSelectCoin({symbol: pos.symbol})}
                    title="點擊前往 K線交易面板"
                  >
                      {pos.symbol}
                  </h3>
                  <div className="flex gap-1 items-center mt-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${pos.type === 'LONG' ? 'bg-[#0ecb81] text-white' : 'bg-[#f6465d] text-white'}`}>
                          {pos.type}
                      </span>
                      <span className="text-[10px] border border-slate-600 text-slate-300 px-1.5 py-0.5 rounded">
                          {pos.marginMode === 'CROSS' ? '全倉' : '逐倉'} {pos.leverage}x
                      </span>
                      {pos.autoMargin && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">自動保證金</span>}
                  </div>
              </div>
              <div className="text-right">
                  <div className={`text-xl font-mono font-black ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                      {isProfit ? '+' : ''}{pnl.toFixed(2)}
                  </div>
                  <div className={`text-sm font-bold ${isProfit ? 'text-[#0ecb81]/80' : 'text-[#f6465d]/80'}`}>
                      {isProfit ? '+' : ''}{roe.toFixed(2)}%
                  </div>
              </div>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 mb-4 bg-[#0b0e14] p-3 rounded border border-[#1e2330]">
              <div>持倉數量 <span className="block text-white font-mono text-sm">{pos.size.toFixed(4)}</span></div>
              <div>保證金 <span className="block text-white font-mono text-sm">${pos.margin.toFixed(2)}</span></div>
              <div>開倉均價 <span className="block text-white font-mono text-sm">${formatPrice(pos.entryPrice)}</span></div>
              <div>預估強平價 <span className="block text-amber-400 font-mono text-sm font-bold">${formatPrice(pos.liqPrice)}</span></div>
          </div>

          {/* 操作按鈕區 */}
          {activeModal ? (
              <div className="bg-[#1a1e27] p-3 rounded-lg border border-[#3b82f6]/50 mt-auto animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-bold text-white flex items-center gap-1">
                          {activeModal === 'add' ? <><Plus className="w-4 h-4 text-blue-400"/> 加碼 (加倉並增加保證金)</> : <><Minus className="w-4 h-4 text-amber-400"/> 減倉 (部分平倉退回保證金)</>}
                      </span>
                      <X className="w-5 h-5 text-slate-400 cursor-pointer hover:text-white bg-slate-800 rounded-full p-0.5" onClick={() => {setActiveModal(null); setModalError('');}} />
                  </div>
                  <div className="flex gap-2">
                      <input 
                          type="number" 
                          placeholder="輸入 USDT 金額" 
                          value={adjustInput}
                          onChange={e => setAdjustInput(e.target.value)}
                          className="flex-1 bg-[#0b0e14] border border-[#2a2f3a] rounded px-3 text-sm text-white outline-none focus:border-blue-500" 
                      />
                      <button onClick={handleAdjustSubmit} className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-4 py-2 rounded transition-colors">確認送出</button>
                  </div>
                  {modalError && <div className="text-xs text-red-400 mt-2 font-bold">{modalError}</div>}
              </div>
          ) : (
              <div className="flex gap-2 mt-auto">
                  <button onClick={() => {setActiveModal('add'); setAdjustInput('');}} className="flex-1 flex justify-center items-center gap-1 bg-[#2a2f3a] hover:bg-[#3a4150] text-white text-sm font-bold py-2 rounded transition-all active:scale-95"><Plus className="w-4 h-4"/> 加碼</button>
                  <button onClick={() => {setActiveModal('reduce'); setAdjustInput('');}} className="flex-1 flex justify-center items-center gap-1 bg-[#2a2f3a] hover:bg-[#3a4150] text-white text-sm font-bold py-2 rounded transition-all active:scale-95"><Minus className="w-4 h-4"/> 減倉</button>
                  <button onClick={onClose} className="flex-1 flex justify-center items-center gap-1 bg-[#f6465d]/20 hover:bg-[#f6465d]/40 text-[#f6465d] text-sm font-bold py-2 rounded transition-all active:scale-95"><X className="w-4 h-4"/> 平倉</button>
              </div>
          )}
      </div>
  );
}

// --- 獨立行情與 AI 推薦報價卡片 ---
function MarketCard({ ticker, fundingRate, signalData, onSelectCoin }) {
  const change = parseFloat(ticker.priceChangePercent);
  const isPositive = change >= 0;
  const baseAsset = ticker.symbol.replace('USDT', '');
  
  let frColor = 'text-slate-500';
  if (fundingRate > 0.0001) frColor = 'text-amber-500';
  else if (fundingRate < 0) frColor = 'text-purple-400';

  return (
      <div onClick={() => onSelectCoin(ticker.symbol)} className="bg-[#121620] rounded-lg p-4 border border-[#2a2f3a] hover:border-[#0ecb81]/50 cursor-pointer transition-all flex flex-col justify-between">
          <div>
              <div className="flex justify-between mb-2">
                  <h3 className="font-bold text-slate-100">{baseAsset}</h3>
                  <div className={`text-xs font-bold ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{isPositive ? '+' : ''}{change.toFixed(2)}%</div>
              </div>
              <div className="text-lg font-mono font-semibold text-white mb-2">{formatPrice(ticker.lastPrice)}</div>
          </div>
          
          {signalData && signalData.signal !== 'NEUTRAL' && (
              <div className={`mt-2 text-[10px] p-2 rounded border ${signalData.signal === 'LONG' ? 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]' : 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]'}`}>
                  <div className="font-bold mb-1">AI 推薦: {signalData.signal} (勝率 {signalData.confidence}%)</div>
                  <div className="truncate text-slate-400">{signalData.analysisLog[0]}</div>
              </div>
          )}
          {!signalData && (
              <div className="flex justify-between text-[11px] text-slate-500 border-t border-[#1e2330] pt-2 mt-2">
                  <span>Vol: {formatVolume(ticker.quoteVolume)}</span>
                  <span className={frColor}>FR: {fundingRate !== undefined ? formatFundingRate(fundingRate) : '--'}</span>
              </div>
          )}
      </div>
  );
}

// --- 資產總覽頁 (Assets Page) ---
function AssetsPage({ paperAccount, allTickers }) {
  // 1. 計算未實現盈虧與已用保證金
  let totalUnrealizedPnL = 0;
  let usedMargin = 0;
  
  paperAccount.positions.forEach(pos => {
      usedMargin += pos.margin;
      const currentPrice = parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice);
      const pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
      totalUnrealizedPnL += pnl;
  });

  // 2. 計算帳戶總權益
  const availableBalance = paperAccount.balance;
  const totalEquity = availableBalance + usedMargin + totalUnrealizedPnL;

  // 3. 計算歷史交易統計
  const totalTrades = paperAccount.history.length;
  const winningTrades = paperAccount.history.filter(h => h.pnl > 0).length;
  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0;
  const totalRealizedPnL = paperAccount.history.reduce((sum, h) => sum + h.pnl, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
        <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-blue-500" /> 資產中心總覽
        </h2>
        
        {/* 核心資產數據卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-blue-600/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-bl font-bold">TOTAL EQUITY</div>
                <div className="text-sm text-slate-400 mb-1">帳戶總權益</div>
                <div className="text-2xl font-mono font-bold text-white">${totalEquity.toFixed(2)}</div>
            </div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                <div className="text-sm text-slate-400 mb-1">可用餘額 (Available)</div>
                <div className="text-2xl font-mono font-bold text-blue-400">${availableBalance.toFixed(2)}</div>
            </div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                <div className="text-sm text-slate-400 mb-1">已用保證金 (Margin)</div>
                <div className="text-2xl font-mono font-bold text-slate-200">${usedMargin.toFixed(2)}</div>
            </div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                <div className="text-sm text-slate-400 mb-1">未實現盈虧 (Unrealized PnL)</div>
                <div className={`text-2xl font-mono font-bold ${totalUnrealizedPnL >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {totalUnrealizedPnL >= 0 ? '+' : ''}{totalUnrealizedPnL.toFixed(2)}
                </div>
            </div>
        </div>

        <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
            <PieChart className="w-6 h-6 text-purple-500" /> 交易績效統計
        </h2>
        
        {/* 交易統計數據 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                <div className="text-sm text-slate-400 mb-1">總交易次數</div>
                <div className="text-2xl font-mono font-bold text-white">{totalTrades} <span className="text-sm font-normal text-slate-500">次</span></div>
            </div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                <div className="text-sm text-slate-400 mb-1">歷史勝率 (Win Rate)</div>
                <div className="text-2xl font-mono font-bold text-white">{winRate}%</div>
                <div className="text-xs text-slate-500 mt-1">勝 {winningTrades} / 敗 {totalTrades - winningTrades}</div>
            </div>
            <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                <div className="text-sm text-slate-400 mb-1">累計已實現盈虧 (Realized PnL)</div>
                <div className={`text-2xl font-mono font-bold ${totalRealizedPnL >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {totalRealizedPnL >= 0 ? '+' : ''}{totalRealizedPnL.toFixed(2)} <span className="text-sm font-normal text-slate-500">USDT</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}


// --- SVG K線圖表 ---
const AdvancedKLineChart = ({ klines, macdSeries }) => {
  const containerRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(60); 
  const [endIndexOffset, setEndIndexOffset] = useState(0); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawings, setDrawings] = useState([]);
  const [currentDrawing, setCurrentDrawing] = useState(null);
  const [touchDist, setTouchDist] = useState(0);

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

  if (!klines || dataLen === 0) return null;
  
  const maxOffset = Math.max(0, dataLen - visibleCount);
  const safeOffset = Math.min(Math.max(0, endIndexOffset), maxOffset);
  const safeVisibleCount = Math.min(visibleCount, dataLen);
  const startIndex = Math.max(0, dataLen - safeVisibleCount - safeOffset);
  const endIndex = dataLen - safeOffset;
  const visibleKlines = klines.slice(startIndex, endIndex);
  const visibleMacd = macdSeries.slice(startIndex, endIndex);

  const width = 800; const totalHeight = 500; const kLineHeight = 300; const volHeight = 100; const macdHeight = 100;
  const paddingX = 10; const xStep = (width - paddingX * 2) / safeVisibleCount; const candleWidth = Math.max(xStep * 0.7, 1);
  const lows = visibleKlines.map(k => k.low); const highs = visibleKlines.map(k => k.high);
  const minPrice = Math.min(...lows, klines[klines.length-1].close); 
  const maxPrice = Math.max(...highs, klines[klines.length-1].close);
  const priceRange = (maxPrice - minPrice) || 1;
  const paddedMinPrice = minPrice - priceRange * 0.05; const paddedMaxPrice = maxPrice + priceRange * 0.05;
  const paddedPriceRange = paddedMaxPrice - paddedMinPrice;
  const getPriceY = (price) => kLineHeight - 10 - ((price - paddedMinPrice) / paddedPriceRange) * (kLineHeight - 20);
  const vols = visibleKlines.map(k => k.volume); const maxVol = Math.max(...vols, 1);
  const getVolY = (vol) => totalHeight - macdHeight - 5 - (vol / maxVol) * (volHeight - 10);

  let maxMacdAbs = 0.0001;
  visibleMacd.forEach(m => { maxMacdAbs = Math.max(maxMacdAbs, Math.abs(m.dif), Math.abs(m.dea), Math.abs(m.hist)); });
  const getMacdY = (val) => totalHeight - (macdHeight / 2) - (val / maxMacdAbs) * (macdHeight / 2 - 10);

  const getSvgCoords = (clientX, clientY) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left) * (width / rect.width), y: (clientY - rect.top) * (totalHeight / rect.height) };
  };

  const xToTime = (x) => visibleKlines[Math.max(0, Math.min(Math.floor((x - paddingX) / xStep), safeVisibleCount - 1))]?.time;
  const yToPrice = (y) => paddedMinPrice + ((kLineHeight - 10 - y) / (kLineHeight - 20)) * paddedPriceRange;
  const timeToX = (time) => {
    const absIdx = klines.findIndex(k => k.time === time);
    return absIdx === -1 ? -1000 : paddingX + (absIdx - startIndex) * xStep + candleWidth / 2;
  };

  const updateHover = (clientX) => {
    const dataIndex = Math.floor((getSvgCoords(clientX, 0).x - paddingX) / xStep);
    setHoveredIndex((dataIndex >= 0 && dataIndex < visibleKlines.length) ? dataIndex : null);
  };

  const handleMouseDown = (e) => {
    if (drawMode) {
        const coords = getSvgCoords(e.clientX, e.clientY);
        const t1 = xToTime(coords.x); const p1 = yToPrice(coords.y);
        if (t1) setCurrentDrawing({ t1, p1, t2: t1, p2: p1 });
    } else { setIsDragging(true); setDragStartX(e.clientX); }
  };
  
  const handleMouseUp = () => {
    if (drawMode && currentDrawing) { setDrawings(prev => [...prev, currentDrawing]); setCurrentDrawing(null); }
    else setIsDragging(false);
  };

  const handleMouseLeave = () => {
    if (drawMode && currentDrawing) { setDrawings(prev => [...prev, currentDrawing]); setCurrentDrawing(null); }
    setIsDragging(false);
    setHoveredIndex(null);
  };

  const handleMouseMove = (e) => {
    if (drawMode && currentDrawing) {
      const coords = getSvgCoords(e.clientX, e.clientY);
      setCurrentDrawing(prev => ({ ...prev, t2: xToTime(coords.x) || prev.t2, p2: yToPrice(coords.y) }));
    } else if (isDragging) {
      const dx = e.clientX - dragStartX;
      if (Math.abs(dx) > 5) {
        setEndIndexOffset(prev => Math.max(0, Math.min(prev + Math.round(dx / 5), maxOffset)));
        setDragStartX(e.clientX);
      }
    } else updateHover(e.clientX);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      if (drawMode) {
        const coords = getSvgCoords(e.touches[0].clientX, e.touches[0].clientY);
        const t1 = xToTime(coords.x); const p1 = yToPrice(coords.y);
        if (t1) setCurrentDrawing({ t1, p1, t2: t1, p2: p1 });
      } else {
        setIsDragging(true);
        setDragStartX(e.touches[0].clientX);
        updateHover(e.touches[0].clientX);
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
      if (drawMode && currentDrawing) {
        const coords = getSvgCoords(e.touches[0].clientX, e.touches[0].clientY);
        setCurrentDrawing(prev => ({ ...prev, t2: xToTime(coords.x) || prev.t2, p2: yToPrice(coords.y) }));
      } else if (isDragging) {
        const dx = e.touches[0].clientX - dragStartX;
        if (Math.abs(dx) > 3) {
          setEndIndexOffset(prev => Math.max(0, Math.min(prev + Math.round(dx / 3), maxOffset)));
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
    if (drawMode && currentDrawing) { setDrawings(prev => [...prev, currentDrawing]); setCurrentDrawing(null); }
    setIsDragging(false);
    setTouchDist(0);
  };

  let difPath = ""; let deaPath = "";
  const hoveredK = hoveredIndex !== null ? visibleKlines[hoveredIndex] : null;

  return (
    <div className="w-full relative group touch-none" style={{ height: '500px' }}>
      <div className="absolute top-2 right-2 flex gap-1.5 z-10 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => setDrawMode(!drawMode)} className={`p-1.5 rounded backdrop-blur border border-[#2a2f3a] ${drawMode ? 'bg-amber-500/20 text-amber-500' : 'bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300'}`}><Pencil className="w-4 h-4" /></button>
        {drawings.length > 0 && <button onClick={() => setDrawings([])} className="p-1.5 bg-[#1a1e27]/80 hover:bg-red-500/20 text-red-400 rounded backdrop-blur border border-[#2a2f3a]"><Trash2 className="w-4 h-4" /></button>}
        <div className="w-px h-6 bg-[#2a2f3a] mx-1 self-center"></div>
        <button onClick={() => setVisibleCount(p => Math.max(15, Math.round(p * 0.8)))} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => setVisibleCount(p => Math.min(dataLen, Math.round(p * 1.2)))} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded"><ZoomOut className="w-4 h-4" /></button>
        <button onClick={() => {setVisibleCount(60); setEndIndexOffset(0);}} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded"><RotateCcw className="w-4 h-4" /></button>
      </div>

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

      <div ref={containerRef} className={`w-full h-full overflow-hidden touch-none ${drawMode ? 'cursor-crosshair' : 'cursor-default'}`} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onMouseMove={handleMouseMove} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${totalHeight}`} preserveAspectRatio="none" className="text-xs font-mono">
          <line x1="0" y1={kLineHeight} x2={width} y2={kLineHeight} stroke="#2a2f3a" strokeWidth="1" />
          <line x1="0" y1={kLineHeight + volHeight} x2={width} y2={kLineHeight + volHeight} stroke="#2a2f3a" strokeWidth="1" />
          <line x1="0" y1={totalHeight - macdHeight/2} x2={width} y2={totalHeight - macdHeight/2} stroke="#2a2f3a" strokeWidth="1" strokeDasharray="4 4" />
          {visibleKlines.map((k, i) => {
            const x = paddingX + i * xStep; const isUp = k.close >= k.open; const color = isUp ? '#0ecb81' : '#f6465d';
            const openY = getPriceY(k.open); const closeY = getPriceY(k.close); const highY = getPriceY(k.high); const lowY = getPriceY(k.low);
            const bodyY = Math.min(openY, closeY); const bodyH = Math.max(Math.abs(openY - closeY), 1);
            const volY = getVolY(k.volume); const volH = (totalHeight - macdHeight) - volY;
            const macd = visibleMacd[i];
            if (macd) {
               const cx = x + candleWidth / 2;
               difPath += `${i===0?'M':'L'}${cx},${getMacdY(macd.dif)} `; deaPath += `${i===0?'M':'L'}${cx},${getMacdY(macd.dea)} `;
               const histY = getMacdY(Math.max(macd.hist, 0)); const histZero = getMacdY(0); const histH = Math.abs(getMacdY(macd.hist) - histZero) || 1;
               return (
                 <g key={k.time || i}>
                   {hoveredIndex === i && <><line x1={cx} y1={0} x2={cx} y2={totalHeight} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" /><line x1={0} y1={closeY} x2={width} y2={closeY} stroke="#475569" strokeWidth="1" strokeDasharray="4 4" /></>}
                   <line x1={x + candleWidth/2} y1={highY} x2={x + candleWidth/2} y2={lowY} stroke={color} strokeWidth="1.5" />
                   <rect x={x} y={bodyY} width={candleWidth} height={bodyH} fill={color} stroke={color} strokeWidth="1" />
                   <rect x={x} y={volY} width={candleWidth} height={volH} fill={color} opacity={hoveredIndex === i ? "0.7" : "0.4"} />
                   <rect x={x + candleWidth/4} y={macd.hist >= 0 ? histY : histZero} width={candleWidth/2} height={histH} fill={macd.hist >= 0 ? '#0ecb81' : '#f6465d'} opacity="0.6" />
                 </g>
               );
            } return null;
          })}
          <path d={difPath} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          <path d={deaPath} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
          {drawings.concat(currentDrawing ? [currentDrawing] : []).map((line, idx) => (
              <line key={idx} x1={timeToX(line.t1)} y1={getPriceY(line.p1)} x2={timeToX(line.t2)} y2={getPriceY(line.p2)} stroke="#f59e0b" strokeWidth="2" />
          ))}
          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(paddedMaxPrice)}</text>
          <text x={width - 5} y={kLineHeight - 10} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(paddedMinPrice)}</text>
        </svg>
      </div>
    </div>
  );
};

// --- 市場分析頁 ---
function Dashboard({ allTickers, fundingRates, loading }) {
  const [activeTab, setActiveTab] = useState('ALL'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [aiSignals, setAiSignals] = useState({});
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0); // 新增：掃描進度狀態

  useEffect(() => {
    let isMounted = true;
    const scanMarkets = async () => {
      if (allTickers.length === 0) return;
      setIsScanning(true);
      setScanProgress(0);
      
      const topCoins = allTickers.slice(0, 150); // 改為前 150 大交易量幣種
      const chunkSize = 15; // 分批發送請求 (每次 15 檔)，避免被 Binance API 封鎖
      
      for (let i = 0; i < topCoins.length; i += chunkSize) {
        if (!isMounted) return;
        const chunk = topCoins.slice(i, i + chunkSize);
        const chunkSignals = {};
        
        await Promise.all(chunk.map(async (coin) => {
          try {
            const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=15m&limit=60`);
            if (!res.ok) return;
            const data = await res.json();
            const closes = data.map(d => parseFloat(d[4]));
            const currentPrice = parseFloat(coin.lastPrice);
            const sig = generateTradingSignal(currentPrice, closes, fundingRates[coin.symbol]);
            if (sig && sig.signal !== 'NEUTRAL') {
               chunkSignals[coin.symbol] = sig;
            }
          } catch (e) { }
        }));

        if (isMounted) {
           // 逐步更新畫面，讓使用者即時看到掃描出來的訊號
           if (Object.keys(chunkSignals).length > 0) {
               setAiSignals(prev => ({ ...prev, ...chunkSignals }));
           }
           // 更新進度條百分比
           setScanProgress(Math.min(100, Math.round(((i + chunkSize) / topCoins.length) * 100)));
        }
        
        // 每次批次請求後暫停 300 毫秒，安全避開 API 頻率限制
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      if (isMounted) {
        setIsScanning(false);
      }
    };
    
    scanMarkets();
    return () => { isMounted = false; };
  }, [allTickers.length > 0]); 

  if (loading && allTickers.length === 0) return <div className="text-center py-32 text-slate-500"><RefreshCw className="w-6 h-6 animate-spin mx-auto mb-4 text-amber-500" /> Connecting to Binance...</div>;

  let displayTickers = allTickers;
  if (activeTab === 'LONG') {
      displayTickers = allTickers.filter(t => aiSignals[t.symbol]?.signal === 'LONG');
  } else if (activeTab === 'SHORT') {
      displayTickers = allTickers.filter(t => aiSignals[t.symbol]?.signal === 'SHORT');
  }
  
  if (searchTerm) {
      displayTickers = displayTickers.filter(t => t.symbol.includes(searchTerm.toUpperCase()));
  }

  // 設定顯示 150 個幣種
  displayTickers = displayTickers.slice(0, 150);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a]">
              <button onClick={() => setActiveTab('ALL')} className={`px-4 py-2 text-sm rounded transition-colors ${activeTab === 'ALL' ? 'bg-[#2a2f3a] text-white font-bold' : 'text-slate-500 hover:text-slate-300'}`}>全部市場</button>
              <button onClick={() => setActiveTab('LONG')} className={`px-4 py-2 text-sm rounded transition-colors flex items-center gap-1 ${activeTab === 'LONG' ? 'bg-[#0ecb81]/20 text-[#0ecb81] font-bold' : 'text-slate-500 hover:text-[#0ecb81]'}`}>🔥 AI 推薦做多</button>
              <button onClick={() => setActiveTab('SHORT')} className={`px-4 py-2 text-sm rounded transition-colors flex items-center gap-1 ${activeTab === 'SHORT' ? 'bg-[#f6465d]/20 text-[#f6465d] font-bold' : 'text-slate-500 hover:text-[#f6465d]'}`}>🩸 AI 推薦做空</button>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
              {isScanning && <div className="flex items-center gap-2 text-xs text-amber-500"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> AI 掃描中 {scanProgress}%...</div>}
              <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-2 h-4 w-4 text-slate-500" />
                  <input type="text" placeholder="搜尋合約..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="block w-full pl-9 pr-3 py-1.5 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white focus:border-amber-500/50 outline-none" />
              </div>
          </div>
      </div>

      <div>
          {displayTickers.length === 0 && !isScanning ? (
              <div className="py-20 text-center text-slate-500 border border-dashed border-[#2a2f3a] rounded-xl">目前沒有符合條件的標的</div>
          ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {displayTickers.map((ticker) => (
                      <MarketCard 
                          key={ticker.symbol} 
                          ticker={ticker} 
                          fundingRate={fundingRates[ticker.symbol]} 
                          signalData={aiSignals[ticker.symbol]}
                          onSelectCoin={(symbol) => window.location.hash = `#/trade/${symbol}`} 
                      />
                  ))}
              </div>
          )}
      </div>
    </div>
  );
}

// --- 持倉與管理頁 ---
function PositionsPage({ allTickers, paperAccount, openPosition, closePosition, adjustPosition }) {
  const activeSymbols = [...new Set(paperAccount.positions.map(p => p.symbol))];
  const activeTickers = allTickers.filter(t => activeSymbols.includes(t.symbol));

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      <div>
          <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
              <Layers className="w-6 h-6 text-blue-500" /> 當前持倉與管理
          </h2>
          {paperAccount.positions.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {paperAccount.positions.map(pos => {
                      const currentPrice = parseFloat(allTickers.find(t => t.symbol === pos.symbol)?.lastPrice || pos.entryPrice);
                      return <PositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onSelectCoin={(coin) => window.location.hash = `#/trade/${coin.symbol}`} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(type, val) => adjustPosition(pos.id, type, val, currentPrice)} />;
                  })}
              </div>
          ) : (
              <div className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-10 text-center text-slate-500">
                 目前尚無任何持倉，請至「市場分析」選擇幣種進行交易。
              </div>
          )}
      </div>

      {activeTickers.length > 0 && (
          <div>
              <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
                  <Zap className="w-6 h-6 text-amber-500" /> 快捷交易區 (免跳轉直接下單)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeTickers.map((ticker) => (
                      <div key={ticker.symbol} className="bg-[#121620] border border-[#2a2f3a] rounded-xl p-5 shadow-lg">
                          <div className="flex justify-between items-start mb-4 border-b border-[#2a2f3a] pb-3">
                              <div>
                                  <h3 className="font-black text-white text-xl cursor-pointer hover:text-blue-400 transition-colors" onClick={() => window.location.hash = `#/trade/${ticker.symbol}`}>{ticker.symbol.replace('USDT', '')} <span className="text-xs text-slate-500 font-normal">USDT</span></h3>
                                  <div className="text-[11px] text-slate-400 mt-1">Vol: {formatVolume(ticker.quoteVolume)}</div>
                              </div>
                              <span className="text-xl font-mono text-white">${formatPrice(ticker.lastPrice)}</span>
                          </div>
                          <TradeForm symbol={ticker.symbol} currentPrice={parseFloat(ticker.lastPrice)} balance={paperAccount.balance} onOpenPosition={openPosition} />
                      </div>
                  ))}
              </div>
          </div>
      )}

      {paperAccount.history && paperAccount.history.length > 0 && (
          <div>
              <h2 className="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
                  <Clock className="w-6 h-6 text-blue-500" /> 歷史交易紀錄
              </h2>
              <div className="bg-[#121620] rounded-lg border border-[#2a2f3a] overflow-hidden overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-[#0b0e14] text-slate-500">
                          <tr>
                              <th className="px-4 py-3 font-normal">平倉時間</th>
                              <th className="px-4 py-3 font-normal">合約</th>
                              <th className="px-4 py-3 font-normal">方向/槓桿</th>
                              <th className="px-4 py-3 font-normal text-right">數量(Size)</th>
                              <th className="px-4 py-3 font-normal text-right">開倉價</th>
                              <th className="px-4 py-3 font-normal text-right">平倉價</th>
                              <th className="px-4 py-3 font-normal text-right">實現盈虧 (PnL)</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2f3a]">
                          {paperAccount.history.map((item, idx) => {
                              const isProfit = item.pnl >= 0;
                              return (
                                  <tr key={idx} className="hover:bg-[#1a1e27] transition-colors">
                                      <td className="px-4 py-3 text-slate-400">{item.closeTime}</td>
                                      <td className="px-4 py-3 font-bold text-white cursor-pointer hover:text-amber-500" onClick={() => window.location.hash = `#/trade/${item.symbol}`}>
                                          {item.symbol}
                                      </td>
                                      <td className="px-4 py-3">
                                          <span className={`px-1.5 py-0.5 rounded font-bold ${item.type === 'LONG' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
                                              {item.type} {item.leverage}x
                                          </span>
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono text-slate-300">{item.size.toFixed(4)}</td>
                                      <td className="px-4 py-3 text-right font-mono text-slate-300">${formatPrice(item.entryPrice)}</td>
                                      <td className="px-4 py-3 text-right font-mono text-slate-300">${formatPrice(item.closePrice)}</td>
                                      <td className="px-4 py-3 text-right">
                                          <div className={`font-mono font-bold ${isProfit ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                                              {isProfit ? '+' : ''}{item.pnl.toFixed(2)} USDT
                                          </div>
                                      </td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          </div>
      )}
    </div>
  );
}

// --- 單一幣種專屬交易面板 ---
function TradingWorkspace({ coin, fundingRate, paperAccount, openPosition, closePosition, adjustPosition }) {
  const [klines, setKlines] = useState([]);
  const [currentPrice, setCurrentPrice] = useState(parseFloat(coin.lastPrice));

  useEffect(() => {
    let isMounted = true;
    const fetchDetailData = async () => {
      try {
        const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=15m&limit=120`);
        const data = await res.json();
        if (isMounted) {
            setKlines(data.map(c => ({ time: c[0], open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]) })));
            if(data.length > 0) setCurrentPrice(parseFloat(data[data.length - 1][4]));
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
    }, 1000); 
    return () => { isMounted = false; clearInterval(interval); };
  }, [coin.symbol]);

  const historyCloses = useMemo(() => klines.map(k => k.close), [klines]);
  const macdSeries = useMemo(() => calculateMACDSeries(historyCloses), [historyCloses]);
  const strategy = useMemo(() => generateTradingSignal(currentPrice, historyCloses, fundingRate), [currentPrice, historyCloses, fundingRate]);

  return (
    <div className="animate-in fade-in duration-200">
      <button onClick={() => window.history.back()} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded border border-[#2a2f3a]"><ArrowLeft className="w-4 h-4" /> 返回上一頁</button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] rounded-xl p-5 border border-[#2a2f3a] flex justify-between items-center shadow-lg">
            <div>
              <h2 className="text-3xl font-black text-white">{coin.symbol.replace('USDT', '')} <span className="text-sm font-normal text-slate-500">USDT</span></h2>
              <div className="text-xs text-slate-400 mt-1">24h Vol: {formatVolume(coin.quoteVolume)}</div>
              <div className="text-3xl font-mono font-bold text-white mt-2">${formatPrice(currentPrice)}</div>
            </div>
            <div className="text-right">
                <span className="text-xs text-slate-500 block mb-1">資金費率</span>
                <span className="text-sm font-mono text-amber-500 bg-amber-500/10 px-2 py-1 rounded">{fundingRate ? formatFundingRate(fundingRate) : '--'}</span>
            </div>
          </div>

          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 bg-blue-600 text-[10px] text-white px-3 py-1 rounded-bl-lg font-bold tracking-wider">PAPER TRADING</div>
             <h3 className="text-base font-bold text-slate-200 mb-6 flex items-center gap-2"><PieChart className="w-5 h-5 text-blue-400" /> 專業合約下單</h3>
             <TradeForm symbol={coin.symbol} currentPrice={currentPrice} balance={paperAccount.balance} onOpenPosition={openPosition} />
          </div>

          {strategy && (
             <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg">
                 <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2"><Crosshair className="w-4 h-4 text-amber-500" /> AI 短線分析 (15m)</h3>
                 <div className="flex justify-between items-center bg-[#0b0e14] p-3 rounded border border-[#1e2330]">
                     <span className={`text-2xl font-black ${strategy.signal === 'LONG' ? 'text-[#0ecb81]' : strategy.signal === 'SHORT' ? 'text-[#f6465d]' : 'text-slate-400'}`}>{strategy.signal}</span>
                     {strategy.signal !== 'NEUTRAL' && <span className="text-lg font-mono text-white">勝率 {strategy.confidence}%</span>}
                 </div>
                 {strategy.signal !== 'NEUTRAL' && (
                     <div className="mt-3 space-y-1.5 pt-3 border-t border-[#2a2f3a]">
                        {strategy.analysisLog.map((log, idx) => (
                            <div key={idx} className="text-xs text-slate-300 flex items-start gap-1.5">
                                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.includes('+') ? 'bg-[#0ecb81]' : 'bg-[#f6465d]'}`}></span>
                                {log}
                            </div>
                        ))}
                     </div>
                 )}
             </div>
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-[#121620] rounded-xl p-1 border border-[#2a2f3a] shadow-lg">
             <AdvancedKLineChart klines={klines} macdSeries={macdSeries} />
          </div>

          <div>
              <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-500" /> 該幣種持倉紀錄</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paperAccount.positions.filter(p => p.symbol === coin.symbol).map(pos => (
                      <PositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(type, val) => adjustPosition(pos.id, type, val, currentPrice)} />
                  ))}
                  {paperAccount.positions.filter(p => p.symbol === coin.symbol).length === 0 && (
                      <div className="col-span-full py-8 text-center text-slate-500 bg-[#121620] border border-[#2a2f3a] rounded-xl">目前未持有此幣種</div>
                  )}
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

  useEffect(() => {
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script'); script.id = 'tailwind-cdn'; script.src = 'https://cdn.tailwindcss.com';
      script.onload = () => setIsStylesLoaded(true); document.head.appendChild(script);
    } else { setIsStylesLoaded(true); }
  }, []);

  const [allTickers, setAllTickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fundingRates, setFundingRates] = useState({});
  const [currentRoute, setCurrentRoute] = useState('home'); // 'home' | 'positions' | 'trade' | 'assets'
  const [selectedCoin, setSelectedCoin] = useState(null);

  const [paperAccount, setPaperAccount] = useState(() => {
    try { const saved = localStorage.getItem('paperAccount'); return saved ? JSON.parse(saved) : { balance: 10000, positions: [], history: [] }; }
    catch { return { balance: 10000, positions: [], history: [] }; }
  });

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

  useEffect(() => {
    fetchFuturesData(); const interval = setInterval(fetchFuturesData, 5000); return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '');
      if (hash === '' || hash === 'home') {
          setCurrentRoute('home');
          setSelectedCoin(null);
      } else if (hash === 'positions') {
          setCurrentRoute('positions');
          setSelectedCoin(null);
      } else if (hash === 'assets') {
          setCurrentRoute('assets');
          setSelectedCoin(null);
      } else if (hash.startsWith('trade/')) {
          const symbol = hash.replace('trade/', '');
          if (allTickers.length > 0) {
              const coin = allTickers.find(t => t.symbol === symbol);
              if (coin) {
                  setSelectedCoin(coin);
                  setCurrentRoute('trade');
              }
          }
      }
    };
    if (allTickers.length > 0) handleHashChange();
    window.addEventListener('hashchange', handleHashChange); 
    return () => window.removeEventListener('hashchange', handleHashChange);
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
            const newMargin = pos.margin + addedMargin;
            const newLiq = pos.type === 'LONG' ? newEntry * (1 - 1/pos.leverage + 0.004) : newEntry * (1 + 1/pos.leverage - 0.004);
            return { ...prev, balance: prev.balance - addedMargin, positions: prev.positions.map(p => p.id === posId ? { ...p, size: newSize, margin: newMargin, entryPrice: newEntry, liqPrice: Math.max(newLiq, 0) } : p) };
        } else if(type === 'reduce') {
            const reducedMargin = parseFloat(adjustAmount); const ratio = reducedMargin / pos.margin;
            if(ratio >= 1) { 
                let pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * pos.size : (pos.entryPrice - currentPrice) * pos.size;
                return { ...prev, balance: prev.balance + pos.margin + pnl, positions: prev.positions.filter(p => p.id !== posId) };
            }
            const reducedSize = pos.size * ratio; let pnl = pos.type === 'LONG' ? (currentPrice - pos.entryPrice) * reducedSize : (pos.entryPrice - currentPrice) * reducedSize;
            return { ...prev, balance: prev.balance + reducedMargin + pnl, positions: prev.positions.map(p => p.id === posId ? { ...p, size: pos.size - reducedSize, margin: pos.margin - reducedMargin } : p) };
        }
        return prev;
    });
  };

  if (!isStylesLoaded) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',background:'#0b0e14',color:'#fff'}}>載入中...</div>;

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-indigo-500/30 pb-20">
      <header className="bg-[#121620] border-b border-[#2a2f3a] sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center gap-4">
          
          <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 text-amber-500 cursor-pointer" onClick={() => window.location.hash = '#/home'}>
                <Zap className="w-6 h-6 fill-amber-500/20" />
                <h1 className="text-xl font-bold text-white tracking-wide hidden sm:block">ProTrade</h1>
              </div>

              <nav className="flex gap-1">
                  <button 
                      onClick={() => window.location.hash = '#/home'} 
                      className={`px-3 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${currentRoute === 'home' ? 'bg-[#2a2f3a] text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1e27]'}`}
                  >
                      <Activity className="w-4 h-4"/> 市場分析
                  </button>
                  <button 
                      onClick={() => window.location.hash = '#/positions'} 
                      className={`px-3 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${currentRoute === 'positions' ? 'bg-[#2a2f3a] text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1e27]'}`}
                  >
                      <Briefcase className="w-4 h-4"/> 持倉與管理
                      {paperAccount.positions.length > 0 && <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{paperAccount.positions.length}</span>}
                  </button>
                  <button 
                      onClick={() => window.location.hash = '#/assets'} 
                      className={`px-3 py-2 text-sm font-bold rounded-lg transition-colors flex items-center gap-2 ${currentRoute === 'assets' ? 'bg-[#2a2f3a] text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1e27]'}`}
                  >
                      <BarChart2 className="w-4 h-4"/> 資產中心
                  </button>
              </nav>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden sm:flex items-center gap-2 bg-[#1a1e27] px-3 py-1.5 rounded border border-[#2a2f3a]">
                <Wallet className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-mono text-white">${paperAccount.balance.toFixed(2)} USDT</span>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentRoute === 'home' && (
            <Dashboard allTickers={allTickers} fundingRates={fundingRates} loading={loading} />
        )}
        {currentRoute === 'positions' && (
            <PositionsPage allTickers={allTickers} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />
        )}
        {currentRoute === 'assets' && (
            <AssetsPage allTickers={allTickers} paperAccount={paperAccount} />
        )}
        {currentRoute === 'trade' && selectedCoin && (
            <TradingWorkspace coin={selectedCoin} fundingRate={fundingRates[selectedCoin.symbol]} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />
        )}
      </main>
    </div>
  );
}
