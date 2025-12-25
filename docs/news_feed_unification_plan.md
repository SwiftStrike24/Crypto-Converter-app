# 🎯 News Feed Unification Plan (v2.6.0)

**Date:** December 24, 2025
**Goal:** Streamline the user experience by merging the "Fundraising" and "Market" news tabs into a single unified "Market" feed with intelligent filtering.

## User Review Required

> [!IMPORTANT]
> **Unified Stream**: By default, the "Market" tab will now show BOTH general market news and fundraising news in one chronological list. 
> **Category Filter**: A new "Fundraising" category pill will be added to the Market tab filters, allowing users to isolate investment news if desired.

## Proposed Changes

### 1. State Management: `src/context/NewsContext.tsx`
- **Article Enrichement**: When fetching fundraising news, automatically inject the `"Fundraising"` category into the `categories` array for each article.
- This ensures that the existing category filtering system treats fundraising news as its own distinct category.

### 2. UI Layout: `src/pages/NewsPage.tsx`
- **Tab Removal**: Delete the "Fundraising" tab button from the main navigation menu.
- **Unified Memo**: Update the `displayedNews` memo logic:
  - If `activeTab === 'market'`, merge `marketNews` and `fundraisingNews` into a single array.
  - Sort the combined array by `publishedAt` (newest first).
- **Category Expansion**: Add `"Fundraising"` to the list of categories displayed as filter pills in the Market tab.

### 3. Visual Styling: `src/components/NewsCard.tsx`
- **Dynamic Tags**: Ensure that when a fundraising article appears in the market feed, its specialized tags (💰 Amount, 🌱 Stage, 🏆 Lead Investor) remain visually distinct and high-priority.
- (Current implementation already supports this, so only verification is needed).

## Best Practices & Modern Patterns (2025)
- **Lazy Merging**: Merging data streams in the memoization layer (`useMemo`) instead of deep state ensures the app stays responsive even with hundreds of articles.
- **Contextual Categorization**: Using categorization instead of tabs follows current trends in "Deep Intelligence" dashboards, where users prefer filters over rigid tab structures.
- **Deduplication Alignment**: The aggressive deduplication logic from v2.5.1 will automatically handle any edge cases where a story is reported as both a high-impact market event and a fundraising event.

## Verification Plan

### Manual Verification
1. **Initial Load**: Verify the "Fundraising" tab is gone.
2. **Unified Feed**: Scroll the "Market" tab and verify both general news (CoinDesk, etc.) and fundraising news (The Block, etc.) appear together.
3. **Filtering**: 
   - Select the "Fundraising" filter pill. Verify only articles with investment tags appear.
   - Select "Market" or "DeFi" pills. Verify articles are filtered correctly.
4. **Sorting**: Sort by "Most Bullish". Verify high-sentiment articles from both types rise to the top.
