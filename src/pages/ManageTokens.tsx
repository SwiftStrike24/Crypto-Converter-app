import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import { FiArrowLeft, FiTrash2 } from 'react-icons/fi';

const PageContainer = styled.div`
  min-height: 100vh;
  width: 100vw;
  background: rgba(18, 18, 18, 0.95);
  color: white;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  backdrop-filter: blur(10px);
  position: fixed;
  top: 0;
  left: 0;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(139, 92, 246, 0.1);
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2rem;
  color: #ffffff;
  font-weight: 600;
`;

const TokensContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  background: #1a1a1a;
  border-radius: 16px;
  padding: 16px;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
    border-radius: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 8px;
    
    &:hover {
      background: #444;
    }
  }
`;

const TokenItem = styled.div`
  padding: 16px;
  border-radius: 12px;
  background: #2a2a2a;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s ease;
  
  &:hover {
    background: #333;
    transform: translateY(-1px);
  }
`;

const TokenInfo = styled.div`
  flex: 1;
  
  .token-symbol {
    font-weight: 500;
    margin-bottom: 4px;
    font-size: 1.1rem;
    color: #fff;
  }
  
  .token-id {
    font-size: 0.9rem;
    color: #888;
  }
`;

const DeleteButton = styled.button`
  background: none;
  border: none;
  color: #ef4444;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  &:disabled {
    color: #666;
    cursor: not-allowed;
  }
`;

const Message = styled.div`
  text-align: center;
  padding: 40px;
  color: #666;
  font-size: 1.1rem;
`;

const ManageTokens: React.FC = () => {
  const navigate = useNavigate();
  const { availableCryptos, getCryptoId, deleteCrypto } = useCrypto();
  const defaultTokens = new Set(['BTC', 'ETH', 'SOL', 'USDC', 'XRP']);

  // Filter out default tokens
  const customTokens = availableCryptos.filter(symbol => !defaultTokens.has(symbol));

  const handleBack = () => {
    navigate('/');
  };

  const handleDeleteToken = (symbol: string) => {
    if (!defaultTokens.has(symbol)) {
      deleteCrypto(symbol);
    }
  };

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={handleBack}>
          <FiArrowLeft size={24} />
        </BackButton>
        <Title>Manage Custom Tokens</Title>
      </Header>

      <TokensContainer>
        {customTokens.length > 0 ? (
          customTokens.map(symbol => (
            <TokenItem key={symbol}>
              <TokenInfo>
                <div className="token-symbol">{symbol}</div>
                <div className="token-id">{getCryptoId(symbol)}</div>
              </TokenInfo>
              <DeleteButton
                onClick={() => handleDeleteToken(symbol)}
                title="Delete token"
              >
                <FiTrash2 size={20} />
              </DeleteButton>
            </TokenItem>
          ))
        ) : (
          <Message>
            No custom tokens added yet.
            <br />
            <br />
            Click the + button to add new tokens.
          </Message>
        )}
      </TokensContainer>
    </PageContainer>
  );
};

export default ManageTokens; 