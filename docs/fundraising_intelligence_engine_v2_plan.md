# Implementation Plan - Fundraising Intelligence Engine v2

## Goal Description
Upgrade the "Fundraising Intelligence Engine" to be the most robust source of crypto venture capital news. This involves expanding the source network with high-quality feeds, implementing advanced extraction logic for funding amounts and investors, and refining the UI to highlight key deal metrics.

## User Review Required
> [!NOTE]
> This plan focuses on local processing to maintain privacy and performance. We will not use external LLM APIs, but instead rely on advanced regex and heuristic patterns (lightweight NLP) to extract structured data.

## Proposed Changes

### Backend Configuration (`src/electron/fundraisingConfig.ts`)

#### [MODIFY] `fundraisingConfig.ts`
- **Expand Sources**: Add new high-quality RSS feeds:
    - **The Block**: `https://www.theblock.co/rss/category/crypto-ecosystem/funding` (or general if specific fails)
    - **Cointelegraph**: `https://cointelegraph.com/rss/tag/fundraising`
    - **Blockworks**: `https://blockworks.co/feed` (will filter for funding keywords)
    - **DL News**: `https://www.dlnews.com/feed/rss/`
    - **Chainwire**: `https://chainwire.org/feed/` (Press releases, often has funding news)
- **Expand VC List**: Add more top-tier VCs to `INVESTOR_KEYWORDS` and Nitter sources:
    - **VCs**: Dragonfly, Framework, Pantera, Sequoia, Variant, 1kx.
- **Refine Keywords**: Add more specific deal terms to `FUNDRAISING_KEYWORDS`.

### Backend Logic (`src/services/fundraisingService.ts` & `src/electron/main.ts`)

#### [MODIFY] `fundraisingService.ts`
- **Enhanced Extraction**:
    - **`extractFundingAmount`**: Improve regex to catch "raised $X million", "$Xm round", etc.
    - **`extractValuation`**: New function to find "at a $X valuation" patterns.
    - **`extractLeadInvestor`**: Logic to specifically look for "led by [Investor]" patterns.
    - **`extractRoundType`**: Refine stage detection (Strategic, Bridge, Extension).

### UI Components (`src/components/NewsCard.tsx` & `src/pages/NewsPage.tsx`)

#### [MODIFY] `NewsCard.tsx`
- **Deal Badges**:
    - Display **Amount Raised** (e.g., "💰 $10M") as a prominent badge.
    - Display **Stage** (e.g., "🌱 Seed") as a badge.
    - Display **Lead Investor** (e.g., "🏆 Led by a16z") if detected.
- **Layout**: Adjust card layout to accommodate these new data points without clutter.

## Verification Plan

### Automated Tests
- Create `scripts/test-fundraising-logic.ts` (similar to the news logic test) to:
    - Fetch from new sources.
    - Test extraction logic against sample headlines (e.g., "Project X raises $10M led by Paradigm").
    - Verify that false positives are minimized.

### Manual Verification
- Run the app and check the "Fundraising" tab.
- Verify that new sources are appearing.
- Check that badges for Amount, Stage, and Investors are displaying correctly.
