import React from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import CryptoChart from '../components/CryptoChart';
import { LivePrice } from '../components/LivePrice';

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
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  
  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 1rem;
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
  margin: 2rem auto;
  background: #1a1a1a;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-height: 500px;
  transition: all 0.3s ease;
  
  @media (max-width: 768px) {
    padding: 1rem;
    margin: 1rem auto;
    min-height: 400px;
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
  console.log('📊 ChartPage Mounted - Location State:', location.state);

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
