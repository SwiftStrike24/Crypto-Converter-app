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
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    transform: translateY(-4px);
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2), 0 0 20px rgba(139, 92, 246, 0.2);
  }
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
`;

const TokenName = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: #e0e0e0;
`;

const TokenSymbol = styled.span`
  font-size: 0.8rem;
  color: #a0a0a0;
  margin-left: 0.25rem;
  text-transform: uppercase;
`;

const PriceInfo = styled.div`
  font-size: 1.25rem;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 0.5rem;
`;

const ChangeBadge = styled.div<{ $isPositive: boolean }>`
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  color: ${props => (props.$isPositive ? '#16a34a' : '#dc2626')};
  background-color: ${props => (props.$isPositive ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)')};
  display: inline-block;
`;

const VolumeInfo = styled.div`
  font-size: 0.75rem;
  color: #a0a0a0;
  margin-top: 0.75rem;
`;

interface TrendingTokenCardProps {
  token: ITrendingToken;
}

const TrendingTokenCard: React.FC<TrendingTokenCardProps> = ({ token }) => {
  const navigate = useNavigate();
  const { addCryptos } = useCrypto();

  const handleClick = () => {
    // Add the token to the global context to ensure its ID is available on the chart page
    addCryptos([{ symbol: token.symbol.toUpperCase(), id: token.id }]);
    
    navigate('/chart', {
      state: {
        cryptoId: token.symbol.toUpperCase(),
        currency: 'USD',
        from: 'trending', // Add information about where we came from
      },
    });
  };

  const isPositive = token.price_change_percentage_24h >= 0;

  return (
    <CardWrapper
      onClick={handleClick}
      whileHover={{ scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
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