import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { GiPowerButton } from "react-icons/gi";
import { IoMdAdd } from "react-icons/io";
import { FiTrash2 } from "react-icons/fi";
import { useCrypto } from '../context/CryptoContext';
import AddCryptoModal from './AddCryptoModal';

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

const IconButton = styled.button`
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 5px;
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    color: #8b5cf6;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const IconsContainer = styled.div`
  display: flex;
  gap: 8px;
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

const Header: React.FC<HeaderProps> = ({ selectedCrypto, selectedFiat }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { prices, loading, error, lastUpdated, updatePrices } = useCrypto();

  const handleQuit = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('quit-app');
  };

  const handleRetry = () => {
    updatePrices(true).catch(console.error);
  };

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getOptimalDecimals = (price: number): number => {
    if (price >= 1000) return 2;    // For high value currencies like BTC
    if (price >= 100) return 3;     // For mid-range values
    if (price >= 10) return 4;      // For lower values
    if (price >= 1) return 6;       // For values close to 1
    if (price >= 0.01) return 8;    // For small values
    if (price >= 0.0001) return 8;  // For very small values
    return 8;                       // For extremely small values like BONK
  };

  const formatSmallNumber = (num: number): string => {
    const str = num.toString();
    if (str.includes('e')) {
      const [base, exponent] = str.split('e');
      const exp = parseInt(exponent);
      if (exp < 0) {
        const absExp = Math.abs(exp);
        return '0.' + '0'.repeat(absExp - 1) + base.replace('.', '');
      }
    }
    
    const parts = str.split('.');
    if (parts.length === 2) {
      const decimals = Math.min(8, parts[1].length);
      return num.toFixed(decimals);
    }
    
    return str;
  };

  // Only show price on main page
  const showPrice = location.pathname === '/';

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
    
    if (!prices[selectedCrypto]) return 'N/A';
    
    const price = prices[selectedCrypto][selectedFiat.toLowerCase()];
    if (!price) return 'N/A';

    // For very small numbers, use special formatting
    if (price < 0.01) {
      return formatSmallNumber(price);
    }

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
      <IconsContainer>
        <IconButton onClick={() => navigate('/add-tokens')} title="Add tokens">
          <IoMdAdd size={20} />
        </IconButton>
        <IconButton onClick={() => navigate('/manage-tokens')} title="Manage tokens">
          <FiTrash2 size={18} />
        </IconButton>
      </IconsContainer>

      {showPrice && (
        <ExchangeRate isError={!!error}>
          <LastUpdated className="last-updated">
            {lastUpdated ? formatTimeAgo(lastUpdated) : ''}
          </LastUpdated>
          {getPrice()}
        </ExchangeRate>
      )}

      <WindowControls>
        <PowerButton onClick={handleQuit} title="Quit application">
          <GiPowerButton />
        </PowerButton>
      </WindowControls>
      <AddCryptoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </HeaderContainer>
  );
};

export default Header;