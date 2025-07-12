import React, { useState, useEffect, memo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
// import { motion } from 'framer-motion'; // Temporarily comment out motion import
import { TokenStats } from '../components/TokenStats';
import TradingViewWidget from '../components/TradingViewWidget';
import { TradingViewMarket, SUPPORTED_TRADING_VIEW_MARKETS } from '../constants/cryptoConstants';

const glow = keyframes`
  0%, 100% {
    box-shadow: 0 0 4px rgba(167, 139, 250, 0.6), 0 0 7px rgba(167, 139, 250, 0.4);
    background-color: rgba(167, 139, 250, 0.8);
  }
  50% {
    box-shadow: 0 0 10px rgba(167, 139, 250, 1), 0 0 15px rgba(167, 139, 250, 0.8);
    background-color: rgba(190, 170, 255, 1);
  }
`;

const PageContainer = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: radial-gradient(ellipse at bottom, #111111 0%, #030305 100%);
  overflow: hidden;
  padding: 1rem;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  background: rgba(28, 28, 40, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const CurrencyBadge = styled.span`
  background: linear-gradient(145deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05));
  color: #c4b5fd;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid rgba(139, 92, 246, 0.3);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  letter-spacing: 0.5px;
  box-shadow: 
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-1px);
    background: linear-gradient(145deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.1));
    border-color: rgba(139, 92, 246, 0.4);
    color: #ddd6fe;
  }
`;

const StyledCurrencyIcon = styled.svg`
  width: 14px;
  height: 14px;
  opacity: 0.9;
`;

const CurrencyIcon = () => (
  <StyledCurrencyIcon 
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
  </StyledCurrencyIcon>
);

const BackButton = styled.button`
  background: linear-gradient(145deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.1));
  border: 1px solid rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.75rem 1.25rem;
  border-radius: 10px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);

  &:hover {
    background: linear-gradient(145deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.15));
    transform: translateY(-2px);
    color: #ddd6fe;
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 
      inset 0 1px 1px rgba(255, 255, 255, 0.08),
      0 4px 8px rgba(0, 0, 0, 0.2);
  }

  &:active {
    transform: translateY(0) scale(0.98);
    box-shadow: inset 0 2px 2px rgba(0, 0, 0, 0.1);
  }

  svg {
    width: 18px;
    height: 18px;
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: translateX(-2px);
  }
`;

const ContentGrid = styled.main`
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1rem;
  overflow: hidden;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  background: rgba(28, 28, 40, 0.5);
  border-radius: 16px;
  padding: 1rem;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
`;

const MainContent = styled(Panel)`
  gap: 1rem;
`;

const Sidebar = styled(Panel)``;

const MarketLabel = styled.span`
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  
  &::before {
    content: '';
    display: block;
    width: 8px;
    height: 8px;
    background: #a78bfa;
    border-radius: 50%;
    animation: ${glow} 2.5s infinite ease-in-out;
  }
`;

const MarketButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.25);
  padding: 0.375rem;
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);

  @media (max-width: 768px) {
    width: auto;
    justify-content: center;
    flex-wrap: wrap;
  }
`;

interface MarketButtonProps {
  $active: boolean;
}

const MarketButton = styled.button<MarketButtonProps>`
  background: ${props => props.$active ? 'linear-gradient(145deg, #8b5cf6, #7c3aed)' : 'transparent'};
  border: 1px solid ${props => props.$active ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.$active ? '#fff' : 'rgba(255, 255, 255, 0.7)'};
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  min-width: 70px;
  text-align: center;
  letter-spacing: 0.5px;
  box-shadow: ${props => props.$active 
    ? '0 2px 8px rgba(139, 92, 246, 0.4), inset 0 1px 1px rgba(255,255,255,0.2)' 
    : 'none'};
  
  &:hover:not([disabled]) {
    background: ${props => props.$active ? 'linear-gradient(145deg, #9f7aea, #8b5cf6)' : 'rgba(255, 255, 255, 0.08)'};
    color: #fff;
    transform: translateY(-2px);
    border-color: ${props => props.$active ? 'rgba(167, 139, 250, 0.7)' : 'rgba(255, 255, 255, 0.3)'};
    box-shadow: ${props => props.$active 
      ? '0 4px 10px rgba(139, 92, 246, 0.5), inset 0 1px 1px rgba(255,255,255,0.2)' 
      : '0 2px 4px rgba(0,0,0,0.1)'};
  }

  &:active:not([disabled]) {
    transform: translateY(0) scale(0.98);
  }
`;

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
  console.log('--- ChartPage Render ---');
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedMarket, setSelectedMarket] = useState<TradingViewMarket>('CRYPTO');
  const [isWidgetLoading, setIsWidgetLoading] = useState(true);

  useEffect(() => {
    console.log('[ChartPage.tsx] useEffect for widget loading triggered.');
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
        <MainContent>
          <div>Error: Missing required chart data. Please go back and select a token.</div>
        </MainContent>
      </PageContainer>
    );
  }

  console.log('🔍 ChartPage Props:', { cryptoId, currency, selectedMarket });

  return (
    <PageContainer>
      <Header>
        <HeaderLeft>
          <BackButton onClick={() => navigate('/')}>
            <BackIcon />
            Back to Converter
          </BackButton>
          <CurrencyBadge>
            <CurrencyIcon />
            {currency} View
          </CurrencyBadge>
        </HeaderLeft>
        <HeaderRight>
          <MarketLabel>Exchange View</MarketLabel>
          <MarketButtons>
            {(SUPPORTED_TRADING_VIEW_MARKETS).map((market) => (
              <MarketButton
                key={market}
                $active={selectedMarket === market}
                onClick={() => setSelectedMarket(market)}
              >
                {market === 'CRYPTO' ? 'TradingView' : market}
              </MarketButton>
            ))}
          </MarketButtons>
        </HeaderRight>
      </Header>
      <ContentGrid>
        <MainContent>
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
        </MainContent>
        <Sidebar>
          <TokenStats cryptoId={cryptoId} currency={currency} />
        </Sidebar>
      </ContentGrid>
    </PageContainer>
  );
};

export const ChartPage = memo(_ChartPage);
export default ChartPage;
