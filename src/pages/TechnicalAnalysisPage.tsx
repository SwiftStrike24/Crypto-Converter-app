import React, { useState } from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import TechnicalAnalysisWidget from '../components/TechnicalAnalysisWidget';
import { FaMagnifyingGlassChart } from 'react-icons/fa6';

const PageContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  padding: 0;
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const AnalysisContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: rgba(31, 31, 44, 0.95);
  border-bottom: 1px solid rgba(139, 92, 246, 0.1);
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

const CloseButton = styled.button`
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const WidgetWrapper = styled.div`
  flex: 1;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e222d;
`;

const AnalysisIcon = () => (
  <FaMagnifyingGlassChart />
);

const CloseIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

interface LocationState {
  cryptoId: string;
  currency: string;
}

const TechnicalAnalysisPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedInterval] = useState<'1h'>('1h');

  const { cryptoId, currency } = location.state as LocationState || {
    cryptoId: 'BTC',
    currency: 'USD'
  };

  const handleClose = () => {
    navigate(-1);
  };

  return (
    <PageContainer onClick={handleClose}>
      <AnalysisContainer onClick={e => e.stopPropagation()}>
        <Header>
          <Title>
            <AnalysisIcon />
            Technical Analysis - {cryptoId}/{currency}
          </Title>
          <CloseButton onClick={handleClose}>
            <CloseIcon />
          </CloseButton>
        </Header>
        <WidgetWrapper>
          <TechnicalAnalysisWidget 
            cryptoId={cryptoId}
            interval={selectedInterval}
            currency={currency}
          />
        </WidgetWrapper>
      </AnalysisContainer>
    </PageContainer>
  );
};

export default TechnicalAnalysisPage; 