import React, { useState } from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import CryptoChart from '../components/CryptoChart';
import { LivePrice } from '../components/LivePrice';
import { TokenStats } from '../components/TokenStats';

const PageContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: #111111;
  transition: all 0.3s ease;
  
  @media (max-width: 768px) {
    padding: 0.5rem;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding: 1rem;
  background: rgba(139, 92, 246, 0.05);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(139, 92, 246, 0.1);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
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

const Title = styled.h1`
  color: #fff;
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  
  @media (max-width: 768px) {
    font-size: 1.25rem;
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
  border-radius: 12px;
  transition: all 0.2s ease;
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
  max-width: 1400px;
  margin: 0 auto;
  background: rgba(26, 26, 26, 0.8);
  border-radius: 20px;
  padding: 1.5rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(139, 92, 246, 0.1);
  backdrop-filter: blur(20px);
  min-height: 400px;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  
  @media (max-width: 768px) {
    padding: 1rem;
    margin: 0.5rem auto;
    min-height: 350px;
  }
`;

const ChartControls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: rgba(26, 26, 26, 0.6);
  border-radius: 16px;
  border: 1px solid rgba(139, 92, 246, 0.1);
  backdrop-filter: blur(8px);

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem;
  }
`;

const ControlsLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
    margin-bottom: 0.5rem;
  }
`;

const TimeframeButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  padding: 0.375rem;
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.15);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    width: auto;
    justify-content: center;
  }
`;

interface TimeButtonProps {
  $active: boolean;
}

const TimeButton = styled.button<TimeButtonProps>`
  background: ${props => props.$active ? 'rgba(139, 92, 246, 0.25)' : 'transparent'};
  border: 1px solid ${props => props.$active ? '#8B5CF6' : 'transparent'};
  color: ${props => props.$active ? '#fff' : 'rgba(255, 255, 255, 0.6)'};
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 48px;
  letter-spacing: 0.5px;
  
  &:hover {
    background: ${props => props.$active ? 'rgba(139, 92, 246, 0.3)' : 'rgba(139, 92, 246, 0.1)'};
    color: ${props => props.$active ? '#fff' : 'rgba(255, 255, 255, 0.8)'};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

type Timeframe = '1D' | '1W' | '1M' | '1Y';

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

const ChartPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [timeframe, setTimeframe] = useState<Timeframe>('1D');

  const { cryptoId, currency } = location.state as LocationState || {
    cryptoId: 'BTC',
    currency: 'USD'
  };

  console.log('🔍 ChartPage Props:', { cryptoId, currency });

  if (!location.state) {
    console.warn('⚠️ No location state provided, using default values');
  }

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
          <Title>{cryptoId}/{currency} Price Chart</Title>
        </HeaderContent>
      </Header>
      <ChartWrapper>
        <ChartControls>
          <ControlsLeft>
            <LivePrice cryptoId={cryptoId} currency={currency} />
          </ControlsLeft>
          <TimeframeButtons>
            {(['1D', '1W', '1M', '1Y'] as Timeframe[]).map((tf) => (
              <TimeButton
                key={tf}
                $active={timeframe === tf}
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </TimeButton>
            ))}
          </TimeframeButtons>
        </ChartControls>
        <CryptoChart 
          cryptoId={cryptoId} 
          currency={currency} 
          timeframe={timeframe}
        />
        <TokenStats cryptoId={cryptoId} currency={currency} />
      </ChartWrapper>
    </PageContainer>
  );
};

export default ChartPage;
