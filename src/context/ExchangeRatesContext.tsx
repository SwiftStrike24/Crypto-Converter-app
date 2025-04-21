import React, { createContext, useContext, useState, useEffect } from 'react';
import { getExchangeRates, formatTimeAgo } from '../services/exchangeRatesService';

interface ExchangeRates {
  CAD: number;
  EUR: number;
}

interface ExchangeRatesContextType {
  rates: ExchangeRates;
  lastUpdated: string;
  loading: boolean;
  error: string | null;
  refreshRates: () => Promise<void>;
}

const ExchangeRatesContext = createContext<ExchangeRatesContextType | undefined>(undefined);

export const ExchangeRatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rates, setRates] = useState<ExchangeRates>({ CAD: 1.38, EUR: 0.87 });
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getExchangeRates();
      setRates(data.rates);
      setLastUpdated(formatTimeAgo(data.timestamp));
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch exchange rates');
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshRates();
  }, []);

  return (
    <ExchangeRatesContext.Provider
      value={{
        rates,
        lastUpdated,
        loading,
        error,
        refreshRates
      }}
    >
      {children}
    </ExchangeRatesContext.Provider>
  );
};

export const useExchangeRates = () => {
  const context = useContext(ExchangeRatesContext);
  if (context === undefined) {
    throw new Error('useExchangeRates must be used within an ExchangeRatesProvider');
  }
  return context;
}; 