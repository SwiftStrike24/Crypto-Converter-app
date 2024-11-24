import React from 'react';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
`;

const ExchangeRate = styled.div`
  font-size: 14px;
  color: #ffffff;
  margin-right: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
`;

const PowerButton = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ff4444;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-app-region: no-drag;

  &:hover {
    background: #ff0000;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
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

interface HeaderProps {
  selectedCrypto: string;
}

const cryptoIds: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple'
};

const Header: React.FC<HeaderProps> = ({ selectedCrypto }) => {
  const { prices, loading, error } = useCrypto();

  const handlePowerClick = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('quit-app');
  };

  const getPrice = () => {
    if (loading) return <LoadingDot />;
    if (error) return 'Error';
    
    const cryptoId = cryptoIds[selectedCrypto];
    if (!prices[cryptoId]) return 'N/A';
    
    const price = prices[cryptoId].usd;
    return price.toLocaleString('en-US', { 
      style: 'currency', 
      currency: 'USD',
      maximumFractionDigits: 0
    });
  };

  return (
    <HeaderContainer>
      <PowerButton onClick={handlePowerClick} aria-label="Power off" />
      <ExchangeRate>
        1 {selectedCrypto} = {getPrice()}
      </ExchangeRate>
    </HeaderContainer>
  );
};

export default Header; 