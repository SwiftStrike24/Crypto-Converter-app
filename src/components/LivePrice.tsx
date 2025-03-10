import React from 'react';
import styled, { keyframes } from 'styled-components';
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

const pulse = keyframes`
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
`;

const PendingPrice = styled.span`
  animation: ${pulse} 1.5s infinite ease-in-out;
  color: #8b5cf6;
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
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  } else if (price >= 1) {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    });
  } else if (price >= 0.01) {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    });
  } else {
    return price.toLocaleString(undefined, {
      minimumFractionDigits: 6,
      maximumFractionDigits: 8
    });
  }
};

export const LivePrice: React.FC<LivePriceProps> = ({ cryptoId, currency }) => {
  const { prices, isPending } = useCrypto();
  
  const currentPrice = prices[cryptoId]?.[currency.toLowerCase()];
  const isPendingPrice = isPending(cryptoId);
  
  const formattedPrice = currentPrice !== undefined 
    ? formatPrice(currentPrice)
    : undefined;

  const currencySymbol = getCurrencySymbol(currency);

  return (
    <PriceContainer>
      <Symbol>{cryptoId}</Symbol>
      <Price>
        <CurrencySymbol>{currencySymbol}</CurrencySymbol>
        {isPendingPrice ? (
          <PendingPrice>{formattedPrice || 'Loading...'}</PendingPrice>
        ) : (
          formattedPrice || '...'
        )}
      </Price>
    </PriceContainer>
  );
};
