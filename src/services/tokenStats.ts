import { handleApiError } from '../utils/errorHandling';

const CRYPTOCOMPARE_API_URL = 'https://min-api.cryptocompare.com/data/pricemultifull';

interface TokenStatsResponse {
  marketCap: number;
  volume24h: number;
}

export async function getTokenStats(cryptoId: string, currency: string): Promise<TokenStatsResponse> {
  try {
    const response = await fetch(
      `${CRYPTOCOMPARE_API_URL}?fsyms=${cryptoId}&tsyms=${currency}`
    );

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const tokenData = data.RAW[cryptoId][currency];

    return {
      marketCap: tokenData.MKTCAP,
      volume24h: tokenData.VOLUME24HOUR
    };
  } catch (error) {
    handleApiError(error);
    throw error;
  }
} 