import React from 'react';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';

const PriceContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  backdrop-filter: blur(8px);
`;

const Price = styled.span`
  color: #fff;
  font-size: 1.25rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const CurrencySymbol = styled.span`
  color: #9ca3af;
  font-size: 1rem;
`;

const Symbol = styled.span`
  color: #9ca3af;
  font-size: 1.25rem;
`;

interface LivePriceProps {
  cryptoId: string;
  currency: string;
}

const getCurrencySymbol = (currency: string): string => {
  switch (currency.toUpperCase()) {
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'JPY':
      return '¥';
    case 'CAD':
      return 'CA$';
    case 'AUD':
      return 'A$';
    case 'CNY':
      return '¥';
    case 'INR':
      return '₹';
    default:
      return currency.toUpperCase();
  }
};

export const LivePrice: React.FC<LivePriceProps> = ({ cryptoId, currency }) => {
  const { prices } = useCrypto();
  
  const currentPrice = prices[cryptoId]?.[currency.toLowerCase()];
  const formattedPrice = currentPrice?.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });

  const currencySymbol = getCurrencySymbol(currency);

  return (
    <PriceContainer>
      <Symbol>{cryptoId}</Symbol>
      <Price>
        <CurrencySymbol>{currencySymbol}</CurrencySymbol>
        {formattedPrice || '...'}
      </Price>
    </PriceContainer>
  );
};
