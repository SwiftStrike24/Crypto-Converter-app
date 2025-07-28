import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ITrendingToken } from '../services/trendingService';
import { useCrypto } from '../context/CryptoContext';

const CardWrapper = styled(motion.div)`
  position: relative;
  padding: 1rem;
  background: rgba(40, 42, 58, 0.6);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  
  /* Remove conflicting CSS transitions - let Framer Motion handle all animations */
  will-change: transform, box-shadow, border-color;
`;

const TokenInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
`;

const TokenIcon = styled.img`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: transform 0.2s ease;
`;

const TokenName = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: #e0e0e0;
  transition: color 0.2s ease;
`;

const TokenSymbol = styled.span`
  font-size: 0.8rem;
  color: #a0a0a0;
  margin-left: 0.25rem;
  text-transform: uppercase;
  transition: color 0.2s ease;
`;

const PriceInfo = styled.div`
  font-size: 1.25rem;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 0.5rem;
  transition: color 0.2s ease;
`;

const ChangeBadge = styled.div<{ $isPositive: boolean }>`
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  color: ${props => (props.$isPositive ? '#16a34a' : '#dc2626')};
  background-color: ${props => (props.$isPositive ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)')};
  display: inline-block;
  transition: all 0.2s ease;
`;

const VolumeInfo = styled.div`
  font-size: 0.75rem;
  color: #a0a0a0;
  margin-top: 0.75rem;
  transition: color 0.2s ease;
`;

// Enhanced hover variants for smooth, non-conflicting animations
const cardVariants = {
  initial: {
    scale: 1,
    y: 0,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
  },
  hover: {
    scale: 1.02,
    y: -6,
    borderColor: 'rgba(139, 92, 246, 0.5)',
    boxShadow: '0 12px 24px rgba(0, 0, 0, 0.15), 0 0 30px rgba(139, 92, 246, 0.25)',
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
      mass: 0.8,
    },
  },
  tap: {
    scale: 0.98,
    y: -2,
    transition: {
      type: 'spring',
      stiffness: 400,
      damping: 25,
    },
  },
};

interface TrendingTokenCardProps {
  token: ITrendingToken;
}

const TrendingTokenCard: React.FC<TrendingTokenCardProps> = ({ token }) => {
  const navigate = useNavigate();
  const { addTemporaryToken } = useCrypto();

  const handleClick = () => {
    console.log(`🔥 [TRENDING_CARD_CLICK] User clicked trending token: ${token.symbol} (${token.id}). Using addTemporaryToken for session-only viewing.`);
    
    // Add the token temporarily for chart viewing (does not persist to user's collection)
    addTemporaryToken({
      symbol: token.symbol.toUpperCase(),
      id: token.id,
      name: token.name,
      image: token.image
    });
    
    navigate('/chart', {
      state: {
        cryptoId: token.symbol.toUpperCase(),
        currency: 'USD',
        from: 'trending', // Track navigation source
      },
    });
  };

  const isPositive = token.price_change_percentage_24h >= 0;

  return (
    <CardWrapper
      onClick={handleClick}
      variants={cardVariants}
      initial="initial"
      whileHover="hover"
      whileTap="tap"
    >
      <TokenInfo>
        <TokenIcon src={token.image} alt={token.name} />
        <div>
          <TokenName>
            {token.name}
            <TokenSymbol>{token.symbol}</TokenSymbol>
          </TokenName>
        </div>
      </TokenInfo>
      <PriceInfo>
        ${token.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
      </PriceInfo>
      <ChangeBadge $isPositive={isPositive}>
        {isPositive ? '▲' : '▼'} {token.price_change_percentage_24h.toFixed(2)}%
      </ChangeBadge>
      <VolumeInfo>
        24h Vol: ${token.total_volume.toLocaleString()}
      </VolumeInfo>
    </CardWrapper>
  );
};

export default TrendingTokenCard; 