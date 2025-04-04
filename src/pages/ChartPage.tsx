import React, { useState, useEffect, memo } from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
// import { motion } from 'framer-motion'; // Temporarily comment out motion import
import { TokenStats } from '../components/TokenStats';
import TradingViewWidget from '../components/TradingViewWidget';

const PageContainer = styled.div`
  height: 100%;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: #111111;
  transition: all 0.3s ease;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: rgba(139, 92, 246, 0.05);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(139, 92, 246, 0.1);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  height: 60px;
  
  @media (max-width: 768px) {
    flex-direction: column;
    height: auto;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding: 0.5rem;
  }
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 2rem;
  
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    align-items: center;
  }
`;

const CurrencyBadge = styled.span`
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
  padding: 0.35rem 1rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid rgba(139, 92, 246, 0.2);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.3);
    transform: translateY(-1px);
    box-shadow: 0 6px 12px rgba(139, 92, 246, 0.15);
  }
  
  svg {
    width: 14px;
    height: 14px;
    opacity: 0.9;
  }

  @media (max-width: 768px) {
    font-size: 0.8rem;
    padding: 0.25rem 0.8rem;
  }
`;

const CurrencyIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="8"/>
    <line x1="12" y1="16" x2="12" y2="16"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
  </svg>
);

const BackButton = styled.button`
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  font-size: 0.9rem;
  font-weight: 500;

  &:hover {
    background: rgba(139, 92, 246, 0.15);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 20px;
    height: 20px;
  }
  
  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const ChartWrapper = styled.div`
  flex: 1;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  background: rgba(20, 20, 20, 0.85);
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(139, 92, 246, 0.15);
  // backdrop-filter: blur(20px); // Temporarily comment out backdrop-filter
  height: calc(100% - 80px);
  transition: background 0.3s ease, border-color 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow: hidden;
`;

const ChartControls = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: rgba(26, 26, 26, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.1);
  backdrop-filter: blur(8px);
  height: 50px;

  @media (max-width: 768px) {
    height: auto;
    padding: 0.5rem;
  }
`;

const ControlsRight = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  
  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
    gap: 0.5rem;
  }
`;

const MarketLabel = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  
  &::before {
    content: '';
    display: block;
    width: 6px;
    height: 6px;
    background: #8b5cf6;
    border-radius: 50%;
  }
`;

const MarketButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.4);
  padding: 0.375rem;
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);

  @media (max-width: 768px) {
    width: auto;
    justify-content: center;
    flex-wrap: wrap;
  }
`;

interface TimeButtonProps {
  $active: boolean;
}

const MarketButton = styled.button<TimeButtonProps>`
  background: ${props => props.$active ? 'rgba(139, 92, 246, 0.3)' : 'transparent'};
  border: 1px solid ${props => props.$active ? '#8B5CF6' : 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.$active ? '#fff' : 'rgba(255, 255, 255, 0.7)'};
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
  min-width: 70px;
  text-align: center;
  letter-spacing: 0.5px;
  
  &:hover {
    background: ${props => props.$active ? 'rgba(139, 92, 246, 0.35)' : 'rgba(255, 255, 255, 0.05)'};
    color: ${props => props.$active ? '#fff' : 'rgba(255, 255, 255, 0.9)'};
    transform: translateY(-1px);
    border-color: ${props => props.$active ? '#8B5CF6' : 'rgba(255, 255, 255, 0.2)'};
  }

  &:active {
    transform: translateY(0);
  }
`;

type Market = 'BINANCE' | 'MEXC' | 'PYTH' | 'CRYPTO';

const BackIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
);

interface LocationState {
  cryptoId: string;
  currency: string;
}

const ChartWidgetContainer = styled.div`
  flex: 1;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
`;

const LoadingPlaceholder = styled.div`
  color: rgba(255, 255, 255, 0.5);
  font-size: 1rem;
`;

const _ChartPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedMarket, setSelectedMarket] = useState<Market>('PYTH');
  const [isWidgetLoading, setIsWidgetLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsWidgetLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [location.state?.cryptoId, selectedMarket, location.state?.currency]);

  const { cryptoId, currency } = location.state as LocationState || {
    cryptoId: 'BTC',
    currency: 'USD'
  };

  if (!location.state?.cryptoId || !location.state?.currency) {
    console.error('🚨 Critical Error: Missing cryptoId or currency in location state. Navigating back.');
    return (
      <PageContainer>
        <Header>
           <BackButton onClick={() => navigate('/')}>
             <BackIcon /> Back
           </BackButton>
        </Header>
        <ChartWrapper>
          <div>Error: Missing required chart data. Please go back and select a token.</div>
        </ChartWrapper>
      </PageContainer>
    );
  }

  console.log('🔍 ChartPage Props:', { cryptoId, currency, selectedMarket });

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={() => {
          console.log('↩️ Navigating back to converter');
          navigate('/');
        }}>
          <BackIcon />
          Back to Converter
        </BackButton>
        <HeaderContent>
          <CurrencyBadge>
            <CurrencyIcon />
            {currency} View
          </CurrencyBadge>
        </HeaderContent>
      </Header>
      <ChartWrapper>
        <ChartControls>
          <ControlsRight>
            <MarketLabel>Exchange View</MarketLabel>
            <MarketButtons>
              {(['PYTH', 'CRYPTO', 'BINANCE', 'MEXC'] as Market[]).map((market) => (
                <MarketButton
                  key={market}
                  $active={selectedMarket === market}
                  onClick={() => setSelectedMarket(market)}
                >
                  {market}
                </MarketButton>
              ))}
            </MarketButtons>
          </ControlsRight>
        </ChartControls>
        <ChartWidgetContainer>
          {isWidgetLoading ? (
            <LoadingPlaceholder>Loading Chart...</LoadingPlaceholder>
          ) : (
            <TradingViewWidget
              cryptoId={cryptoId}
              timeframe="1D"
              market={selectedMarket}
              currency={currency}
            />
          )}
        </ChartWidgetContainer>
        <TokenStats cryptoId={cryptoId} currency={currency} />
      </ChartWrapper>
    </PageContainer>
  );
};

export const ChartPage = memo(_ChartPage);
export default ChartPage;
