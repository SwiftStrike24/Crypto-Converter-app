import React from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { CryptoChart } from '../components/CryptoChart';
import { LivePrice } from '../components/LivePrice';

const PageContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background: #111111;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding: 0.5rem;
`;

const HeaderContent = styled.div`
  display: flex;
  align-items: center;
  gap: 2rem;
`;

const Title = styled.h1`
  color: #fff;
  font-size: 1.5rem;
  font-weight: 500;
  margin: 0;
`;

const BackButton = styled.button`
  background: transparent;
  border: none;
  color: #9ca3af;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 6px;
  transition: all 0.2s ease;
  font-size: 0.9rem;

  &:hover {
    color: #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
  }

  &:active {
    transform: scale(0.98);
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ChartWrapper = styled.div`
  flex: 1;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  
  .chart-container {
    background: transparent;
    box-shadow: none;
    border: none;
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

const ChartPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { cryptoId, currency } = location.state as LocationState || {
    cryptoId: 'BTC',
    currency: 'USD'
  };

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={() => navigate('/')}>
          <BackIcon />
          Back to Converter
        </BackButton>
        <HeaderContent>
          <LivePrice cryptoId={cryptoId} currency={currency} />
          <Title>{cryptoId}/{currency} Price Chart</Title>
        </HeaderContent>
      </Header>
      <ChartWrapper>
        <CryptoChart cryptoId={cryptoId} currency={currency} />
      </ChartWrapper>
    </PageContainer>
  );
};

export default ChartPage;
