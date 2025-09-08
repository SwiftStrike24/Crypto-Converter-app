export type ChainTag = 'SOL' | 'ETH' | 'SUI' | 'ETH_L2s';

export interface FundraisingSource {
  name: string;
  url: string;
  type?: 'rss' | 'nitter';
}

// Primary fundraising-related keywords for detection (case-insensitive)
export const FUNDRAISING_KEYWORDS: readonly string[] = [
  'raised',
  'raises',
  'raising',
  'funding round',
  'seed round',
  'pre-seed',
  'series a',
  'series b',
  'series c',
  'venture round',
  'investment',
  'lead investor',
  'led by',
  'backed by',
  'strategic investment',
  'grant',
  'ecosystem fund',
  'private round',
  'public sale',
  'ido',
  'ieo',
  'ico',
];

// Negative keywords to reduce false positives
export const NEGATIVE_KEYWORDS: readonly string[] = [
  'price analysis',
  'market recap',
  'opinion',
  'editorial',
  'how to',
  'tutorial',
  'guide',
  'price prediction',
  'meme',
  'rumor',
];

// Prominent investor and fund names to boost confidence (lowercased)
export const INVESTOR_KEYWORDS: readonly string[] = [
  'a16z', 'a16z crypto', 'andreessen horowitz', 'paradigm', 'binance labs', 'coinbase ventures',
  'electric capital', 'coinfund', 'multicoin', 'multicoin capital', 'polychain', 'pantera', 'hashed',
  'dragonfly', 'sequoia', 'jump crypto', 'animoca', 'animoca brands', 'framework', 'placeholder vc',
  'draper', 'alameda research', 'three arrows capital', 'delphi digital', 'wintermute', 'galaxy digital',
];

// Chain keyword atlas
export const CHAIN_KEYWORDS: Readonly<Record<ChainTag, readonly string[]>> = {
  SOL: [
    'solana', ' sol ', '$sol', 'spl token', 'raydium', 'orca', 'jupiter', 'pyth', 'jito', 'helium', 'marinade',
  ],
  ETH: [
    'ethereum', ' eth ', '$eth', 'erc-20', 'erc20', 'erc-721', 'erc-1155', 'l1 ethereum', 'mainnet ethereum',
    'uniswap', 'aave', 'makerdao', 'compound', 'curve finance', 'yearn', 'ens',
  ],
  SUI: [
    'sui', ' sui ', '$sui', 'move language', 'sui foundation', 'sui network',
  ],
  ETH_L2s: [
    // Named L2s and related signals
    'arbitrum', 'optimism', 'op mainnet', 'base', 'zksync', 'starknet', 'polygon zkevm', 'linea', 'scroll', 'taiko',
    'mantle', 'boba', 'metis', 'fuel', 'mode network', 'blast l2', 'zora network', 'world chain', 'kroma',
    'layer 2', 'l2', 'rollup', 'optimistic rollup', 'zk rollup',
  ],
};

// Project-to-chain mapping to improve attribution
export const PROJECT_CHAIN_MAP: Readonly<Record<string, ChainTag>> = {
  // Solana
  'jupiter': 'SOL',
  'pyth': 'SOL',
  'jito': 'SOL',
  'raydium': 'SOL',
  'orca': 'SOL',
  'marinade': 'SOL',
  // Ethereum L1
  'uniswap': 'ETH',
  'aave': 'ETH',
  'makerdao': 'ETH',
  'compound': 'ETH',
  'curve': 'ETH',
  'ens': 'ETH',
  // Sui
  'sui foundation': 'SUI',
  'sui network': 'SUI',
  // L2 projects or the L2s themselves
  'arbitrum': 'ETH_L2s',
  'optimism': 'ETH_L2s',
  'op mainnet': 'ETH_L2s',
  'base': 'ETH_L2s',
  'zksync': 'ETH_L2s',
  'starknet': 'ETH_L2s',
  'polygon zkevm': 'ETH_L2s',
  'linea': 'ETH_L2s',
  'scroll': 'ETH_L2s',
  'taiko': 'ETH_L2s',
  'mantle': 'ETH_L2s',
  'mode': 'ETH_L2s',
  'blast': 'ETH_L2s',
  'zora': 'ETH_L2s',
  'world chain': 'ETH_L2s',
  'kroma': 'ETH_L2s',
};

// Tokenless chains/projects list (best-effort, updated over time)
export const TOKENLESS_NAMES: ReadonlySet<string> = new Set<string>([
  // As of 2025, commonly known tokenless or non-token L2s/projects (subject to change)
  'base',
  'linea',
  'scroll',
  'taiko',
  // Add more as needed via update scripts
]);

// Known public Nitter instances to use as fallbacks when one is down
export const NITTER_HOSTS: readonly string[] = [
  'nitter.net',
  'nitter.poast.org',
  'nitter.moomoo.me',
  'nitter.fdn.fr',
  'nitter.mint.lgbt',
];

// Curated fundraising-oriented sources (RSS + Nitter for VC accounts)
export const FUNDRAISING_SOURCES: readonly FundraisingSource[] = [
  // Broad crypto news (filtered by keywords)
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', type: 'rss' },
  { name: 'Decrypt', url: 'https://decrypt.co/feed', type: 'rss' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/', type: 'rss' },
  { name: 'Bitcoin.com', url: 'https://news.bitcoin.com/feed/', type: 'rss' },
  { name: 'The Defiant', url: 'https://thedefiant.io/feed', type: 'rss' },
  // Airdrops trackers (to correlate post-funding user incentives)
  { name: 'Airdrops.io', url: 'https://airdrops.io/feed/', type: 'rss' },
  // VC/Investor updates via Nitter (free RSS bridge; availability may vary)
  { name: 'a16z crypto (X)', url: 'https://nitter.net/a16zcrypto/rss', type: 'nitter' },
  { name: 'Paradigm (X)', url: 'https://nitter.net/paradigm/rss', type: 'nitter' },
  { name: 'Binance Labs (X)', url: 'https://nitter.net/BinanceLabs/rss', type: 'nitter' },
  { name: 'Electric Capital (X)', url: 'https://nitter.net/electriccapital/rss', type: 'nitter' },
  { name: 'CoinFund (X)', url: 'https://nitter.net/coinfund_io/rss', type: 'nitter' },
  { name: 'Multicoin (X)', url: 'https://nitter.net/multicoincap/rss', type: 'nitter' },
];

export function normalizeText(input: string | undefined | null): string {
  return (input || '').replace(/\s+/g, ' ').trim();
}

export function containsAny(haystack: string, needles: readonly string[]): boolean {
  const lowerHaystack = haystack.toLowerCase();
  return needles.some((needle) => lowerHaystack.includes(needle));
}

export function detectFundingStage(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('pre-seed')) return 'Pre-Seed';
  if (lower.includes('seed')) return 'Seed';
  if (lower.includes('series a')) return 'Series A';
  if (lower.includes('series b')) return 'Series B';
  if (lower.includes('series c')) return 'Series C';
  if (lower.includes('grant')) return 'Grant';
  if (lower.includes('private round')) return 'Private';
  if (lower.includes('public sale') || lower.includes('ido') || lower.includes('ieo') || lower.includes('ico')) return 'Public';
  return undefined;
}

export function tagChains(text: string): { chains: ChainTag[]; tokenless: boolean } {
  const lower = text.toLowerCase();
  const chainSet = new Set<ChainTag>();

  // Direct chain keyword detection
  (Object.keys(CHAIN_KEYWORDS) as ChainTag[]).forEach((chain) => {
    const keywords = CHAIN_KEYWORDS[chain];
    if (containsAny(lower, keywords)) {
      chainSet.add(chain);
    }
  });

  // Project mapping detection
  Object.entries(PROJECT_CHAIN_MAP).forEach(([project, chain]) => {
    if (lower.includes(project)) {
      chainSet.add(chain);
    }
  });

  // Tokenless inference if any matched tokenless names present
  const tokenless = Array.from(TOKENLESS_NAMES).some((name) => lower.includes(name));

  return { chains: Array.from(chainSet), tokenless };
}

// Extract a readable funding amount text if present (e.g., "$15M", "15 million")
export function extractFundingAmount(text: string): string | undefined {
  const t = text;
  // $15M, $15.5M, $120k, $1B
  const moneySymbol = /\$\s?\d{1,3}(?:[,.]\d{3})*(?:\.\d+)?\s?(?:[KkMmBb])?/g;
  const longForm = /\b\d+(?:\.\d+)?\s?(?:million|billion|thousand)\b/i;
  const m1 = t.match(moneySymbol);
  if (m1 && m1.length > 0) return m1[0];
  const m2 = t.match(longForm);
  if (m2 && m2.length > 0) return m2[0];
  return undefined;
}

// Identify notable investors mentioned
export function findInvestors(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  INVESTOR_KEYWORDS.forEach((inv) => {
    if (lower.includes(inv)) {
      // Simple canonicalization: title case first token(s)
      const canonical = inv.split(' ').map(s => s.length > 2 ? s[0].toUpperCase() + s.slice(1) : s.toUpperCase()).join(' ');
      found.add(canonical);
    }
  });
  return Array.from(found);
}
