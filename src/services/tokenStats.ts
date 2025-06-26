import { fetchCoinMarkets, fetchCoinMarketChart } from './crypto/cryptoApiService';
import { RequestPriority } from './crypto/cryptoApiService';

export interface TokenStatsData {
  marketCap: number;
  volume24h: number;
  fdv: number;
  circulatingSupply: number;
  totalSupply: number;
  maxSupply: number | null;
  ath: number;
  atl: number;
  athDate: string;
  atlDate: string;
  low24h: number;
  high24h: number;
  low7d: number;
  high7d: number;
  dataSource: 'coingecko' | 'cryptocompare';
  hasFullData: boolean;
}

export const getTokenStats = async (
  id: string,
  currency: string
): Promise<TokenStatsData> => {
  try {
    // Fetch market data and 7-day chart data in parallel
    const [marketDataResponse, chartDataResponse] = await Promise.all([
      fetchCoinMarkets([id], currency, RequestPriority.HIGH),
      fetchCoinMarketChart(id, currency, 7, RequestPriority.HIGH)
    ]);

    if (!marketDataResponse || marketDataResponse.length === 0) {
      throw new Error(`No data returned from CoinGecko for ID ${id}`);
    }

    const tokenData = marketDataResponse[0];

    // Calculate 7-day low and high
    let low7d = 0;
    let high7d = 0;
    if (chartDataResponse && chartDataResponse.prices) {
      const prices7d = chartDataResponse.prices.map((p: number[]) => p[1]);
      low7d = Math.min(...prices7d);
      high7d = Math.max(...prices7d);
    }

    // Check for essential data points to determine if we have full data
    const hasFullData = 
        tokenData.market_cap != null &&
        tokenData.total_volume != null &&
        tokenData.fully_diluted_valuation != null;

    return {
      marketCap: tokenData.market_cap ?? 0,
      volume24h: tokenData.total_volume ?? 0,
      fdv: tokenData.fully_diluted_valuation ?? 0,
      circulatingSupply: tokenData.circulating_supply ?? 0,
      totalSupply: tokenData.total_supply ?? 0,
      maxSupply: tokenData.max_supply ?? null,
      ath: tokenData.ath ?? 0,
      atl: tokenData.atl ?? 0,
      athDate: tokenData.ath_date ?? '',
      atlDate: tokenData.atl_date ?? '',
      low24h: tokenData.low_24h ?? 0,
      high24h: tokenData.high_24h ?? 0,
      low7d,
      high7d,
      dataSource: 'coingecko',
      hasFullData,
    };
  } catch (error) {
    console.error(`Failed to get token stats for ${id}:`, error);
    // In case of an error, re-throw it to be handled by the calling component's try-catch block
    throw error;
  }
}; 