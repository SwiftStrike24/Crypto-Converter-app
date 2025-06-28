import React, { useState, memo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaMagnifyingGlassChart, FaArrowLeft } from 'react-icons/fa6';
import TechnicalAnalysisWidget from '../components/TechnicalAnalysisWidget';

const glow = keyframes`
  0%, 100% {
    box-shadow: 0 0 5px rgba(139, 92, 246, 0.7), 0 0 8px rgba(139, 92, 246, 0.5);
  }
  50% {
    box-shadow: 0 0 12px rgba(167, 139, 250, 1), 0 0 20px rgba(167, 139, 250, 0.7);
  }
`;

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
  overflow: hidden;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const Title = styled.h2`
  margin: 0;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  opacity: 0.9;

  svg {
    width: 18px;
    height: 18px;
    color: #8b5cf6;
  }
`;

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
  grid-template-columns: 1fr;
  gap: 1rem;
  overflow: hidden;
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

const ControlsWrapper = styled.div`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  background: rgba(20, 20, 20, 0.85);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.1);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
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
    width: 8px;
    height: 8px;
    background: #8b5cf6;
    border-radius: 50%;
    animation: ${glow} 2.5s infinite ease-in-out;
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

type Market = 'MEXC' | 'CRYPTO' | 'BINANCE';

const AnalysisIcon = () => (
  <FaMagnifyingGlassChart />
);

const BackIcon = () => (
    <FaArrowLeft />
);

interface LocationState {
  cryptoId: string;
  currency: string;
}

const _TechnicalAnalysisPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedInterval] = useState<'1h'>('1h');
  const [selectedMarket, setSelectedMarket] = useState<Market>('BINANCE');

  const { cryptoId, currency } = location.state as LocationState || {
    cryptoId: 'BTC',
    currency: 'USD'
  };

  // Add location state check
  if (!location.state?.cryptoId || !location.state?.currency) {
    console.error('🚨 TechnicalAnalysisPage: Missing cryptoId or currency in location state.');
    // Navigate back or show error immediately
    React.useEffect(() => { navigate(-1); }, [navigate]);
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

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <PageContainer>
        <Header>
            <HeaderLeft>
                <BackButton onClick={handleBack}>
                    <BackIcon />
                    Back
                </BackButton>
                <Title>
                    <AnalysisIcon />
                    Technical Analysis - {cryptoId}/{currency}
                </Title>
            </HeaderLeft>
            <HeaderRight />
        </Header>
        <ControlsWrapper>
            <MarketLabel>Exchange View</MarketLabel>
            <MarketButtons>
                {(['BINANCE', 'CRYPTO', 'MEXC'] as Market[]).map((market) => (
                    <MarketButton
                        key={market}
                        $active={selectedMarket === market}
                        onClick={() => setSelectedMarket(market)}
                    >
                        {market === 'CRYPTO' ? 'TradingView' : market}
                    </MarketButton>
                ))}
            </MarketButtons>
        </ControlsWrapper>
        <ContentGrid>
            <MainContent>
                <TechnicalAnalysisWidget 
                    cryptoId={cryptoId}
                    interval={selectedInterval}
                    currency={currency}
                    market={selectedMarket}
                />
            </MainContent>
        </ContentGrid>
    </PageContainer>
  );
};

export default memo(_TechnicalAnalysisPage);