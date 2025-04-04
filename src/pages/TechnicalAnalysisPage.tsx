import React, { useState, memo } from 'react';
import styled from 'styled-components';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import TechnicalAnalysisWidget from '../components/TechnicalAnalysisWidget';
import { FaMagnifyingGlassChart } from 'react-icons/fa6';

const PageContainer = styled(motion.div)`
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
`;

const AnalysisContainer = styled(motion.div)`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled(motion.div)`
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
  transition: background 0.2s ease, color 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const WidgetWrapper = styled(motion.div)`
  flex: 1;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: #1e222d;
`;

const ChartControls = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: rgba(26, 26, 26, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.1);
  backdrop-filter: blur(8px);
  height: 50px;
  margin: 0.75rem;

  @media (max-width: 768px) {
    height: auto;
    padding: 0.5rem;
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
  background: rgba(0, 0, 0, 0.3);
  padding: 0.375rem;
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.15);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-left: 1rem;
`;

interface MarketButtonProps {
  $active: boolean;
}

const MarketButton = styled.button<MarketButtonProps>`
  background: ${props => props.$active ? 'rgba(139, 92, 246, 0.25)' : 'transparent'};
  border: 1px solid ${props => props.$active ? '#8B5CF6' : 'transparent'};
  color: ${props => props.$active ? '#fff' : 'rgba(255, 255, 255, 0.6)'};
  padding: 0.4rem 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
  min-width: 80px;
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

type Market = 'MEXC' | 'CRYPTO';

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

// Define animation variants
const pageVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut" } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: "easeIn" } },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
  exit: { opacity: 0 },
};

const itemVariants = {
  hidden: { y: -10, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

const _TechnicalAnalysisPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedInterval] = useState<'1h'>('1h');
  const [selectedMarket, setSelectedMarket] = useState<Market>('MEXC');

  const { cryptoId, currency } = location.state as LocationState || {
    cryptoId: 'BTC',
    currency: 'USD'
  };

  // Add location state check
  if (!location.state?.cryptoId || !location.state?.currency) {
    console.error('🚨 TechnicalAnalysisPage: Missing cryptoId or currency in location state.');
    // Navigate back or show error immediately
    React.useEffect(() => { navigate(-1); }, [navigate]);
    return null; // Render nothing while navigating back
  }

  const handleClose = () => {
    navigate(-1);
  };

  return (
    <PageContainer
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={handleClose}
    >
      <AnalysisContainer 
        variants={containerVariants}
        onClick={e => e.stopPropagation()}
      >
        <Header variants={itemVariants}>
          <Title>
            <AnalysisIcon />
            Technical Analysis - {cryptoId}/{currency}
          </Title>
          <CloseButton onClick={handleClose}>
            <CloseIcon />
          </CloseButton>
        </Header>
        <WidgetWrapper variants={itemVariants}>
          <ChartControls>
            <MarketLabel>Exchange View</MarketLabel>
            <MarketButtons>
              {(['MEXC', 'CRYPTO'] as Market[]).map((market) => (
                <MarketButton
                  key={market}
                  $active={selectedMarket === market}
                  onClick={() => setSelectedMarket(market)}
                >
                  {market}
                </MarketButton>
              ))}
            </MarketButtons>
          </ChartControls>
          <TechnicalAnalysisWidget 
            cryptoId={cryptoId}
            interval={selectedInterval}
            currency={currency}
            market={selectedMarket}
          />
        </WidgetWrapper>
      </AnalysisContainer>
    </PageContainer>
  );
};

export default memo(_TechnicalAnalysisPage); 