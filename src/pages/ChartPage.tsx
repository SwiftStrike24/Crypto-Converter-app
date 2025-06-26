import React, { useState, useEffect, memo } from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
// import { motion } from 'framer-motion'; // Temporarily comment out motion import
import { TokenStats } from '../components/TokenStats';
import TradingViewWidget from '../components/TradingViewWidget';

const PageContainer = styled.div`
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: #111111;
  overflow: hidden;
  padding: 1rem;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: rgba(20, 20, 20, 0.85);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.1);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
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
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  border: 1px solid rgba(139, 92, 246, 0.2);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  
  &:hover {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.3);
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
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  font-size: 0.9rem;
  font-weight: 500;

  &:hover {
    background: rgba(139, 92, 246, 0.15);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(139, 92, 246, 0.15);
  }

  svg {
    width: 18px;
    height: 18px;
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

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: rgba(20, 20, 20, 0.85);
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(139, 92, 246, 0.15);
  overflow: hidden;
`;

const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  background: rgba(20, 20, 20, 0.85);
  border-radius: 16px;
  padding: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(139, 92, 246, 0.15);
  overflow-y: auto;
  
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(139, 92, 246, 0.3);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
`;

const MarketLabel = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  font-weight: 500;
  letter-spacing: 0.5px;
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
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.2);

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
  background: ${props => props.$active ? 'rgba(139, 92, 246, 0.3)' : 'transparent'};
  border: 1px solid ${props => props.$active ? '#8B5CF6' : 'rgba(255, 255, 255, 0.1)'};
  color: ${props => props.$active ? '#fff' : 'rgba(255, 255, 255, 0.7)'};
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 70px;
  text-align: center;
  letter-spacing: 0.5px;
  
  &:hover {
    background: ${props => props.$active ? 'rgba(139, 92, 246, 0.35)' : 'rgba(255, 255, 255, 0.05)'};
    color: #fff;
    transform: translateY(-1px);
    border-color: ${props => props.$active ? '#8B5CF6' : 'rgba(255, 255, 255, 0.2)'};
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
  console.log('--- ChartPage Render ---');
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedMarket, setSelectedMarket] = useState<Market>('PYTH');
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
