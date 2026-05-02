# Project Instructions - Crypto App

## Technical Architecture
- **Frontend**: React (TypeScript/JSX) with Tailwind CSS.
- **Backend**: Vercel Serverless Functions (located in `/api`).
- **Data Sources**: Yahoo Finance (scraped via `/api/binance?action=...`).

## Analysis Standards
### 1. Trading Volume Rules (成交量口訣)
When analyzing stock or crypto trends, always consider the relationship between volume and price movement:

| 量價關係 | 口訣 | 解讀 |
| :--- | :--- | :--- |
| **量增價升** | 一定進場 | 買盤積極，上漲動能強勁 |
| **量增價平** | 高位走人 | 高檔爆量不漲，主力可能出貨 |
| **量增價跌** | 走為上策 | 賣壓大舉出籠，後市極可能續跌 |
| **量平價升** | 低位不跟 | 無量上漲，虛漲誘多風險大 |
| **量平價穩** | 一定盤整 | 買賣力道均衡 |
| **量平價平** | 破位走人 | 跌破關鍵支撐應停損 |
| **量平價跌** | 還要下跌 | 缺乏買盤承接 |
| **量減價升** | 提高警惕 | 量價背離，隨時可能反轉 |
| **量減價平** | 不破不立 | 等待跌破重要支撐後的生機 |
| **量減價跌** | 天天要跌 | 無量陰跌，市場如死水 |
| **底部縮量** | 可能上漲 | 籌碼沉澱，醞釀反彈 |

### 2. Implementation
- Use the `analyzeVolumePrice` function in `src/App.jsx` to automate this analysis.
- Display these insights in the stock detail workspace.
