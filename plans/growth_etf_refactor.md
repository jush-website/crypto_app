# Implementation Plan - Growth ETF & Stock Detail Refactoring

## 1. Growth ETF Analysis Page
- **New Component**: `TwGrowthEtfPage`
- **Featured ETFs**: 0050, 006208, 0052, 00935, 00922, 00923, 0056, 00878, 00919, 00981A.
- **Data Source**: Use existing `fetchQuoteQueue` and `analyzeVolumePrice` logic.
- **Analysis Logic**:
    - Fetch top 10 holdings for the selected ETF.
    - Run `analyzeVolumePrice` and technical score checks for each holding.
    - Aggregate scores to provide an "ETF Entry Confidence" rating.
- **UI**: Modern card-based layout for ETFs, and a detailed table for holdings analysis.

## 2. Stock Detail Page (TwStockWorkspace) Refactoring
- **New UI Pattern**: Tabbed navigation to solve long-page issues.
- **Tabs (5+)**:
    1.  **價量分析 (Price/Volume)**: Displays `volAnalysis` results and key price/volume stats.
    2.  **技術指標 (Indicators)**: `TwKLineChart`, trend recommendations, and indicator status (MA, BB, KD, MACD).
    3.  **籌碼總覽 (Chips)**: Institutional buy/sell, margin data, and `TwChipChart`.
    4.  **基本資料 (Fundamentals)**: PE, PB, Yield, and historical dividends.
    5.  **績效與新聞 (Performance/News)**: Trade form, personal entry calculator, and AI-sorted news.
- **Transition**: Smooth tab switching with state management.

## 3. Navigation & Routing Updates
- **New Route**: `#/tw-stocks/growth-etf`
- **Navigation**:
    - Add "成長 ETF" button to the Taiwan Stock market sub-nav.
    - Update hash change handler in `App.jsx`.

## 4. Technical Standards
- Adhere to `GEMINI.md` volume/price analysis rules.
- Maintain consistent dark-mode aesthetics (Tailwind CSS).
- Ensure mobile responsiveness for all new/refactored views.
