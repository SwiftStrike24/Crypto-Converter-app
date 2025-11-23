
import * as fs from 'fs';
import * as path from 'path';
const Sentiment = require('sentiment');
const stringSimilarity = require('string-similarity');

const outputFile = path.join(__dirname, 'test-results.txt');
const sentiment = new Sentiment();

// Clear previous results
fs.writeFileSync(outputFile, '');

function log(message: string) {
    fs.appendFileSync(outputFile, (message || '') + '\n');
    console.log(message);
}

// --- Mock Data & Config ---

const NEWS_CATEGORIES: Record<string, string[]> = {
    'Regulation': ['sec', 'regulation', 'law', 'court', 'ban', 'tax', 'legal', 'compliance', 'gensler', 'senate', 'congress', 'approval', 'sue', 'lawsuit', 'settlement'],
    'Market': ['price', 'rally', 'crash', 'bull', 'bear', 'ath', 'market', 'trading', 'analysis', 'forecast', 'prediction', 'etf', 'volume', 'liquidity', 'launch', 'listing'],
    'Tech': ['upgrade', 'fork', 'mainnet', 'developer', 'bug', 'vulnerability', 'protocol', 'consensus', 'node', 'hashrate', 'difficulty'],
    'DeFi': ['dex', 'yield', 'swap', 'liquidity', 'tvl', 'farming', 'staking', 'lending', 'borrowing', 'curve', 'uniswap', 'aave', 'maker', 'compound'],
    'Security': ['hack', 'exploit', 'scam', 'phishing', 'stolen', 'attack', 'breach', 'security', 'audit', 'vulnerability', 'drain'],
    'NFT/Gaming': ['nft', 'metaverse', 'gaming', 'play-to-earn', 'gamefi', 'collection', 'mint', 'avatar', 'opensea', 'blur'],
};

// --- Helper Functions (Copied from main.ts) ---

function analyzeSentiment(text: string) {
    const result = sentiment.analyze(text);
    let label = 'neutral';
    if (result.score >= 2) label = 'positive';
    else if (result.score <= -2) label = 'negative';
    return { score: result.score, label };
}

function tagArticle(text: string) {
    const lowerText = text.toLowerCase();
    const tags: string[] = [];

    for (const [category, keywords] of Object.entries(NEWS_CATEGORIES)) {
        if (keywords.some(keyword => lowerText.includes(keyword))) {
            tags.push(category);
        }
    }
    return tags;
}

// --- Test Cases ---

interface Article {
    title: string;
    summary: string;
    source: string;
    url: string;
    publishedAt: string;
    sentiment?: string;
    sentimentScore?: number;
    categories?: string[];
    relatedSources?: string[];
}

const articles: Article[] = [
    {
        title: "Bitcoin Hits New ATH as Market Rallies",
        summary: "Bitcoin price surges to $100k amidst massive bull run.",
        source: "CoinDesk",
        url: "https://coindesk.com/btc-ath",
        publishedAt: new Date().toISOString()
    },
    {
        title: "SEC Sues Another Crypto Exchange",
        summary: "The SEC has filed a lawsuit claiming unregistered securities.",
        source: "The Block",
        url: "https://theblock.co/sec-lawsuit",
        publishedAt: new Date(Date.now() - 1000).toISOString() // Slightly older
    },
    {
        title: "Bitcoin Reaches All-Time High",
        summary: "BTC price is skyrocketing.",
        source: "Decrypt",
        url: "https://decrypt.co/btc-high", // Different URL, similar content
        publishedAt: new Date(Date.now() - 2000).toISOString() // Even older
    },
    {
        title: "New DeFi Protocol Exploit Drains $10M",
        summary: "A vulnerability in the smart contract allowed hackers to steal funds.",
        source: "CryptoSlate",
        url: "https://cryptoslate.com/defi-hack",
        publishedAt: new Date().toISOString()
    },
    {
        title: "BlackRock Spot Bitcoin ETF Launch Imminent",
        summary: "The SEC is expected to approve the ETF listing soon.",
        source: "Bloomberg",
        url: "https://bloomberg.com/etf-launch",
        publishedAt: new Date().toISOString()
    }
];

// --- Execution ---

try {
    log("--- Starting News Logic Test ---\n");

    // 1. Enrichment (Sentiment & Categorization)
    const enrichedArticles: Article[] = articles.map(article => {
        const combinedText = `${article.title} ${article.summary}`;
        const sentimentResult = analyzeSentiment(combinedText);
        const categories = tagArticle(combinedText);

        return {
            ...article,
            sentiment: sentimentResult.label,
            sentimentScore: sentimentResult.score,
            categories: categories,
            relatedSources: []
        };
    });

    log("--- Enrichment Results ---");
    enrichedArticles.forEach(a => {
        log(`Title: ${a.title}`);
        log(`Sentiment: ${a.sentiment} (${a.sentimentScore})`);
        log(`Categories: ${a.categories?.join(', ')}`);
        log('---');
    });

    // 2. Deduplication
    log("\n--- Deduplication Test ---");

    // Sort by date descending (newest first)
    enrichedArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const uniqueArticles: Article[] = [];
    const seenUrls = new Set<string>();

    for (const article of enrichedArticles) {
        // Exact URL check
        if (seenUrls.has(article.url)) continue;

        // Fuzzy Title Match
        const duplicate = uniqueArticles.find(existing => {
            const similarity = stringSimilarity.compareTwoStrings(article.title, existing.title);
            return similarity > 0.4; // Using 0.4 threshold for this test case
        });

        if (duplicate) {
            log(`Duplicate found: "${article.title}" is similar to "${duplicate.title}"`);
            if (duplicate.relatedSources) {
                duplicate.relatedSources.push(article.source);
            }
            seenUrls.add(article.url);
        } else {
            uniqueArticles.push(article);
            seenUrls.add(article.url);
        }
    }

    log(`\nTotal Articles: ${articles.length}`);
    log(`Unique Articles: ${uniqueArticles.length}`);

    log("\n--- Final Unique Articles ---");
    uniqueArticles.forEach(a => {
        log(`[${a.source}] ${a.title}`);
        if (a.relatedSources && a.relatedSources.length > 0) {
            log(`   Also reported by: ${a.relatedSources.join(', ')}`);
        }
    });

} catch (error: unknown) {
    if (error instanceof Error) {
        log(`\nERROR: ${error.message}`);
        if (error.stack) log(error.stack);
    } else {
        log(`\nERROR: Unknown error occurred`);
    }
}
