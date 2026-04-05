import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  RefreshCw, 
  ArrowLeft, 
  Search,
  Target,
  Zap,
  Wallet,
  ZoomIn,         
  ZoomOut,        
  MoveHorizontal, 
  Pencil,         
  Trash2,
  X,              
  Layers,          
  BarChart2,
  Waves,
  Menu,
  Filter,
  Bitcoin,
  LineChart,
  Newspaper,
  ChevronRight,
  Globe,
  ExternalLink,
  Clock
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
  return v.toLocaleString('en-US'); // 台股成交股數通常較大，直接加逗號或轉 K/M
};

// --- SMC 虛擬貨幣量化分析核心函數 (保留原邏輯) ---
const calculateVolumeProfile = (klines, bins = 24) => {
  if (!klines || klines.length === 0) return { poc: 0, vah: 0, val: 0, profile: [] };
  const lows = klines.map(k => k.low);
  const highs = klines.map(k => k.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const step = (max - min) / bins;
  
  const profile = Array(bins).fill(0).map((_, i) => ({ price: min + step * i, volume: 0 }));
  let totalVol = 0;

  klines.forEach(k => {
    const index = Math.min(bins - 1, Math.floor((k.close - min) / (step || 1)));
    profile[index].volume += k.volume;
    totalVol += k.volume;
  });

  let maxVol = 0; let pocIndex = 0;
  profile.forEach((p, i) => { 
      if (p.volume > maxVol) { maxVol = p.volume; pocIndex = i; } 
  });

  const poc = profile[pocIndex].price;

  let volCount = profile[pocIndex].volume;
  let up = pocIndex + 1;
  let down = pocIndex - 1;
  
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

const calculateAVWAP = (klines) => {
  if (!klines || klines.length === 0) return 0;
  let totalPV = 0; let totalV = 0;
  klines.forEach(k => { totalPV += ((k.high + k.low + k.close) / 3) * k.volume; totalV += k.volume; });
  return totalV === 0 ? 0 : totalPV / totalV;
};

const detectLiquiditySweep = (klines) => {
  if (klines.length < 20) return { sweepLong: false, sweepShort: false };
  const lastK = klines[klines.length - 1];
  const prevKlines = klines.slice(-20, -1);
  const localHigh = Math.max(...prevKlines.map(k => k.high));
  const localLow = Math.min(...prevKlines.map(k => k.low));
  
  const sweepLong = lastK.low < localLow && lastK.close > localLow;
  const sweepShort = lastK.high > localHigh && lastK.close < localHigh;
  return { sweepLong, sweepShort, localHigh, localLow };
};

const analyzeOrderFlow = (klines) => {
  if (klines.length < 3) return { isAbsorption: false, isAggressiveBuy: false, isAggressiveSell: false, fvgUp: false, fvgDown: false };
  
  const lastK = klines[klines.length - 1];
  const k1 = klines[klines.length - 3];
  const k3 = lastK;

  const fvgUp = k3.low > k1.high;
  const fvgDown = k3.high < k1.low;

  const bodySize = Math.abs(lastK.close - lastK.open);
  const upperWick = lastK.high - Math.max(lastK.open, lastK.close);
  const lowerWick = Math.min(lastK.open, lastK.close) - lastK.low;
  const avgVol = klines.slice(-10).reduce((a, b) => a + b.volume, 0) / 10;
  
  const isAbsorption = lastK.volume > avgVol * 1.5 && bodySize < (upperWick + lowerWick);
  const isAggressiveBuy = lastK.close > lastK.open && upperWick < bodySize * 0.1 && lastK.volume > avgVol;
  const isAggressiveSell = lastK.close < lastK.open && lowerWick < bodySize * 0.1 && lastK.volume > avgVol;
  
  return { isAbsorption, isAggressiveBuy, isAggressiveSell, fvgUp, fvgDown };
};

const generateAdvancedSignal = (klines, currentPrice, fundingRate) => {
  if (!klines || klines.length < 50) return null;
  const vp = calculateVolumeProfile(klines);
  const avwap = calculateAVWAP(klines);
  const sweep = detectLiquiditySweep(klines);
  const flow = analyzeOrderFlow(klines);
  const fr = parseFloat(fundingRate || 0);

  let signal = 'NEUTRAL';
  let score = 0;
  let analysisLog = [];

  if (currentPrice > avwap) { score += 1; analysisLog.push("Anchored VWAP：價格位於機構加權平均成本之上 (+1)"); } 
  else { score -= 1; analysisLog.push("Anchored VWAP：價格受到機構加權平均成本壓制 (-1)"); }

  if (currentPrice > vp.vah) { score += 1.5; analysisLog.push("Volume Profile：強勢突破價值區間上緣 (VAH) (+1.5)"); } 
  else if (currentPrice < vp.val) { score -= 1.5; analysisLog.push("Volume Profile：弱勢跌破價值區間下緣 (VAL) (-1.5)"); } 
  else if (currentPrice > vp.poc) { score += 0.5; analysisLog.push("Volume Profile：位於區間內，守穩最高成交量控制點 (POC) (+0.5)"); } 
  else { score -= 0.5; analysisLog.push("Volume Profile：位於區間內，受壓於最高成交量控制點 (POC) (-0.5)"); }

  if (sweep.sweepLong) { score += 3; analysisLog.push("Liquidity Sweep：精準向低點獵取流動性，機構洗盤看漲 (+3)"); }
  if (sweep.sweepShort) { score -= 3; analysisLog.push("Liquidity Sweep：向高點獵取流動性誘多，隨後遭狙擊看跌 (-3)"); }

  if (flow.fvgUp) { score += 2; analysisLog.push("Order Flow：出現多頭合理價值缺口 (Bullish FVG) (+2)"); }
  if (flow.fvgDown) { score -= 2; analysisLog.push("Order Flow：出現空頭合理價值缺口 (Bearish FVG) (-2)"); }

  if (fr > 0.0006) { score -= 1.5; analysisLog.push("Funding Rate：市場極度看多擁擠，具備多殺多風險 (-1.5)"); } 
  else if (fr < -0.0002) { score += 1.5; analysisLog.push("Funding Rate：市場偏空擁擠，具備軋空引擎動力 (+1.5)"); }

  if (score >= 4.5) signal = 'LONG';
  else if (score <= -4.5) signal = 'SHORT';
  
  return { signal, score, currentPrice, analysisLog, poc: vp.poc, avwap };
};

// ==========================================
// 子系統 1：首頁門戶 (PortalPage)
// ==========================================
function PortalPage() {
  const cards = [
    {
      id: 'crypto',
      title: '虛擬貨幣量化 SMC',
      desc: '串接幣安合約真實數據，提供 Order Flow、VWAP 等機構級交易訊號與模擬下單。',
      icon: <Bitcoin className="w-12 h-12 text-[#f7931a]" />,
      color: 'from-[#f7931a]/20 to-[#f7931a]/5',
      borderColor: 'border-[#f7931a]/30 hover:border-[#f7931a]',
      route: '#/crypto/home'
    },
    {
      id: 'tw-stocks',
      title: '台灣股市真實行情',
      desc: '串接 TWSE 證交所公開 API，追蹤台股熱門個股，即時報價、成交量分析與篩選。',
      icon: <LineChart className="w-12 h-12 text-[#3b82f6]" />,
      color: 'from-[#3b82f6]/20 to-[#3b82f6]/5',
      borderColor: 'border-[#3b82f6]/30 hover:border-[#3b82f6]',
      route: '#/tw-stocks'
    },
    {
      id: 'news',
      title: '24H 真實熱點新聞',
      desc: '串接 Yahoo 奇摩與外媒 RSS，匯聚全球加密貨幣與台股總經新聞，掌握第一手資訊。',
      icon: <Newspaper className="w-12 h-12 text-[#10b981]" />,
      color: 'from-[#10b981]/20 to-[#10b981]/5',
      borderColor: 'border-[#10b981]/30 hover:border-[#10b981]',
      route: '#/news'
    }
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] animate-in fade-in zoom-in-95 duration-500 py-10">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-full mb-4 ring-1 ring-blue-500/30">
          <Globe className="w-8 h-8 text-blue-400" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">SMC <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">PRO MAX</span></h1>
        <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base">全方位金融分析平台，整合真實市場數據。<br/>選擇下方的交易市場或資訊中心，開啟您的專業分析之旅。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl px-4">
        {cards.map(card => (
          <div 
            key={card.id}
            onClick={() => window.location.hash = card.route}
            className={`relative overflow-hidden bg-gradient-to-b ${card.color} border ${card.borderColor} rounded-2xl p-8 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/10 group flex flex-col`}
          >
            <div className="mb-6 bg-[#0b0e14] w-16 h-16 rounded-2xl flex items-center justify-center ring-1 ring-white/5 shadow-inner">
              {card.icon}
            </div>
            <h2 className="text-2xl font-bold text-white mb-3 group-hover:translate-x-1 transition-transform">{card.title}</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 flex-1">{card.desc}</p>
            <div className="mt-auto flex items-center text-sm font-bold text-white group-hover:text-blue-400 transition-colors">
              進入系統 <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-2 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 子系統 2：台灣股市行情 (TwStocksDashboard)
// ==========================================
function TwStocksDashboard() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchTwStocks = async () => {
      try {
        setLoading(true);
        // 使用證交所公開 API (CORS Friendly) 獲取當日真實收盤數據
        const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
        if (!res.ok) throw new Error('無法取得證交所數據');
        const data = await res.json();
        
        if (isMounted) {
          const formatted = data
            // 過濾掉權證 (代號大於4碼) 以及一些非普通股
            .filter(item => item.Code.length === 4 && !isNaN(parseInt(item.Code)))
            .map(item => {
              const current = parseFloat(item.ClosingPrice);
              const changeAmt = parseFloat(item.Change.replace('+', ''));
              let percent = 0;
              let isUp = false;
              
              if (!isNaN(current) && !isNaN(changeAmt)) {
                  // 如果 item.Change 有帶符號，但有時 TWSE 會省略符號，這裡簡化處理：
                  // API 裡的 Change 通常是絕對值，需搭配前一日收盤價判斷，但 openapi 有時直接給漲跌。
                  // 為求保險，如果無法精確取得前一日，以 current - changeAmt 估算。
                  const prevClose = current - changeAmt; 
                  if (prevClose > 0) percent = (changeAmt / prevClose) * 100;
                  
                  // TWSE API 特性：漲跌符號有時是另外的欄位，若無，我們依賴 Change 字串本身有沒有 '-'
                  if (item.Change.includes('-')) {
                      percent = -Math.abs(percent);
                  } else if (item.Change !== '0.00' && item.Change !== '0') {
                      percent = Math.abs(percent);
                  }
              }
              
              return {
                symbol: item.Code,
                name: item.Name,
                lastPrice: isNaN(current) ? '0.00' : current.toFixed(2),
                priceChangePercent: percent.toFixed(2),
                quoteVolume: parseInt(item.TradeVolume) || 0, 
                rawChange: item.Change
              };
            })
            // 過濾無效價格，並依據真實成交量排序 (取前 200 名熱門股)
            .filter(item => item.lastPrice !== '0.00')
            .sort((a, b) => b.quoteVolume - a.quoteVolume)
            .slice(0, 200);

          setStocks(formatted);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchTwStocks();
    return () => { isMounted = false; };
  }, []);

  let filtered = stocks;
  if (searchTerm) {
    filtered = filtered.filter(t => t.symbol.includes(searchTerm) || t.name.includes(searchTerm));
  }

  if (loading) return <div className="text-center py-32 text-slate-500 animate-pulse"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取 TWSE 證交所真實數據中...</div>;
  if (error) return <div className="text-center py-32 text-red-500"><AlertCircle className="w-8 h-8 mx-auto mb-4" /> 取得台股數據失敗：{error}</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-[#121620] p-4 rounded-xl border border-[#2a2f3a] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg"><LineChart className="w-6 h-6 text-blue-400" /></div>
          <div>
            <h2 className="text-xl font-bold text-white">台股大盤與熱門個股 (真實數據)</h2>
            <p className="text-xs text-slate-400">資料來源: 台灣證券交易所 (TWSE) 盤後開源數據</p>
          </div>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input 
            type="text" 
            placeholder="輸入股號或名稱..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded-lg bg-[#0b0e14] text-white focus:border-blue-500 outline-none transition-colors" 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map(stock => {
          const change = parseFloat(stock.priceChangePercent);
          const isPositive = change >= 0;
          return (
            <div key={stock.symbol} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-xl p-5 transition-all flex flex-col justify-between shadow-md group">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-slate-100 text-lg group-hover:text-blue-400 transition-colors">{stock.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">{stock.symbol}</div>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-bold ${isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'}`}>
                  {isPositive ? '+' : ''}{change.toFixed(2)}%
                </div>
              </div>
              <div className="mt-4">
                <div className={`text-2xl font-mono font-bold ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{stock.lastPrice}</div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono">成交股數: {formatVolume(stock.quoteVolume)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="text-center py-20 text-slate-500">找不到符合的股票代號或名稱。</div>}
    </div>
  );
}

// ==========================================
// 子系統 3：熱點新聞系統 (NewsDashboard)
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
        // 使用 RSS2JSON 服務抓取真實 RSS 新聞 (Yahoo台股 & Cointelegraph)
        const feeds = [
            { url: 'https://tw.stock.yahoo.com/rss?category=stock', category: '台股 / 宏觀' },
            { url: 'https://cointelegraph.com/rss', category: '加密貨幣' }
        ];

        let allArticles = [];
        for (const feed of feeds) {
            const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
            const data = await res.json();
            if (data.status === 'ok') {
                const items = data.items.map(item => ({
                    id: item.guid || item.link,
                    title: item.title,
                    link: item.link,
                    time: new Date(item.pubDate).toLocaleString(),
                    rawDate: new Date(item.pubDate),
                    source: feed.category === '加密貨幣' ? 'Cointelegraph' : 'Yahoo 股市',
                    category: feed.category
                }));
                allArticles = [...allArticles, ...items];
            }
        }
        
        if (isMounted) {
            // 依時間降冪排序
            allArticles.sort((a, b) => b.rawDate - a.rawDate);
            setNews(allArticles);
            setLoading(false);
        }
      } catch (error) {
        console.error("News fetch error:", error);
        if (isMounted) setLoading(false);
      }
    };

    fetchRealNews();
    return () => { isMounted = false; };
  }, []);

  const filteredNews = activeCategory === '全部' ? news : news.filter(n => n.category === activeCategory);

  if (loading) return <div className="text-center py-32 text-slate-500 animate-pulse"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取全球真實熱點新聞中...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121620] p-4 rounded-xl border border-[#2a2f3a] shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-lg"><Newspaper className="w-6 h-6 text-emerald-400" /></div>
          <div>
            <h2 className="text-xl font-bold text-white">24H 財經熱點新聞</h2>
            <p className="text-xs text-slate-400">來源：Yahoo 股市、Cointelegraph</p>
          </div>
        </div>
        <div className="flex bg-[#0b0e14] p-1 rounded-lg border border-[#2a2f3a] w-full sm:w-auto">
          {['全部', '台股 / 宏觀', '加密貨幣'].map(cat => (
            <button 
              key={cat} 
              onClick={() => setActiveCategory(cat)} 
              className={`flex-1 sm:flex-none px-4 py-2 text-sm rounded transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredNews.map(item => (
          <a 
            key={item.id} 
            href={item.link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-[#121620] border border-[#2a2f3a] hover:border-emerald-500/40 rounded-xl p-5 flex flex-col justify-between shadow-md group transition-all"
          >
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className={`text-xs font-bold px-2 py-1 rounded ${item.category === '加密貨幣' ? 'bg-[#f7931a]/10 text-[#f7931a]' : 'bg-[#3b82f6]/10 text-[#3b82f6]'}`}>
                  {item.category}
                </span>
                <span className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {item.time}</span>
              </div>
              <h3 className="font-bold text-slate-100 text-lg group-hover:text-emerald-400 transition-colors leading-relaxed mb-3 line-clamp-2">
                {item.title}
              </h3>
            </div>
            <div className="flex justify-between items-center mt-auto pt-4 border-t border-[#2a2f3a]/50">
              <span className="text-xs text-slate-400">{item.source}</span>
              <span className="text-xs text-emerald-500 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                閱讀全文 <ExternalLink className="w-3 h-3" />
              </span>
            </div>
          </a>
        ))}
        {filteredNews.length === 0 && !loading && (
          <div className="col-span-1 lg:col-span-2 text-center py-20 text-slate-500">此分類目前無新聞。</div>
        )}
      </div>
    </div>
  );
}


// ==========================================
// 子系統 4：虛擬貨幣量化 SMC (保留原代碼與子系統)
// ==========================================

// --- Crypto 組件：TradeForm ---
function CryptoTradeForm({ symbol, currentPrice, balance, onOpenPosition }) {
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

// --- Crypto 組件：PositionCard ---
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

// --- Crypto 組件：MarketCard ---
function CryptoMarketCard({ ticker, signalData, onSelectCoin }) {
  const change = parseFloat(ticker.priceChangePercent);
  const isPositive = change >= 0;
  return (
    <div onClick={() => {
        sessionStorage.setItem('dashboardScroll', window.scrollY.toString());
        onSelectCoin(ticker.symbol);
      }} className="bg-[#121620] border border-[#2a2f3a] hover:border-blue-500/40 rounded-lg p-4 cursor-pointer transition-all flex flex-col justify-between shadow-md">
      <div>
        <div className="flex justify-between items-start mb-1">
          <div>
            <h3 className="font-bold text-slate-100">{ticker.symbol.replace('USDT', '')}</h3>
            <div className="text-[10px] text-slate-500 mt-0.5 font-mono">Vol: {formatVolume(ticker.quoteVolume)}</div>
          </div>
          <div className={`text-xs font-bold ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{isPositive ? '+' : ''}{change.toFixed(2)}%</div>
        </div>
        <div className="text-lg font-mono font-semibold text-white mt-1 mb-2">${formatPrice(ticker.lastPrice)}</div>
      </div>
      
      {signalData && signalData.signal !== 'NEUTRAL' && (
        <div className={`mt-2 text-[10px] p-2 rounded border ${signalData.signal === 'LONG' ? 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]' : 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]'}`}>
          <div className="font-bold flex items-center gap-1"><Target className="w-3 h-3"/> SMC {signalData.timeframe}: {signalData.signal}</div>
          <div className="truncate opacity-80">{signalData.analysisLog[0]}</div>
        </div>
      )}
    </div>
  );
}

// --- Crypto 組件：K線圖 ---
const CryptoAdvancedKLineChart = ({ klines, signalData }) => {
  const containerRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(60); 
  const [endIndexOffset, setEndIndexOffset] = useState(0); 
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [drawings, setDrawings] = useState([]);
  const [currentDrawing, setCurrentDrawing] = useState(null);

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

  const xToTime = (x) => visibleKlines[Math.max(0, Math.min(Math.floor((x - paddingX) / xStep), safeVisibleCount - 1))]?.time;
  const yToPrice = (y) => minPrice + ((kLineHeight - 20 - y) / (kLineHeight - 40)) * priceRange;
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

  const hoveredK = hoveredIndex !== null ? visibleKlines[hoveredIndex] : null;

  return (
    <div className="w-full relative group touch-none" style={{ height: '500px' }}>
      <div className="absolute top-2 right-2 flex gap-1.5 z-10 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => setDrawMode(!drawMode)} className={`p-1.5 rounded backdrop-blur border border-[#2a2f3a] ${drawMode ? 'bg-amber-500/20 text-amber-500' : 'bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300'}`}><Pencil className="w-4 h-4" /></button>
        {drawings.length > 0 && <button onClick={() => setDrawings([])} className="p-1.5 bg-[#1a1e27]/80 hover:bg-red-500/20 text-red-400 rounded backdrop-blur border border-[#2a2f3a]"><Trash2 className="w-4 h-4" /></button>}
        <div className="w-px h-6 bg-[#2a2f3a] mx-1 self-center"></div>
        <button onClick={() => setVisibleCount(p => Math.max(15, Math.round(p * 0.8)))} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded"><ZoomIn className="w-4 h-4" /></button>
        <button onClick={() => setVisibleCount(p => Math.min(dataLen, Math.round(p * 1.2)))} className="p-1.5 bg-[#1a1e27]/80 hover:bg-[#2a2f3a] text-slate-300 rounded"><ZoomOut className="w-4 h-4" /></button>
      </div>

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

      <div ref={containerRef} className={`w-full h-full overflow-hidden touch-none ${drawMode ? 'cursor-crosshair' : 'cursor-default'}`} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseLeave={() => {setIsDragging(false); setHoveredIndex(null);}} onMouseMove={handleMouseMove}>
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
          {drawings.concat(currentDrawing ? [currentDrawing] : []).map((line, idx) => (
              <line key={idx} x1={timeToX(line.t1)} y1={getPriceY(line.p1)} x2={timeToX(line.t2)} y2={getPriceY(line.p2)} stroke="#f59e0b" strokeWidth="2" />
          ))}
          <text x={width - 5} y={20} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(maxPrice)}</text>
          <text x={width - 5} y={kLineHeight - 10} fill="#848e9c" textAnchor="end" fontSize="10">{formatPrice(minPrice)}</text>
        </svg>
      </div>
    </div>
  );
};

// --- Crypto 組件：Dashboard ---
function CryptoDashboard({ allTickers, fundingRates, loading, dashState, setDashState }) {
  const { activeTab, timeframe, scanLimit, searchTerm, aiSignals, isScanning, scanProgress, initialScanned } = dashState;
  const [isRangeOpen, setIsRangeOpen] = useState(false);

  const setActiveTab = (tab) => setDashState(p => ({ ...p, activeTab: tab }));
  const setTimeframe = (tf) => setDashState(p => ({ ...p, timeframe: tf }));
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
    const batch = 15;
    const totalOps = tfs.length * targets.length;
    let completed = 0;

    for (const tf of tfs) {
        for (let i = 0; i < targets.length; i += batch) {
          const chunk = targets.slice(i, i + batch);
          const chunkSignals = {};
          await Promise.all(chunk.map(async (coin) => {
            try {
              const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${tf}&limit=80`);
              if(!res.ok) return;
              const data = await res.json();
              const parsed = data.map(d => ({ open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]) }));
              const sig = generateAdvancedSignal(parsed, parseFloat(coin.lastPrice), fundingRates[coin.symbol]);
              if (sig && sig.signal !== 'NEUTRAL') {
                 chunkSignals[coin.symbol] = { ...sig, timeframe: tf };
              }
            } catch(e) { }
          }));
          
          if (Object.keys(chunkSignals).length > 0) {
             setDashState(prev => ({
                 ...prev,
                 aiSignals: {
                     ...prev.aiSignals,
                     [tf]: { ...prev.aiSignals[tf], ...chunkSignals }
                 }
             }));
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

  if (loading && !allTickers.length) return <div className="text-center py-32 text-slate-500 animate-pulse"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" /> 抓取幣安真實數據中...</div>;

  let filtered = allTickers.slice(0, scanLimit);
  const currentSignals = aiSignals[timeframe] || {};
  
  if (activeTab === 'LONG') filtered = filtered.filter(t => currentSignals[t.symbol]?.signal === 'LONG');
  else if (activeTab === 'SHORT') filtered = filtered.filter(t => currentSignals[t.symbol]?.signal === 'SHORT');
  
  if (searchTerm) filtered = filtered.filter(t => t.symbol.includes(searchTerm.toUpperCase()));

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 sm:sticky sm:top-[64px] z-10 py-3 bg-[#0b0e14]/95 backdrop-blur border-b border-[#2a2f3a]/50">
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a] w-full sm:w-auto">
                  {['ALL', 'LONG', 'SHORT'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 sm:flex-none px-2 sm:px-4 py-2 sm:py-1.5 text-xs sm:text-sm rounded transition-all whitespace-nowrap ${activeTab === t ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}>
                      {t === 'ALL' ? '全部' : t === 'LONG' ? '🔥 推薦做多' : '🩸 推薦做空'}
                    </button>
                  ))}
              </div>
              {(activeTab === 'LONG' || activeTab === 'SHORT') && (
                  <div className="flex items-center gap-2 w-full sm:w-auto animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex bg-[#121620] p-1 rounded-lg border border-[#2a2f3a] flex-1 sm:flex-none">
                          {['15m', '1h', '4h'].map(tf => (
                            <button key={tf} onClick={() => setTimeframe(tf)} className={`flex-1 sm:flex-none px-3 py-2 sm:py-1.5 text-xs sm:text-sm rounded transition-all whitespace-nowrap ${timeframe === tf ? 'bg-amber-600/20 text-amber-500 font-bold' : 'text-slate-500 hover:text-white'}`}>{tf}</button>
                          ))}
                      </div>
                      <div className="relative shrink-0">
                          <button 
                              onClick={() => setIsRangeOpen(!isRangeOpen)}
                              className="flex items-center justify-center gap-1.5 bg-[#121620] px-3 py-2 sm:py-1.5 rounded-lg border border-[#2a2f3a] text-xs sm:text-sm text-slate-300 hover:text-white transition-colors h-full"
                          >
                              <Filter className="w-3.5 h-3.5" />
                              <span>Top {scanLimit}</span>
                          </button>
                          {isRangeOpen && (
                              <div className="absolute top-full mt-1 right-0 sm:left-0 w-24 bg-[#121620] border border-[#2a2f3a] rounded-lg shadow-xl z-50 p-1 flex flex-col animate-in fade-in zoom-in-95 duration-100">
                                  {[50, 100, 150].map(limit => (
                                      <button 
                                          key={limit} 
                                          onClick={() => { setScanLimit(limit); setIsRangeOpen(false); }} 
                                          className={`px-3 py-2 text-left text-xs sm:text-sm rounded transition-all ${scanLimit === limit ? 'bg-blue-600/20 text-blue-400 font-bold' : 'text-slate-400 hover:bg-[#2a2f3a] hover:text-white'}`}
                                      >
                                          Top {limit}
                                      </button>
                                  ))}
                              </div>
                          )}
                      </div>
                      <button 
                        onClick={handleManualScan} 
                        disabled={isScanning}
                        className="bg-[#121620] p-2 sm:p-1.5 rounded-lg border border-[#2a2f3a] text-blue-400 hover:bg-[#2a2f3a] hover:text-blue-300 disabled:opacity-50 transition-colors flex items-center justify-center shrink-0"
                      >
                        <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isScanning ? 'animate-spin' : ''}`} />
                      </button>
                  </div>
              )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full lg:w-auto">
              {isScanning && <div className="text-xs text-blue-400 flex items-center gap-2 justify-start sm:justify-end shrink-0"><RefreshCw className="w-3 h-3 animate-spin" /> SMC 深度掃描中 {scanProgress}%</div>}
              <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input type="text" placeholder="搜尋幣種..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border border-[#2a2f3a] rounded bg-[#1a1e27] text-white focus:border-blue-500 outline-none" /></div>
          </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {filtered.map(t => <CryptoMarketCard key={t.symbol} ticker={t} signalData={currentSignals[t.symbol]} onSelectCoin={(s) => window.location.hash = `#/crypto/trade/${s}`} />)}
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

function CryptoAssetsPage({ paperAccount, allTickers }) {
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
          const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${coin.symbol}&interval=${tf}&limit=120`);
          const data = await res.json();
          const parsed = data.map(d => ({ open: parseFloat(d[1]), high: parseFloat(d[2]), low: parseFloat(d[3]), close: parseFloat(d[4]), volume: parseFloat(d[5]), time: d[0] }));
          if (tf === '15m' && isMounted) {
              setKlines(parsed);
          }
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
      <button onClick={() => window.history.back()} className="flex items-center gap-1.5 text-slate-400 hover:text-white mb-4 text-sm bg-[#121620] px-3 py-1.5 rounded border border-[#2a2f3a]"><ArrowLeft className="w-4 h-4" /> 返回市場</button>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-[#121620] p-5 rounded-xl border border-[#2a2f3a] shadow-lg">
            <h2 className="text-3xl font-black text-white">{coin.symbol.replace('USDT','')} <span className="text-sm font-normal text-slate-500">USDT</span></h2>
            <div className="text-3xl font-mono font-bold text-white mt-2">${formatPrice(currentPrice)}</div>
          </div>
          <div className="bg-[#121620] rounded-xl border border-[#2a2f3a] p-5 shadow-lg"><CryptoTradeForm symbol={coin.symbol} currentPrice={currentPrice} balance={paperAccount.balance} onOpenPosition={openPosition} /></div>
          
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
          <div className="bg-[#121620] rounded-xl p-1 border border-[#2a2f3a] shadow-lg"><CryptoAdvancedKLineChart klines={klines} signalData={multiSignals['15m']} /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paperAccount.positions.filter(p => p.symbol === coin.symbol).map(pos => <CryptoPositionCard key={pos.id} pos={pos} currentPrice={currentPrice} balance={paperAccount.balance} onClose={() => closePosition(pos.id, currentPrice)} onAdjust={(t,v) => adjustPosition(pos.id,t,v,currentPrice)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 主應用程式入口與 Router 管理
// ==========================================
export default function App() {
  const [isStylesLoaded, setIsStylesLoaded] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  const [currentRoute, setCurrentRoute] = useState('portal');
  
  // Crypto State
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

  // 獨立抓取幣安資料 (僅在需要時)
  const fetchCryptoMarkets = async () => {
    try {
      const [tRes, fRes] = await Promise.all([fetch('https://fapi.binance.com/fapi/v1/ticker/24hr'), fetch('https://fapi.binance.com/fapi/v1/premiumIndex')]);
      const tData = await tRes.json(); const fData = await fRes.json();
      setAllTickers(tData.filter(t => t.symbol.endsWith('USDT')).sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)));
      const frMap = {}; fData.forEach(i => { frMap[i.symbol] = i.lastFundingRate; }); setFundingRates(frMap);
    } catch(e) {} finally { setLoadingCrypto(false); }
  };

  useEffect(() => { 
      fetchCryptoMarkets(); 
      const i = setInterval(fetchCryptoMarkets, 8000); 
      return () => clearInterval(i); 
  }, []);

  // 路由管理
  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace('#/', '');
      if (!h || h === 'portal') { setCurrentRoute('portal'); setSelectedCoin(null); }
      else if (h === 'tw-stocks') { setCurrentRoute('tw_stocks'); setSelectedCoin(null); }
      else if (h === 'news') { setCurrentRoute('news'); setSelectedCoin(null); }
      else if (h === 'crypto/home') { setCurrentRoute('crypto_home'); setSelectedCoin(null); }
      else if (h === 'crypto/positions') { setCurrentRoute('crypto_positions'); setSelectedCoin(null); }
      else if (h === 'crypto/assets') { setCurrentRoute('crypto_assets'); setSelectedCoin(null); }
      else if (h.startsWith('crypto/trade/')) {
          const s = h.replace('crypto/trade/', '');
          const c = allTickers.find(t => t.symbol === s);
          if (c) { setSelectedCoin(c); setCurrentRoute('crypto_trade'); }
      }
    };
    handleHash(); window.addEventListener('hashchange', handleHash); return () => window.removeEventListener('hashchange', handleHash);
  }, [allTickers]);

  // 模擬交易方法
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

  const isCryptoRoute = currentRoute.startsWith('crypto');

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 font-sans selection:bg-blue-500/30 pb-10">
      {/* 全域導覽列 */}
      <header className="bg-[#121620]/95 backdrop-blur border-b border-[#2a2f3a] sticky top-0 z-20 h-16 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 h-full flex justify-between items-center relative">
          
          <div className="flex items-center gap-4 sm:gap-6">
            <button className="sm:hidden text-slate-300 hover:text-white" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}><Menu className="w-6 h-6" /></button>
            <div className="flex items-center gap-2 text-blue-500 cursor-pointer" onClick={() => window.location.hash = '#/portal'}>
                <Globe className="w-6 h-6 text-blue-400" />
                <h1 className="text-xl font-bold text-white tracking-tighter hidden sm:block">SMC <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">PRO MAX</span></h1>
            </div>
            
            {/* 子系統專屬導覽 (虛擬貨幣) */}
            {isCryptoRoute && (
                <nav className="hidden sm:flex gap-1 text-sm font-bold ml-4 border-l border-[#2a2f3a] pl-4">
                  <button onClick={() => window.location.hash = '#/crypto/home'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'crypto_home' || currentRoute === 'crypto_trade' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>加密市場</button>
                  <button onClick={() => window.location.hash = '#/crypto/positions'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'crypto_positions' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>持倉 {paperAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full ml-1">{paperAccount.positions.length}</span>}</button>
                  <button onClick={() => window.location.hash = '#/crypto/assets'} className={`px-4 py-2 rounded-lg transition-all ${currentRoute === 'crypto_assets' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>資產帳戶</button>
                </nav>
            )}

            {/* 非首頁但非加密貨幣的返回鈕 */}
            {!isCryptoRoute && currentRoute !== 'portal' && (
                <nav className="hidden sm:flex gap-1 text-sm font-bold ml-4 border-l border-[#2a2f3a] pl-4">
                  <button onClick={() => window.location.hash = '#/portal'} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-slate-400 hover:bg-[#2a2f3a] hover:text-white transition-all"><ArrowLeft className="w-4 h-4"/> 返回入口</button>
                </nav>
            )}
          </div>
          
          {/* 右側資訊 (虛擬貨幣時顯示資產，其他時候顯示系統標籤) */}
          {isCryptoRoute ? (
             <div className="bg-[#1a1e27] px-3 sm:px-4 py-1.5 sm:py-2 rounded border border-[#2a2f3a] flex items-center gap-2 sm:gap-3"><Wallet className="w-4 h-4 text-blue-400" /><span className="text-sm font-mono text-white font-bold">${paperAccount.balance.toFixed(2)}</span></div>
          ) : currentRoute !== 'portal' ? (
             <div className="text-xs font-bold px-3 py-1.5 bg-[#2a2f3a] rounded text-slate-300">{currentRoute === 'tw_stocks' ? '台股分析系統' : '熱點新聞中心'}</div>
          ) : null}
        </div>

        {/* 手機版選單 */}
        {isMobileMenuOpen && (
          <div className="sm:hidden absolute top-16 left-0 w-full bg-[#121620] border-b border-[#2a2f3a] shadow-xl flex flex-col p-4 gap-2 z-50">
             <div className="text-xs text-slate-500 mb-1 font-bold">主系統</div>
             <button onClick={() => { window.location.hash = '#/portal'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'portal' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>首頁入口</button>
             <button onClick={() => { window.location.hash = '#/tw-stocks'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'tw_stocks' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>台灣股市行情</button>
             <button onClick={() => { window.location.hash = '#/news'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'news' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>熱點新聞</button>
             
             {isCryptoRoute && (
                <>
                 <div className="text-xs text-slate-500 mt-2 mb-1 font-bold border-t border-[#2a2f3a] pt-2">加密貨幣子系統</div>
                 <button onClick={() => { window.location.hash = '#/crypto/home'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'crypto_home' || currentRoute === 'crypto_trade' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>加密市場</button>
                 <button onClick={() => { window.location.hash = '#/crypto/positions'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all flex items-center justify-between ${currentRoute === 'crypto_positions' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>持倉與管理 {paperAccount.positions.length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{paperAccount.positions.length}</span>}</button>
                 <button onClick={() => { window.location.hash = '#/crypto/assets'; setIsMobileMenuOpen(false); }} className={`px-4 py-3 rounded-lg text-left font-bold transition-all ${currentRoute === 'crypto_assets' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}>資產帳戶</button>
                </>
             )}
          </div>
        )}
      </header>
      
      {/* 系統主要內容渲染區塊 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {currentRoute === 'portal' && <PortalPage />}
        {currentRoute === 'tw_stocks' && <TwStocksDashboard />}
        {currentRoute === 'news' && <NewsDashboard />}
        
        {/* 以下為保留的加密貨幣子系統元件 */}
        {currentRoute === 'crypto_home' && <CryptoDashboard allTickers={allTickers} fundingRates={fundingRates} loading={loadingCrypto} dashState={dashState} setDashState={setDashState} />}
        {currentRoute === 'crypto_positions' && <CryptoPositionsPage allTickers={allTickers} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
        {currentRoute === 'crypto_assets' && <CryptoAssetsPage allTickers={allTickers} paperAccount={paperAccount} />}
        {currentRoute === 'crypto_trade' && selectedCoin && <CryptoTradingWorkspace coin={selectedCoin} fundingRate={fundingRates[selectedCoin.symbol]} paperAccount={paperAccount} openPosition={openPosition} closePosition={closePosition} adjustPosition={adjustPosition} />}
      </main>
    </div>
  );
}
