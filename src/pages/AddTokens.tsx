import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import debounce from 'lodash/debounce';
import { FiCheck, FiArrowLeft } from 'react-icons/fi';

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

const SearchInput = styled.input`
  width: 100%;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #333;
  background: #2a2a2a;
  color: white;
  font-size: 16px;
  transition: all 0.2s ease;
  max-width: 800px;
  margin: 0 auto;
  display: block;
  
  &:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
  }

  &::placeholder {
    color: #666;
  }
`;

const ResultsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  background: #1a1a1a;
  border-radius: 16px;
  padding: 16px;
  max-height: calc(100vh - 300px);
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

const CryptoItem = styled.div<{ isSelected: boolean }>`
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 16px;
  background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.15)' : '#2a2a2a'};
  transition: all 0.2s ease;
  border: 1px solid ${props => props.isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent'};
  
  &:hover {
    background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.2)' : '#333'};
    transform: translateY(-1px);
  }

  img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #2a2a2a;
    padding: 2px;
  }

  .crypto-info {
    flex: 1;
    
    .crypto-name {
      font-weight: 500;
      margin-bottom: 4px;
      font-size: 1.1rem;
      color: ${props => props.isSelected ? '#8b5cf6' : '#fff'};
    }
    
    .crypto-symbol {
      font-size: 0.9rem;
      color: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.8)' : '#888'};
      text-transform: uppercase;
    }
  }

  .check-icon {
    color: #8b5cf6;
    opacity: ${props => props.isSelected ? 1 : 0};
    transform: ${props => props.isSelected ? 'scale(1)' : 'scale(0.8)'};
    transition: all 0.2s ease;
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 0;
  color: #8b5cf6;

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(139, 92, 246, 0.1);
    border-radius: 50%;
    border-top-color: #8b5cf6;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const Message = styled.div`
  text-align: center;
  padding: 40px;
  color: #666;
  font-size: 1.1rem;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 16px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  padding: 16px 0;
`;

const Button = styled.button<{ primary?: boolean }>`
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.primary ? '#8b5cf6' : '#2a2a2a'};
  color: ${props => props.primary ? 'white' : '#888'};

  &:hover {
    transform: translateY(-1px);
    background: ${props => props.primary ? '#7c3aed' : '#333'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

interface CryptoResult {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

const AddTokens: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CryptoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCryptos, setSelectedCryptos] = useState<Set<string>>(new Set());
  const { addCryptos } = useCrypto();
  const navigate = useNavigate();

  const searchCryptos = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${query}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch cryptocurrencies');
      }

      const data = await response.json();
      setResults(data.coins.slice(0, 10).map((coin: any) => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        image: coin.thumb
      })));
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce((term: string) => searchCryptos(term), 300),
    []
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedSearch(value);
  };

  const toggleCryptoSelection = (crypto: CryptoResult) => {
    setSelectedCryptos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(crypto.id)) {
        newSet.delete(crypto.id);
      } else {
        newSet.add(crypto.id);
      }
      return newSet;
    });
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleAddTokens = async () => {
    try {
      // Create an array of all tokens to add
      const tokensToAdd = Array.from(selectedCryptos)
        .map(cryptoId => results.find(r => r.id === cryptoId))
        .filter((crypto): crypto is CryptoResult => crypto !== undefined)
        .map(crypto => ({
          symbol: crypto.symbol,
          id: crypto.id
        }));

      if (tokensToAdd.length === 0) return;

      // Add loading state
      setLoading(true);

      // Add all tokens at once
      await addCryptos(tokensToAdd);

      // Navigate back to main page
      navigate('/');
    } catch (error) {
      console.error('Failed to add tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={handleBack}>
          <FiArrowLeft size={24} />
        </BackButton>
        <Title>Add Tokens</Title>
      </Header>
      
      <SearchInput
        type="text"
        placeholder="Search for tokens..."
        value={searchTerm}
        onChange={handleSearch}
        autoFocus
      />

      <ResultsContainer>
        {loading ? (
          <LoadingSpinner>
            <div className="spinner" />
          </LoadingSpinner>
        ) : results.length > 0 ? (
          results.map(crypto => (
            <CryptoItem
              key={crypto.id}
              isSelected={selectedCryptos.has(crypto.id)}
              onClick={() => toggleCryptoSelection(crypto)}
            >
              <img src={crypto.image} alt={crypto.name} />
              <div className="crypto-info">
                <div className="crypto-name">{crypto.name}</div>
                <div className="crypto-symbol">{crypto.symbol}</div>
              </div>
              <FiCheck className="check-icon" size={24} />
            </CryptoItem>
          ))
        ) : searchTerm ? (
          <Message>No tokens found</Message>
        ) : (
          <Message>Start typing to search for tokens</Message>
        )}
      </ResultsContainer>

      <ButtonContainer>
        <Button onClick={handleBack}>Cancel</Button>
        <Button 
          primary 
          onClick={handleAddTokens}
          disabled={selectedCryptos.size === 0}
        >
          Add Token{selectedCryptos.size !== 1 ? 's' : ''} ({selectedCryptos.size})
        </Button>
      </ButtonContainer>
    </PageContainer>
  );
};

export default AddTokens;
