import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import { searchCoinGecko, RequestPriority } from '../services/crypto/cryptoApiService'; // Import optimized search
import debounce from 'lodash/debounce';
import { FiCheck, FiAlertTriangle } from 'react-icons/fi';

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

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(220, 38, 38, 0.1);
  color: #ef4444;
  margin-bottom: 16px;
  font-size: 0.9rem;

  svg {
    flex-shrink: 0;
  }
`;

const PopularTokensSection = styled.div`
  margin-top: 8px;
  
  h3 {
    font-size: 1rem;
    color: #888;
    margin-bottom: 12px;
    font-weight: 500;
  }
  
  .tokens-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }
`;

const PopularTokenChip = styled.div<{ isSelected: boolean }>`
  padding: 8px 12px;
  border-radius: 8px;
  background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.15)' : '#2a2a2a'};
  border: 1px solid ${props => props.isSelected ? 'rgba(139, 92, 246, 0.3)' : 'transparent'};
  color: ${props => props.isSelected ? '#8b5cf6' : '#fff'};
  font-size: 0.85rem;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.2)' : '#333'};
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

// Popular tokens to show for quick selection
const POPULAR_TOKENS: CryptoResult[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', image: 'https://assets.coingecko.com/coins/images/1/thumb/bitcoin.png' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', image: 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png' },
  { id: 'solana', symbol: 'SOL', name: 'Solana', image: 'https://assets.coingecko.com/coins/images/4128/thumb/solana.png' },
  { id: 'cardano', symbol: 'ADA', name: 'Cardano', image: 'https://assets.coingecko.com/coins/images/975/thumb/cardano.png' },
  { id: 'ripple', symbol: 'XRP', name: 'XRP', image: 'https://assets.coingecko.com/coins/images/44/thumb/xrp-symbol-white-128.png' },
  { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', image: 'https://assets.coingecko.com/coins/images/12171/thumb/polkadot.png' },
  { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', image: 'https://assets.coingecko.com/coins/images/5/thumb/dogecoin.png' },
  { id: 'shiba-inu', symbol: 'SHIB', name: 'Shiba Inu', image: 'https://assets.coingecko.com/coins/images/11939/thumb/shiba.png' }
];

// Optimized search constants for maximum throughput
const SEARCH_DEBOUNCE_DELAY = 300; // Increased from 150ms for less aggressive searching

const AddCryptoModal: React.FC<AddCryptoModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<CryptoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCryptos, setSelectedCryptos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [addingTokens, setAddingTokens] = useState(false);
  
  const { addCryptos, isCoinGeckoRateLimitedGlobal, getCoinGeckoRetryAfterSeconds: getRetrySecondsFromContext } = useCrypto();
  
  const lastSearchTime = useRef<number>(0);
  const retryCount = useRef<number>(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const searchCryptos = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      setLoading(false); // Ensure loading is false if query is cleared
      return;
    }

    // Clear previous timeout if any
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Check global rate limit state from the service first
    if (isCoinGeckoRateLimitedGlobal) {
      const retrySeconds = getRetrySecondsFromContext();
      setError(`Search is temporarily paused due to API rate limits. Please try again in ${retrySeconds > 0 ? retrySeconds + 's' : 'later'}.`); // Provide more user-friendly message
      setLoading(false);
      // Optionally, schedule a retry after the cooldown, or let user retry manually
      // For now, we'll just inform the user.
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Use optimized search service with HIGH priority for user searches
      const data = await searchCoinGecko(query, RequestPriority.HIGH);
      
      lastSearchTime.current = Date.now(); // Still useful for local component logic if any
      retryCount.current = 0; // Reset local retry count on successful call initiation
            
      const processedResults = data.coins
        .slice(0, 20) 
        .map((coin: any) => ({
          id: coin.id,
          symbol: coin.symbol.toUpperCase(),
          name: coin.name,
          image: coin.large || coin.thumb 
        }));
      
      setResults(processedResults);
    } catch (err: any) {
      console.error('Search error in AddCryptoModal:', err);
      // The error from searchCoinGecko (via fetchWithSmartRetry) should be more informative
      // if it's a rate limit error, it would have been caught by isCoinGeckoApiRateLimited() pre-check ideally
      // or fetchWithSmartRetry would throw a specific error.
      if (err.message && (err.message.includes('rate limit') || err.message.includes('429'))) {
        const retrySeconds = getRetrySecondsFromContext();
        setError(`Search rate limit hit. Please wait ${retrySeconds > 0 ? retrySeconds + 's' : 'a moment'} and try again.`);
      } else {
        setError('Failed to search cryptocurrencies. Please check your connection or try again.');
      }
      setResults([]); // Clear results on error
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearch = useCallback(
    debounce((term: string) => searchCryptos(term), SEARCH_DEBOUNCE_DELAY),
    []
  );

  useEffect(() => {
    if (isOpen) {
      debouncedSearch(searchTerm);
    }
    return () => {
      debouncedSearch.cancel();
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, debouncedSearch, isOpen]);

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

  // Batch add selected tokens
  const handleAddSelected = async () => {
    if (selectedCryptos.size === 0) return;
    
    setAddingTokens(true);
    
    try {
      // Prepare tokens for batch addition
      const tokensToAdd = Array.from(selectedCryptos)
        .map(cryptoId => {
          // First check search results
          const fromResults = results.find(r => r.id === cryptoId);
          if (fromResults) {
            return { symbol: fromResults.symbol, id: fromResults.id };
          }
          
          // Then check popular tokens
          const fromPopular = POPULAR_TOKENS.find(t => t.id === cryptoId);
          if (fromPopular) {
            return { symbol: fromPopular.symbol, id: fromPopular.id };
          }
          
          return null;
        })
        .filter(Boolean) as { symbol: string; id: string }[];
      
      // Use batch addition
      await addCryptos(tokensToAdd);
      
      // Close modal after successful addition
      handleClose();
    } catch (err) {
      console.error('Error adding tokens:', err);
      setError('Failed to add tokens. Please try again.');
    } finally {
      setAddingTokens(false);
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSelectedCryptos(new Set());
    setError(null);
    setResults([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={handleClose}>
      <ModalContent onClick={e => e.stopPropagation()}>
        <h2>Add Cryptocurrencies</h2>
        
        {error && (
          <ErrorMessage>
            <FiAlertTriangle size={16} />
            {error}
          </ErrorMessage>
        )}
        
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

        <PopularTokensSection>
          <h3>Popular Tokens</h3>
          <div className="tokens-grid">
            {POPULAR_TOKENS.map(token => (
              <PopularTokenChip
                key={token.id}
                isSelected={selectedCryptos.has(token.id)}
                onClick={() => toggleCryptoSelection(token)}
              >
                {token.symbol}
              </PopularTokenChip>
            ))}
          </div>
        </PopularTokensSection>

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
            onClick={handleAddSelected}
            disabled={selectedCryptos.size === 0 || addingTokens}
          >
            {addingTokens ? 'Adding...' : selectedCryptos.size > 0 ? `Add ${selectedCryptos.size} Token${selectedCryptos.size !== 1 ? 's' : ''}` : 'Add Tokens'}
          </Button>
        </ButtonsContainer>
      </ModalContent>
    </ModalOverlay>
  );
};

export default AddCryptoModal;
