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

// Format price with appropriate decimal places
const formatPrice = (price: number): string => {
  if (price >= 1000) {
    // e.g., 1,234.56
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } else if (price >= 1) {
    // e.g., 12.34
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 // Change max to 2 for consistency >= $1
    });
  } else if (price >= 0.01) {
    // e.g., 0.1646 
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 4, // Change min to 4
      maximumFractionDigits: 4  // Change max to 4
    });
  } else if (price > 0) {
    // e.g., 0.00123456 or 0.00001234
    // Keep showing more precision for very small numbers
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8
    });
  } else { 
    // Handle zero or invalid price
    return '0.00'; // Or some other placeholder
  }
};

export const LivePrice: React.FC<LivePriceProps> = ({ cryptoId, currency }) => {
  const { prices } = useCrypto();
  
  const currentPrice = prices[cryptoId]?.[currency.toLowerCase()];
  
  const formattedPrice = currentPrice !== undefined 
    ? formatPrice(currentPrice)
    : undefined;

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
