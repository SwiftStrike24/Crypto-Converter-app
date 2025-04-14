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
  align-items: baseline;
  gap: 8px;
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

const PriceChange = styled.span<{ $isPositive: boolean | null }>`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  margin-left: 6px;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);
  display: inline-flex;
  align-items: center;
  letter-spacing: 0.3px;
  
  /* Modern gradient backgrounds with depth effect */
  background: ${props => 
    props.$isPositive === null 
      ? 'rgba(255, 255, 255, 0.1)' 
      : props.$isPositive 
        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%)' 
        : 'linear-gradient(135deg, rgba(255, 68, 68, 0.2) 0%, rgba(255, 68, 68, 0.15) 100%)'
  };
  
  /* Subtle 3D-like border effect */
  box-shadow: ${props => 
    props.$isPositive === null 
      ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)' 
      : props.$isPositive 
        ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)' 
        : 'inset 0 0 0 1px rgba(255, 68, 68, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)'
  };
  
  /* Text color and glow effect */
  color: ${props => 
    props.$isPositive === null 
      ? 'rgba(255, 255, 255, 0.6)' 
      : props.$isPositive 
        ? '#10b981' 
        : '#ff4444'
  };
  
  /* Enhanced text glow effect */
  text-shadow: ${props => 
    props.$isPositive === null 
      ? 'none' 
      : props.$isPositive 
        ? '0 0 8px rgba(16, 185, 129, 0.4)' 
        : '0 0 8px rgba(255, 68, 68, 0.4)'
  };
  
  /* Hover effect for interactive feel */
  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => 
      props.$isPositive === null 
        ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.15)' 
        : props.$isPositive 
          ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.3), 0 2px 4px rgba(0, 0, 0, 0.15)' 
          : 'inset 0 0 0 1px rgba(255, 68, 68, 0.3), 0 2px 4px rgba(0, 0, 0, 0.15)'
    };
  }
  
  /* Pulse animation on data refresh */
  animation: ${props => 
    props.$isPositive !== null 
      ? 'pricePulse 1.5s ease-out' 
      : 'none'
  };
  
  /* Subtle shimmer effect */
  &::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(
      circle, 
      ${props => 
        props.$isPositive === null
          ? 'rgba(255, 255, 255, 0.1)'
          : props.$isPositive
            ? 'rgba(16, 185, 129, 0.1)'
            : 'rgba(255, 68, 68, 0.1)'
      } 0%, 
      transparent 70%
    );
    opacity: 0;
    transform: rotate(30deg);
    animation: shimmer 3s linear infinite;
  }
  
  @keyframes pricePulse {
    0% { transform: scale(0.95); opacity: 0.7; }
    50% { transform: scale(1.05); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  
  @keyframes shimmer {
    0% { opacity: 0; transform: translateX(-100%) rotate(30deg); }
    20% { opacity: 0.2; }
    30% { opacity: 0.4; }
    40% { opacity: 0.2; }
    60% { opacity: 0; }
    100% { opacity: 0; transform: translateX(100%) rotate(30deg); }
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

  const formatPrice = (price: number, fiat: string): string => {
    let formattedValue: string;

    // SPECIAL CASE: Handle stablecoins or prices very close to 1
    if (price > 0.999 && price < 1.001) {
        formattedValue = (1).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    // Use the refined logic similar to LivePrice.tsx
    else if (price >= 1000) {
      // e.g., 1,234.56
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (price >= 1) {
      // e.g., 12.34
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2
      });
    } else if (price >= 0.01) {
      // e.g., 0.1646 
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 4, 
        maximumFractionDigits: 4
      });
    } else if (price > 0) {
      // e.g., 0.00123456 or 0.00001234
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 8
      });
    } else { 
      // Handle zero or invalid price
      formattedValue = '0.00';
    }

    // Add the appropriate currency symbol (using a simpler approach)
    switch (fiat.toUpperCase()) {
      case 'USD': return `$${formattedValue}`;
      case 'EUR': return `€${formattedValue}`;
      case 'GBP': return `£${formattedValue}`;
      case 'JPY': return `¥${formattedValue}`;
      case 'CAD': return `CA$${formattedValue}`;
      case 'AUD': return `A$${formattedValue}`;
      case 'CNY': return `¥${formattedValue}`;
      case 'INR': return `₹${formattedValue}`;
      default: return `${fiat.toUpperCase()} ${formattedValue}`;
    }
  };

  // Only show price on main page
  const showPrice = location.pathname === '/';

  const getPrice = () => {
    if (loading && !prices[selectedCrypto]) return <LoadingDot />; // Show loading only if no price exists

    if (error) {
      return (
        <>
          {error}
          <RetryButton onClick={handleRetry} title="Retry">↻</RetryButton>
        </>
      );
    }
    
    const currentPriceData = prices[selectedCrypto]?.[selectedFiat.toLowerCase()];
    const isDataPending = isPending(selectedCrypto);

    // If data is pending and we have no cached data at all for this fiat, show loading
    if (isDataPending && !currentPriceData?.price) {
        return (
            <>
              {selectedCrypto} <LoadingDot />
            </>
          );
    }
    
    // If we don't have any price data (even after loading/pending check)
    if (!currentPriceData?.price) {
        // Try localStorage cache as a last resort before showing N/A
        try {
            const priceCacheKey = `crypto_price_${selectedCrypto.toLowerCase()}`;
            const cachedStorageData = localStorage.getItem(priceCacheKey);
            if (cachedStorageData) {
                const priceStorageData = JSON.parse(cachedStorageData);
                const fiatPriceData = priceStorageData?.[selectedFiat.toLowerCase()];
                if (fiatPriceData?.price) {
                    return (
                        <>
                          {formatPrice(fiatPriceData.price, selectedFiat)}
                          {/* Show placeholder for change when using storage cache */}
                          <PriceChange $isPositive={null}>--%</PriceChange> 
                        </>
                      );
                }
            }
          } catch (e) { /* Ignore cache errors */ }
        
        // If still no data, return N/A
        return 'N/A';
    }

    // We have price data (current or cached)
    const formattedPrice = formatPrice(currentPriceData.price, selectedFiat);
    const changePercent = currentPriceData.change24h;

    return (
      <>
        {formattedPrice}
        {typeof changePercent === 'number' ? (
          <PriceChange $isPositive={changePercent >= 0}>
            {`${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
          </PriceChange>
        ) : isDataPending ? (
          // Show loading indicator for percentage if price is available but data is pending
          <PriceChange $isPositive={null}>...</PriceChange> 
        ) : (
          // Show placeholder if change is genuinely null (and not pending)
          <PriceChange $isPositive={null}>--%</PriceChange> 
        )}
      </>
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