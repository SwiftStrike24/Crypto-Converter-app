import React from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { CryptoChart } from '../components/CryptoChart';

const ChartPageContainer = styled.div`
  width: 100%;
  min-height: 100vh;
  background: rgba(18, 18, 18, 0.95);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
`;

const Title = styled.h1`
  color: white;
  margin: 0;
  font-size: 1.5rem;
  font-weight: 500;
`;

const BackButton = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #888;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  font-size: 14px;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
    border-color: rgba(255, 255, 255, 0.2);
  }

  &:active {
    transform: translateY(1px);
  }
`;

const ChartContainer = styled.div`
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
`;

interface LocationState {
  cryptoId: string;
  currency: string;
}

export const ChartPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { cryptoId, currency } = location.state as LocationState || {
    cryptoId: 'BTC',
    currency: 'USD'
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <ChartPageContainer>
      <Header>
        <Title>{cryptoId}/{currency} Price Chart</Title>
        <BackButton onClick={handleBack}>
          ← Back to Converter
        </BackButton>
      </Header>
      <ChartContainer>
        <CryptoChart cryptoId={cryptoId} currency={currency} />
      </ChartContainer>
    </ChartPageContainer>
  );
};

export default ChartPage;
