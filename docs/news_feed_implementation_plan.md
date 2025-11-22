# 🚀 News Feed Upgrade Implementation Plan

**Date:** November 22, 2025
**Objective:** Transform the CryptoVertX news feed into a premium, noise-free, and intelligent market intelligence tool using the "best of the best" free technologies available.

## 1. Executive Summary

The current news implementation relies on a few RSS feeds and basic parsing. To elevate this to a "Pro" level without incurring API costs, we will implement a **Local Intelligence Engine** within the Electron main process. This engine will aggregate data from a wider range of high-quality sources, intelligently deduplicate stories to reduce noise, and apply local sentiment analysis to give users immediate market signals.

## 2. Core Features

### 2.1 Expanded Source Network
We will expand our RSS ingestion to include top-tier crypto journalism, ensuring diverse and reliable coverage.
*   **CoinDesk** (Existing)
*   **Cointelegraph** (New)
*   **The Block** (New)
*   **Decrypt** (Existing)
*   **CryptoSlate** (Existing)
*   **U.Today** (New)
*   **Bitcoin.com** (Existing)
*   **Daily Hodl** (New)
*   **BeInCrypto** (New)

### 2.2 Intelligent Deduplication Engine
*   **Problem:** Multiple sources report the same breaking news (e.g., "Bitcoin hits $100k"), cluttering the feed.
*   **Solution:** Implement a **Fuzzy Matching Algorithm** (using Jaccard similarity or Levenshtein distance) to group similar articles.
*   **UX:** Display the primary article (best image/summary) and add a "Also reported by: Source A, Source B" footer.

### 2.3 Local Sentiment AI
*   **Technology:** Use the `sentiment` library (AFINN-165 based) for lightweight, offline text analysis.
*   **Function:** Analyze headlines and summaries to calculate a sentiment score (-5 to +5).
*   **UX:** Display "Bullish" (Green), "Bearish" (Red), or "Neutral" (Gray) badges on news cards.

### 2.4 Smart Categorization
*   **Logic:** Keyword-based auto-tagging.
*   **Categories:**
    *   🏛️ **Regulation** (SEC, law, court, ban, tax)
    *   📈 **Market** (price, rally, crash, bull, bear, ath)
    *   💻 **Tech** (upgrade, fork, mainnet, developer, bug)
    *   🏦 **DeFi** (dex, yield, swap, liquidity, tvl)
    *   🛡️ **Security** (hack, exploit, scam, phishing)
    *   🎨 **NFT/Gaming** (nft, metaverse, gaming, play-to-earn)

## 3. Technical Implementation

### 3.1 Dependencies
We will add the following lightweight, zero-cost libraries:
*   `sentiment`: For local sentiment analysis.
*   `string-similarity`: For title deduplication logic.

### 3.2 Backend Architecture (`src/electron/main.ts`)

The `fetch-news-data` IPC handler will be upgraded to a multi-stage pipeline:

1.  **Fetch Stage**: Parallel fetch of all RSS feeds.
2.  **Parse Stage**: Use `feedparser` + `html-to-text` (existing robust pipeline) to extract clean data.
3.  **Enrichment Stage**:
    *   Run `sentiment.analyze(title + summary)` to get score.
    *   Run `tagger(title + summary)` to assign categories.
4.  **Deduplication Stage**:
    *   Compare new articles against the list.
    *   If similarity > 0.6 (configurable), merge into existing entry.
5.  **Return**: Send enriched, unique articles to Renderer.

### 3.3 Frontend Architecture (`src/services/newsService.ts`)

*   **Interface Update**:
    ```typescript
    export interface NewsArticle {
      // ... existing fields
      sentiment: 'positive' | 'negative' | 'neutral';
      sentimentScore: number;
      categories: string[];
      relatedSources: string[]; // For deduplicated attributions
    }
    ```

### 3.4 UI/UX (`src/pages/NewsPage.tsx` & `NewsCard.tsx`)

*   **News Card**:
    *   Add **Sentiment Badge** (top right).
    *   Add **Category Tags** (below title).
    *   Add **"Also reported by..."** section in footer if applicable.
*   **News Page**:
    *   Add **Category Filters** (Pills: "All", "Regulation", "DeFi", etc.).
    *   Add **Sort Options** ("Latest", "Most Bullish", "Most Bearish").

## 4. Verification Strategy

1.  **Unit Testing**: Create a script to fetch and process feeds, printing the sentiment scores and tags to console to verify accuracy.
2.  **Visual Testing**:
    *   Verify "Bullish" tag appears on positive news.
    *   Verify "Regulation" tag appears on SEC-related news.
    *   Verify no duplicate headlines appear side-by-side.

## 5. Timeline
1.  **Setup**: Install dependencies.
2.  **Backend**: Implement fetching, enrichment, and deduplication logic.
3.  **Frontend**: Update types and UI components.
4.  **Polish**: Fine-tune thresholds for sentiment and deduplication.
