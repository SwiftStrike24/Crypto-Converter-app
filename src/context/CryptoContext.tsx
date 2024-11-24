import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface CryptoContextType {
  prices: Record<string, Record<string, number>>;
  loading: boolean;
  error: string | null;
  updatePrices: () => Promise<void>;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

// Map crypto symbols to CoinGecko IDs
const cryptoIds: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple'
};

export const CryptoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prices, setPrices] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const updatePrices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const cryptoIdsList = Object.values(cryptoIds).join(',');
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIdsList}&vs_currencies=usd,eur,cad`
      );
      
      setPrices(response.data);
      setRetryCount(0);
    } catch (err) {
      console.error('Error fetching prices:', err);
      setError('Failed to fetch prices');
      
      // Implement exponential backoff for retries
      if (retryCount < 3) {
        const timeout = Math.pow(2, retryCount) * 1000;
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          updatePrices();
        }, timeout);
      }
    } finally {
      setLoading(false);
    }
  }, [retryCount]);

  useEffect(() => {
    updatePrices();
    
    // Update prices every 30 seconds
    const interval = setInterval(updatePrices, 30000);
    return () => clearInterval(interval);
  }, [updatePrices]);

  return (
    <CryptoContext.Provider value={{ prices, loading, error, updatePrices }}>
      {children}
    </CryptoContext.Provider>
  );
};

export const useCrypto = () => {
  const context = useContext(CryptoContext);
  if (context === undefined) {
    throw new Error('useCrypto must be used within a CryptoProvider');
  }
  return context;
}; 