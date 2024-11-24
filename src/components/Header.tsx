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

const ExchangeRate = styled.div`
  font-size: 14px;
  color: #ffffff;
  margin-right: 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
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
  selectedFiat: string;
}

const cryptoIds: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple'
};

const Header: React.FC<HeaderProps> = ({ selectedCrypto, selectedFiat }) => {
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
    
    const price = prices[cryptoId][selectedFiat.toLowerCase()];
    return price.toLocaleString(selectedFiat === 'USD' ? 'en-US' : selectedFiat === 'EUR' ? 'de-DE' : 'en-CA', { 
      style: 'currency', 
      currency: selectedFiat,
      maximumFractionDigits: 0
    });
  };

  return (
    <HeaderContainer>
      <WindowControls>
        <PowerButton onClick={handlePowerClick} aria-label="Close app">
          <GiPowerButton />
        </PowerButton>
      </WindowControls>
      <ExchangeRate>
        1 {selectedCrypto} = {getPrice()}
      </ExchangeRate>
    </HeaderContainer>
  );
};

export default Header; 