import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const CONSTANTS_FILE_PATH = path.resolve(__dirname, '../src/constants/cryptoConstants.ts');
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/coins/markets';
const NUMBER_OF_TOKENS_TO_FETCH = 25; // <-- Configurable: Change this value as needed

/**
 * Fetches the top cryptocurrency IDs from CoinGecko, ordered by market capitalization,
 * using a direct axios call.
 * The number of tokens fetched is determined by NUMBER_OF_TOKENS_TO_FETCH.
 */
async function fetchTopCoinGeckoIds(): Promise<string[]> {
  console.log(`Fetching data for top ${NUMBER_OF_TOKENS_TO_FETCH} tokens from CoinGecko API: ${COINGECKO_API_URL}...`);
  try {
    const response = await axios.get(COINGECKO_API_URL, {
      params: {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: NUMBER_OF_TOKENS_TO_FETCH,
        page: 1,
        sparkline: false,
      },
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' // Common User-Agent
      }
    });

    if (response.data && Array.isArray(response.data)) {
      const ids = response.data.map((coin: any) => coin.id);
      if (ids.length === 0) {
        console.warn('CoinGecko API returned 0 token IDs. The response data might be empty.');
      }
      return ids;
    } else {
      console.error('Unexpected response structure from CoinGecko API. Expected an array in data property.', response.data);
      throw new Error('Failed to fetch or parse top 100 coins due to unexpected API response structure.');
    }
  } catch (error: any) {
    console.error('Error fetching data from CoinGecko API:', error.message);
    if (error.response) {
      console.error('API Response Status:', error.response.status);
      console.error('API Response Data:', error.response.data);
    }
    // Check if the error data is HTML
    if (typeof error.response?.data === 'string' && error.response.data.trim().startsWith('<!DOCTYPE')) {
      console.error('The API returned an HTML page, which might indicate rate limiting, a CAPTCHA, or an error page.');
    }
    throw new Error('Failed to fetch top 100 coins from CoinGecko.');
  }
}

/**
 * Updates the POPULAR_TOKEN_IDS_TO_PRELOAD array in the cryptoConstants.ts file.
 * @param ids - An array of token IDs to write to the file.
 */
async function updateCryptoConstantsFile(ids: string[]): Promise<void> {
  try {
    let fileContent = fs.readFileSync(CONSTANTS_FILE_PATH, 'utf-8');
    const dateComment = `/* auto-generated on ${new Date().toISOString().split('T')[0]} */`;
    
    // Construct the new array string content
    const newArrayContent = `[\n    ${dateComment}\n    ${ids.map(id => `'${id}'`).join(',\n    ')},\n  ]`;

    // Regex to find and replace the POPULAR_TOKEN_IDS_TO_PRELOAD array
    // This regex handles potential existing comments or varied spacing within the array.
    const regex = /export const POPULAR_TOKEN_IDS_TO_PRELOAD = \[\s*[\s\S]*?\];/s;

    if (regex.test(fileContent)) {
      fileContent = fileContent.replace(regex, `export const POPULAR_TOKEN_IDS_TO_PRELOAD = ${newArrayContent};`);
    } else {
      console.error(`Could not find the 'POPULAR_TOKEN_IDS_TO_PRELOAD' array in ${CONSTANTS_FILE_PATH}.`);
      console.log("Please ensure the constant is defined similar to: export const POPULAR_TOKEN_IDS_TO_PRELOAD = [...];");
      throw new Error('Failed to update constants file: target array not found.');
    }

    fs.writeFileSync(CONSTANTS_FILE_PATH, fileContent, 'utf-8');
    console.log(`Successfully updated ${CONSTANTS_FILE_PATH} with ${ids.length} token IDs.`);
  } catch (error) {
    console.error(`Error updating ${CONSTANTS_FILE_PATH}:`, error);
    throw error; // Re-throw to be caught by the main execution block
  }
}

async function main() {
  console.log('Starting script to update POPULAR_TOKEN_IDS_TO_PRELOAD...');
  try {
    const topCoinIds = await fetchTopCoinGeckoIds();
    
    if (!topCoinIds || topCoinIds.length === 0) {
      console.warn("Fetched 0 token IDs. Aborting update. Please check the CoinGecko API or script implementation.");
      return;
    }
    
    if (topCoinIds.length !== NUMBER_OF_TOKENS_TO_FETCH) {
      console.warn(`Expected ${NUMBER_OF_TOKENS_TO_FETCH} token IDs, but fetched ${topCoinIds.length}. Proceeding with the fetched IDs.`);
    } else {
      console.log(`Successfully fetched ${topCoinIds.length} token IDs from CoinGecko.`);
    }
    
    console.log(`First 5 IDs: ${topCoinIds.slice(0, 5).join(', ')}`);
    
    await updateCryptoConstantsFile(topCoinIds);
    console.log('POPULAR_TOKEN_IDS_TO_PRELOAD has been updated successfully.');
    
  } catch (error) {
    // Error is already logged in fetchTopCoinGeckoIds or updateCryptoConstantsFile
    console.error('Script execution failed.');
    process.exit(1); // Exit with error code
  }
}

main(); 