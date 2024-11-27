import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import debounce from 'lodash/debounce';
import { FiCheck } from 'react-icons/fi';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  z-index: 9999;
  backdrop-filter: blur(5px);
  padding: 0;
  overflow-y: auto;
`;

const ModalContent = styled.div`
  background: #1a1a1a;
  padding: 32px;
  width: 100%;
  min-height: 100vh;
  color: white;
  display: flex;
  flex-direction: column;
  gap: 24px;
  border: none;
  box-shadow: none;
  animation: modalFadeIn 0.2s ease-out;

  @keyframes modalFadeIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  h2 {
    margin: 0;
    font-size: 2rem;
    color: #ffffff;
    font-weight: 600;
    text-align: center;
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid #333;
  background: #2a2a2a;
  color: white;
  font-size: 15px;
  transition: all 0.2s ease;
  
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
  gap: 8px;
`;

const InitialMessage = styled.div`
  text-align: center;
  padding: 20px;
  color: #666;
  font-size: 0.95rem;
`;

const ResultsList = styled.div`
  overflow-y: visible;
  max-height: none;
  margin: 0 auto;
  padding: 0;
  width: 100%;
  max-width: 800px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #2a2a2a;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: #4a4a4a;
    border-radius: 3px;
    
    &:hover {
      background: #5a5a5a;
    }
  }
`;

const CryptoItem = styled.div<{ isSelected: boolean }>`
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.15)' : 'transparent'};
  transition: all 0.2s ease;
  border: 1px solid ${props => props.isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent'};
  margin-bottom: 6px;
  position: relative;
  
  &:hover {
    background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.2)' : 'rgba(42, 42, 42, 0.5)'};
  }

  img {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #2a2a2a;
    padding: 2px;
  }

  .crypto-info {
    flex: 1;
    
    .crypto-name {
      font-weight: 500;
      margin-bottom: 3px;
      font-size: 0.95rem;
      color: ${props => props.isSelected ? '#8b5cf6' : '#fff'};
    }
    
    .crypto-symbol {
      font-size: 0.8rem;
      color: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.8)' : '#888'};
      text-transform: uppercase;
    }
  }

  .check-icon {
    position: absolute;
    right: 12px;
    color: #8b5cf6;
    opacity: ${props => props.isSelected ? 1 : 0};
    transform: ${props => props.isSelected ? 'scale(1)' : 'scale(0.8)'};;
    transition: all 0.2s ease;
  }
`;

const SelectedCount = styled.div`
  font-size: 0.9rem;
  color: #888;
  margin-top: -8px;
`;

const ButtonsContainer = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 8px;
`;

const Button = styled.button<{ variant?: 'primary' | 'secondary' }>`
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: 14px;
  transition: all 0.2s ease;
  
  ${props => props.variant === 'primary' ? `
    background: #8b5cf6;
    color: white;
    
    &:hover:not(:disabled) {
      background: #7c3aed;
    }
    
    &:disabled {
      background: #4a4a4a;
      cursor: not-allowed;
      opacity: 0.7;
    }
  ` : `
    background: #2a2a2a;
    color: #fff;
    
    &:hover {
      background: #333;
    }
  `}
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 0;
  color: #8b5cf6;
  min-height: 200px;

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

interface CryptoResult {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

interface AddCryptoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddCryptoModal: React.FC<AddCryptoModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CryptoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCryptos, setSelectedCryptos] = useState<Set<string>>(new Set());
  const { addCrypto } = useCrypto();

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

  useEffect(() => {
    debouncedSearch(searchTerm);
    return () => debouncedSearch.cancel();
  }, [searchTerm, debouncedSearch]);

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

  const handleSave = () => {
    results
      .filter(crypto => selectedCryptos.has(crypto.id))
      .forEach(crypto => {
        addCrypto(crypto.symbol);
      });
    onClose();
  };

  const handleClose = () => {
    setSearchTerm('');
    setSelectedCryptos(new Set());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={handleClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <h2>Add Cryptocurrencies</h2>
        
        <SearchInput
          type="text"
          placeholder="Search cryptocurrencies..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          autoFocus
        />

        {selectedCryptos.size > 0 && (
          <SelectedCount>
            {selectedCryptos.size} token{selectedCryptos.size !== 1 ? 's' : ''} selected
          </SelectedCount>
        )}

        <ResultsContainer>
          {loading ? (
            <LoadingSpinner>
              <div className="spinner" />
            </LoadingSpinner>
          ) : results.length > 0 ? (
            <ResultsList>
              {results.map(crypto => (
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
                  <FiCheck className="check-icon" size={20} />
                </CryptoItem>
              ))}
            </ResultsList>
          ) : searchTerm ? (
            <InitialMessage>
              No cryptocurrencies found
            </InitialMessage>
          ) : (
            <InitialMessage>
              Start typing to search for cryptocurrencies
            </InitialMessage>
          )}
        </ResultsContainer>

        <ButtonsContainer>
          <Button onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={selectedCryptos.size === 0}
          >
            Add {selectedCryptos.size > 0 ? `${selectedCryptos.size} Token${selectedCryptos.size !== 1 ? 's' : ''}` : 'Tokens'}
          </Button>
        </ButtonsContainer>
      </ModalContent>
    </ModalOverlay>
  );
};

export default AddCryptoModal;
