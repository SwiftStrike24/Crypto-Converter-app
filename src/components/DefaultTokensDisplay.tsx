import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { FiLock } from 'react-icons/fi';
import { useCrypto } from '../context/CryptoContext';
import { DEFAULT_TOKEN_SYMBOLS } from '../constants/cryptoConstants';

const SectionContainer = styled(motion.div)`
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  padding-bottom: 24px;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  color: #aaa;
  margin-bottom: 16px;
  padding-left: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 8px;
`;

const TokensGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  padding: 0 16px;
`;

const TokenCard = styled(motion.div)`
  padding: 12px;
  border-radius: 12px;
  background: #222224;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
`;

const IconContainer = styled.div`
  width: 32px;
  height: 32px;
  position: relative;
  flex-shrink: 0;
`;

const StyledTokenIcon = styled.img`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #3a3a3a;
`;

const StyledTokenFallbackIcon = styled.div`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #8b5cf6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  color: white;
`;

const TokenInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .token-symbol {
    font-weight: 500;
    font-size: 0.95rem;
    color: #fff;
  }
`;

const LockIcon = styled.div`
  color: #666;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: help;
`;

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 },
};

const DefaultTokenItem: React.FC<{ symbol: string }> = ({ symbol }) => {
  const { getCryptoId, tokenMetadata } = useCrypto();
  const id = getCryptoId(symbol);
  const imageUrl = id ? tokenMetadata[id]?.image : null;

  return (
    <TokenCard variants={itemVariants}>
      <IconContainer>
        {imageUrl ? (
          <StyledTokenIcon src={imageUrl} alt={`${symbol} icon`} />
        ) : (
          <StyledTokenFallbackIcon>
            {symbol.charAt(0).toUpperCase()}
          </StyledTokenFallbackIcon>
        )}
      </IconContainer>
      <TokenInfo>
        <span className="token-symbol">{symbol}</span>
      </TokenInfo>
      <LockIcon title="Core tokens cannot be removed.">
        <FiLock size={16} />
      </LockIcon>
    </TokenCard>
  );
};

const DefaultTokensDisplay: React.FC = () => {
  return (
    <SectionContainer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.3, duration: 0.4 } }}
    >
      <SectionTitle>Core Tokens</SectionTitle>
      <TokensGrid>
        {DEFAULT_TOKEN_SYMBOLS.map(symbol => (
          <DefaultTokenItem key={symbol} symbol={symbol} />
        ))}
      </TokensGrid>
    </SectionContainer>
  );
};

export default React.memo(DefaultTokensDisplay); 