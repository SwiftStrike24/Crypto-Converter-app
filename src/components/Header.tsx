import React from 'react';
import styled from 'styled-components';
import { GiPowerButton } from "react-icons/gi";
import { useCrypto } from '../context/CryptoContext';

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
  padding: 10px 15px;
  background: rgba(0, 0, 0, 0.2);
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  position: relative;
`;

const WindowControls = styled.div`
  -webkit-app-region: no-drag;
`;

const PowerButton = styled.button`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  background: #ff5f57;
  
  &:hover {
    background: #ff3b30;
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 12px;
    height: 12px;
    color: white;
  }
`;

const ExchangeRate = styled.div<{ isError?: boolean }>`
  font-size: 14px;
  color: ${props => props.isError ? '#ff4444' : '#ffffff'};
  margin-right: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  transition: color 0.2s ease;
  white-space: nowrap;
  -webkit-app-region: no-drag;

  &:hover {
    color: ${props => props.isError ? '#ff6666' : '#ffffff'};
  }

  &:hover .last-updated {
    opacity: 1;
  }
`;

const LoadingDot = styled.div`
  width: 8px;
  height: 8px;
  background-color: #8b5cf6;
  border-radius: 50%;
  animation: pulse 1.5s infinite;

  @keyframes pulse {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
  }
`;

const RetryButton = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  margin-left: 8px;
  transition: color 0.2s ease;

  &:hover {
    color: #9f7aea;
  }
`;

const LastUpdated = styled.span`
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
`;

interface HeaderProps {
  selectedCrypto: string;
  selectedFiat: string;
}

const cryptoIds: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple'
};

const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

const Header: React.FC<HeaderProps> = ({ selectedCrypto, selectedFiat }) => {
  const { prices, loading, error, updatePrices, lastUpdated } = useCrypto();

  const handlePowerClick = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('quit-app');
  };

  const handleRetry = () => {
    updatePrices(true).catch(console.error);
  };

  const getOptimalDecimals = (price: number): number => {
    if (price >= 1000) return 0;  // For high value currencies like BTC
    if (price >= 100) return 1;   // For mid-range values
    if (price >= 10) return 2;    // For lower values
    if (price >= 1) return 3;     // For values close to 1
    return 4;                     // For very small values
  };

  const getPrice = () => {
    if (loading) return <LoadingDot />;
    if (error) {
      return (
        <>
          {error}
          <RetryButton onClick={handleRetry} title="Retry">↻</RetryButton>
        </>
      );
    }
    
    const cryptoId = cryptoIds[selectedCrypto];
    if (!prices[cryptoId]) return 'N/A';
    
    const price = prices[cryptoId][selectedFiat.toLowerCase()];
    if (!price) return 'N/A';

    const decimals = getOptimalDecimals(price);

    return price.toLocaleString(
      selectedFiat === 'USD' ? 'en-US' : selectedFiat === 'EUR' ? 'de-DE' : 'en-CA', 
      { 
        style: 'currency', 
        currency: selectedFiat,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }
    );
  };

  return (
    <HeaderContainer>
      <WindowControls>
        <PowerButton onClick={handlePowerClick} aria-label="Close app">
          <GiPowerButton />
        </PowerButton>
      </WindowControls>
      <ExchangeRate isError={!!error}>
        {lastUpdated && <LastUpdated className="last-updated">Updated {formatTimeAgo(lastUpdated)}</LastUpdated>}
        1 {selectedCrypto} = {getPrice()}
      </ExchangeRate>
    </HeaderContainer>
  );
};

export default Header; 