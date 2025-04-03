import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { GiPowerButton } from "react-icons/gi";
import { IoMdAdd } from "react-icons/io";
import { FiRefreshCw, FiX, FiCheck } from "react-icons/fi";
import { FiTrash2 } from "react-icons/fi";
import { useCrypto } from '../context/CryptoContext';
import AddCryptoModal from './AddCryptoModal';
import UpdateDialog from './UpdateDialog';
import { checkForUpdates } from '../services/updateService';

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
  display: flex;
  gap: 8px;
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

const UpdateButton = styled.button`
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
  background: #8b5cf6;
  
  &:hover {
    background: #9f7aea;
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

const ExchangeRate = styled.div<{ $isError?: boolean }>`
  font-size: 14px;
  color: ${props => props.$isError ? '#ff4444' : '#ffffff'};
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
    color: ${props => props.$isError ? '#ff6666' : '#ffffff'};
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

const Tooltip = styled.div<{ $isVisible: boolean }>`
  position: absolute;
  top: 40px;
  right: 10px;
  width: 220px;
  background: #1a1a2e;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  border: 1px solid #8b5cf6;
  color: white;
  z-index: 1000;
  opacity: ${props => props.$isVisible ? 1 : 0};
  visibility: ${props => props.$isVisible ? 'visible' : 'hidden'};
  transform: ${props => props.$isVisible ? 'translateY(0)' : 'translateY(-10px)'};
  transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
  font-size: 12px;
`;

const TooltipTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #8b5cf6;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TooltipContent = styled.div`
  font-size: 12px;
  line-height: 1.4;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;

  &:hover {
    background: rgba(139, 92, 246, 0.1);
    transform: scale(1.1);
  }
`;

const TooltipIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #10b981;
  color: white;
  margin-right: 8px;
`;

const TooltipHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
`;

const UpdateButtonSpinner = styled.div`
  animation: spin 1s linear infinite;
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const ErrorIcon = styled.div<{ $isError?: boolean }>`
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
  background: ${props => props.$isError ? '#ff4444' : 'transparent'};
  
  &:hover {
    background: ${props => props.$isError ? '#ff6666' : 'transparent'};
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

interface HeaderProps {
  selectedCrypto: string;
  selectedFiat: string;
}

const Header: React.FC<HeaderProps> = ({ selectedCrypto, selectedFiat }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipMessage, setTooltipMessage] = useState('');
  const [tooltipType, setTooltipType] = useState<'success' | 'error'>('success');
  const tooltipTimeoutRef = useRef<number | null>(null);
  const { prices, loading, error, lastUpdated, updatePrices, isPending } = useCrypto();

  // Clear tooltip timeout on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        window.clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  const showTooltip = (message: string, type: 'success' | 'error' = 'success') => {
    setTooltipMessage(message);
    setTooltipType(type);
    setTooltipVisible(true);
    
    // Auto-hide tooltip after 5 seconds
    if (tooltipTimeoutRef.current) {
      window.clearTimeout(tooltipTimeoutRef.current);
    }
    
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setTooltipVisible(false);
    }, 5000);
  };

  const hideTooltip = () => {
    setTooltipVisible(false);
    if (tooltipTimeoutRef.current) {
      window.clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
  };

  const handleQuit = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('quit-app');
  };

  const handleCheckUpdate = async () => {
    if (isCheckingUpdate) return;
    
    try {
      setIsCheckingUpdate(true);
      const result = await checkForUpdates();
      
      if (result.hasUpdate) {
        setUpdateInfo(result);
        setIsUpdateDialogOpen(true);
      } else {
        // Show tooltip notification instead of desktop notification
        const versionToShow = result.latestVersion || result.currentVersion || '';
        showTooltip(`You're already using the latest version (${versionToShow}).`);
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      // Show error tooltip
      showTooltip('Could not check for updates. Please try again later.', 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
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
    if (price >= 10) return 2;      // For values >= 10, show 2 decimals (e.g., 123.45)
    if (price >= 0.1) return 2;     // For values between 0.1 and 10, show 2 decimals (e.g., 0.55)
    if (price >= 0.01) return 3;    // For values between 0.01 and 0.1, show 3 decimals (e.g., 0.055)
    if (price >= 0.001) return 4;   // For values between 0.001 and 0.01, show 4 decimals (e.g., 0.0055)
    if (price >= 0.0001) return 5;  // For values between 0.0001 and 0.001, show 5 decimals (e.g., 0.00055)
    
    // For very small values, count leading zeros and show 1-2 significant digits
    const priceStr = price.toString();
    if (priceStr.includes('e-')) {
      // Handle scientific notation for extremely small values
      const [_, exponent] = priceStr.split('e-');
      return parseInt(exponent) + 1; // Show one significant digit
    }
    
    // Count leading zeros for small decimal values
    const match = priceStr.match(/0\.0*/);
    if (match) {
      const leadingZeros = match[0].length - 2; // Subtract 2 for "0."
      return leadingZeros + 2; // Show 2 significant digits
    }
    
    return 6; // Default fallback
  };

  const formatPrice = (price: number, fiat: string): string => {
    // For very small numbers (like BONK at $0.00001094)
    if (price < 0.0001) {
      // Count significant digits based on the size of the number
      const decimals = getOptimalDecimals(price);
      const formattedValue = price.toFixed(decimals);
      
      // Add the appropriate currency symbol
      switch (fiat) {
        case 'USD': return `$${formattedValue}`;
        case 'CAD': return `CA$${formattedValue}`;
        case 'EUR': return `€${formattedValue.replace('.', ',')}`;
        case 'GBP': return `£${formattedValue}`;
        case 'JPY': return `¥${formattedValue}`;
        case 'AUD': return `A$${formattedValue}`;
        default: return `${fiat} ${formattedValue}`;
      }
    }
    
    // For normal numbers, use locale formatting with appropriate decimals
    const decimals = getOptimalDecimals(price);
    
    // Format based on currency
    switch (fiat) {
      case 'USD':
        return `$${price.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}`;
      case 'CAD':
        return `CA$${price.toLocaleString('en-CA', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}`;
      case 'EUR':
        const formattedEuro = price.toLocaleString('de-DE', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping: true
        });
        return `€${formattedEuro.replace(/€\s?/g, '')}`;
      case 'GBP':
        return `£${price.toLocaleString('en-GB', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}`;
      case 'JPY':
        // JPY typically doesn't use decimal places
        return `¥${price.toLocaleString('ja-JP', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        })}`;
      case 'AUD':
        return `A$${price.toLocaleString('en-AU', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}`;
      default:
        const formatter = new Intl.NumberFormat(
          fiat === 'USD' ? 'en-US' : fiat === 'EUR' ? 'de-DE' : 'en-CA', 
          { 
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          }
        );
        return `${fiat} ${formatter.format(price)}`;
    }
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
    
    // Check if the token is pending price update
    if (isPending(selectedCrypto)) {
      // Instead of showing loading state, try to display any available data for this token
      
      // First attempt: use any possible stored data for this token
      if (prices[selectedCrypto]) {
        const price = prices[selectedCrypto][selectedFiat.toLowerCase()];
        if (price) {
          return formatPrice(price, selectedFiat);
        }
      }
      
      // Second attempt: check localStorage for cached price
      try {
        const priceCacheKey = `crypto_price_${selectedCrypto.toLowerCase()}`;
        const cachedData = localStorage.getItem(priceCacheKey);
        if (cachedData) {
          const priceData = JSON.parse(cachedData);
          if (priceData && priceData[selectedFiat.toLowerCase()]) {
            return formatPrice(priceData[selectedFiat.toLowerCase()], selectedFiat);
          }
        }
      } catch (e) {
        // Ignore cache errors
      }
      
      // Fallback: Show the symbol with a placeholder dash
      return `${selectedCrypto} —`;
    }
    
    if (!prices[selectedCrypto]) return 'N/A';
    
    const price = prices[selectedCrypto][selectedFiat.toLowerCase()];
    if (!price) return 'N/A';

    // Use the new formatPrice function for consistent formatting
    return formatPrice(price, selectedFiat);
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
        <ExchangeRate $isError={!!error}>
          <LastUpdated className="last-updated">
            {lastUpdated ? formatTimeAgo(lastUpdated) : ''}
          </LastUpdated>
          {getPrice()}
        </ExchangeRate>
      )}

      <WindowControls>
        <UpdateButton 
          onClick={handleCheckUpdate} 
          title="Check for updates"
          disabled={isCheckingUpdate}
        >
          {isCheckingUpdate ? (
            <UpdateButtonSpinner>
              <FiRefreshCw />
            </UpdateButtonSpinner>
          ) : (
            <FiRefreshCw />
          )}
        </UpdateButton>
        <PowerButton onClick={handleQuit} title="Quit application">
          <GiPowerButton />
        </PowerButton>
        
        {/* Tooltip notification */}
        <Tooltip $isVisible={tooltipVisible}>
          <TooltipTitle>
            <TooltipHeader>
              <TooltipIcon>
                {tooltipType === 'success' ? <FiCheck size={16} /> : <FiX size={16} />}
              </TooltipIcon>
              {tooltipType === 'success' ? 'Update Check' : 'Update Error'}
            </TooltipHeader>
            <CloseButton onClick={hideTooltip}>
              <FiX size={16} />
            </CloseButton>
          </TooltipTitle>
          <TooltipContent>
            {tooltipMessage}
          </TooltipContent>
        </Tooltip>
      </WindowControls>
      
      <AddCryptoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      {updateInfo && (
        <UpdateDialog 
          isOpen={isUpdateDialogOpen} 
          onClose={() => setIsUpdateDialogOpen(false)} 
          updateInfo={updateInfo}
        />
      )}
    </HeaderContainer>
  );
};

export default Header;