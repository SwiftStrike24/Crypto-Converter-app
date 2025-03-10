import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import debounce from 'lodash/debounce';
import { FiCheck, FiArrowLeft, FiX, FiSearch, FiPlus, FiInfo } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const PageContainer = styled.div`
  min-height: 600px;
  width: 100%;
  max-width: 800px;
  background: rgba(18, 18, 18, 0.95);
  color: white;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  backdrop-filter: blur(10px);
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  overflow: auto;
  box-sizing: border-box;
  height: auto;
  max-height: 100vh;
  margin: 0 auto;
  
  @media (max-width: 768px) {
    padding: 16px;
    width: 100vw;
    left: 0;
    transform: none;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: sticky;
  top: 0;
  background: rgba(18, 18, 18, 0.95);
  backdrop-filter: blur(10px);
  z-index: 20;
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
  
  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 16px 16px 16px 48px;
  border-radius: 12px;
  border: 1px solid #333;
  background: #2a2a2a;
  color: white;
  font-size: 16px;
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

const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  padding-bottom: 100px;
  flex: 1;
  
  @media (max-width: 768px) {
    padding-bottom: 120px;
    gap: 18px;
  }
  
  @media (max-width: 480px) {
    padding-bottom: 100px;
    gap: 16px;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.2rem;
  color: #888;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
`;

const TokenCount = styled.span`
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
  padding: 4px 10px;
  border-radius: 100px;
  font-size: 0.9rem;
  font-weight: 500;
`;

const ClearAllButton = styled.button`
  background: none;
  border: none;
  color: #666;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  
  &:hover {
    color: #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SelectedTokensContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  min-height: 60px;
  max-height: 100px;
  overflow-y: auto;
  padding: 4px;
  
  /* Add a scrollbar indicator when there are many tokens */
  border-radius: 8px;
  
  /* Show a subtle border when scrollable */
  &::-webkit-scrollbar {
    width: 6px;
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
  
  /* Responsive adjustments */
  @media (max-width: 768px) {
    max-height: 90px;
  }
`;

const SelectedToken = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 100px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  margin-bottom: 4px;

  img {
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }

  .token-symbol {
    font-weight: 500;
    color: #8b5cf6;
  }

  .remove-button {
    background: none;
    border: none;
    color: #8b5cf6;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(139, 92, 246, 0.2);
    }
  }
  
  /* Responsive adjustments */
  @media (max-width: 480px) {
    padding: 6px 10px;
    
    img {
      width: 20px;
      height: 20px;
    }
    
    .token-symbol {
      font-size: 0.9rem;
    }
  }
`;

const ResultsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #1a1a1a;
  border-radius: 16px;
  padding: 16px;
  max-height: 180px;
  min-height: 180px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;

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
  
  @media (max-width: 768px) {
    max-height: 160px;
    min-height: 160px;
  }
  
  @media (max-width: 480px) {
    max-height: 140px;
    min-height: 140px;
    padding: 12px;
    gap: 8px;
  }
  
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: linear-gradient(to top, rgba(26, 26, 26, 0.9), rgba(26, 26, 26, 0));
    pointer-events: none;
    opacity: 0.8;
    border-bottom-left-radius: 16px;
    border-bottom-right-radius: 16px;
  }
`;

const ScrollIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  color: #666;
  font-size: 0.8rem;
  margin-top: 4px;
  
  svg {
    margin-left: 4px;
    animation: bounce 1.5s infinite;
  }
  
  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-5px);
    }
    60% {
      transform: translateY(-3px);
    }
  }
  
  @media (max-width: 480px) {
    font-size: 0.75rem;
    padding: 6px 0;
  }
`;

const CryptoItem = styled(motion.div)<{ isSelected: boolean }>`
  padding: 14px;
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
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #2a2a2a;
    padding: 2px;
  }

  .crypto-info {
    flex: 1;
    
    .crypto-name {
      font-weight: 500;
      margin-bottom: 4px;
      font-size: 1rem;
      color: ${props => props.isSelected ? '#8b5cf6' : '#fff'};
    }
    
    .crypto-symbol {
      font-size: 0.85rem;
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
  
  @media (max-width: 480px) {
    padding: 12px 10px;
    gap: 12px;
    
    img {
      width: 36px;
      height: 36px;
    }
    
    .crypto-info {
      .crypto-name {
        font-size: 0.95rem;
      }
      
      .crypto-symbol {
        font-size: 0.8rem;
      }
    }
  }
`;

const SkeletonItem = styled(motion.div)`
  padding: 16px;
  border-radius: 12px;
  background: #2a2a2a;
  display: flex;
  align-items: center;
  gap: 16px;
  
  .skeleton-image {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }
  
  .skeleton-content {
    flex: 1;
    
    .skeleton-title {
      width: 70%;
      height: 16px;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    }
    
    .skeleton-subtitle {
      width: 40%;
      height: 12px;
      background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 4px;
    }
  }
  
  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
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
  width: 100%;
  padding: 16px;
  position: fixed;
  bottom: 0;
  left: 0;
  background: rgba(18, 18, 18, 0.95);
  backdrop-filter: blur(10px);
  z-index: 20;
  max-width: 800px;
  box-sizing: border-box;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
  
  @media (min-width: 800px) {
    left: 50%;
    transform: translateX(-50%);
  }
  
  @media (max-width: 480px) {
    padding: 12px;
    gap: 8px;
    max-width: 100%;
    left: 0;
    transform: none;
  }
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  &:hover {
    transform: translateY(-1px);
    background: ${props => props.primary ? '#7c3aed' : '#333'};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  
  /* Responsive adjustments */
  @media (max-width: 480px) {
    padding: 14px 10px;
    font-size: 14px;
    gap: 4px;
  }
`;

const EmptySelection = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 60px;
  color: #666;
  font-size: 0.9rem;
  border: 1px dashed #333;
  border-radius: 12px;
`;

const InfoBanner = styled(motion.div)`
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  
  .info-icon {
    color: #8b5cf6;
    flex-shrink: 0;
  }
  
  .info-text {
    font-size: 0.9rem;
    color: #bbb;
  }
`;

const ButtonSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
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
  const [selectedCryptos, setSelectedCryptos] = useState<Map<string, CryptoResult>>(new Map());
  const [isSearching, setIsSearching] = useState(false);
  const { addCryptos } = useCrypto();
  const navigate = useNavigate();

  const searchCryptos = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setIsSearching(true);
      
      const response = await fetch(
        `https://api.coingecko.com/api/v3/search?query=${query}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch cryptocurrencies');
      }

      const data = await response.json();
      setResults(data.coins.slice(0, 5).map((coin: any) => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        image: coin.thumb
      })));
    } finally {
      setLoading(false);
      setTimeout(() => {
        setIsSearching(false);
      }, 300);
    }
  };

  const debouncedSearch = useCallback(
    debounce((term: string) => searchCryptos(term), 300),
    []
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    if (value.trim()) {
      setIsSearching(true);
    }
    
    debouncedSearch(value);
  };

  const toggleCryptoSelection = (crypto: CryptoResult) => {
    setSelectedCryptos(prev => {
      const newMap = new Map(prev);
      if (newMap.has(crypto.id)) {
        newMap.delete(crypto.id);
      } else {
        newMap.set(crypto.id, crypto);
      }
      return newMap;
    });
  };

  const removeSelectedCrypto = (id: string) => {
    setSelectedCryptos(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  };

  const handleBack = () => {
    navigate('/');
  };

  const handleAddTokens = async () => {
    try {
      // Create an array of all tokens to add
      const tokensToAdd = Array.from(selectedCryptos.values()).map(crypto => ({
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

  const clearAllTokens = () => {
    setSelectedCryptos(new Map());
  };

  // Clear search results when no search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setResults([]);
    }
  }, [searchTerm]);

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={handleBack} aria-label="Go back">
          <FiArrowLeft size={24} />
        </BackButton>
        <Title>Add Tokens</Title>
      </Header>
      
      <ContentContainer>
        <AnimatePresence>
          {selectedCryptos.size > 0 && (
            <InfoBanner
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <FiInfo className="info-icon" size={20} />
              <span className="info-text">
                You've selected {selectedCryptos.size} token{selectedCryptos.size !== 1 ? 's' : ''}. Click "Add Tokens" when you're ready.
              </span>
            </InfoBanner>
          )}
        </AnimatePresence>
        
        <SectionHeader>
          <SectionTitle>
            Selected Tokens <TokenCount>{selectedCryptos.size}</TokenCount>
          </SectionTitle>
          {selectedCryptos.size > 0 && (
            <ClearAllButton 
              onClick={clearAllTokens}
              title="Clear all selected tokens"
              aria-label="Clear all selected tokens"
            >
              Clear All
            </ClearAllButton>
          )}
        </SectionHeader>
        
        <SelectedTokensContainer>
          <AnimatePresence>
            {selectedCryptos.size > 0 ? (
              Array.from(selectedCryptos.values()).map(crypto => (
                <SelectedToken
                  key={crypto.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout
                >
                  <img src={crypto.image} alt={crypto.name} />
                  <span className="token-symbol">{crypto.symbol}</span>
                  <button 
                    className="remove-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSelectedCrypto(crypto.id);
                    }}
                    title={`Remove ${crypto.symbol}`}
                    aria-label={`Remove ${crypto.symbol}`}
                  >
                    <FiX size={16} />
                  </button>
                </SelectedToken>
              ))
            ) : (
              <EmptySelection>
                No tokens selected yet
              </EmptySelection>
            )}
          </AnimatePresence>
        </SelectedTokensContainer>
        
        <SearchContainer>
          <SearchIcon>
            <FiSearch size={20} />
          </SearchIcon>
          <SearchInput
            type="text"
            placeholder="Search for tokens..."
            value={searchTerm}
            onChange={handleSearch}
            autoFocus
            aria-label="Search for tokens"
          />
        </SearchContainer>

        <ResultsContainer>
          {loading ? (
            <>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.05 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.1 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
            </>
          ) : results.length > 0 ? (
            <AnimatePresence>
              {results.map((crypto, index) => (
                <CryptoItem
                  key={crypto.id}
                  isSelected={selectedCryptos.has(crypto.id)}
                  onClick={() => toggleCryptoSelection(crypto)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    transition: { delay: index * 0.05 }
                  }}
                  exit={{ opacity: 0, y: -20 }}
                  layout
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <img src={crypto.image} alt={crypto.name} />
                  <div className="crypto-info">
                    <div className="crypto-name">{crypto.name}</div>
                    <div className="crypto-symbol">{crypto.symbol}</div>
                  </div>
                  {selectedCryptos.has(crypto.id) ? (
                    <FiCheck className="check-icon" size={24} />
                  ) : (
                    <FiPlus className="check-icon" size={24} />
                  )}
                </CryptoItem>
              ))}
            </AnimatePresence>
          ) : isSearching ? (
            <>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.05 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
              <SkeletonItem 
                initial={{ opacity: 0, y: 20 }}
                animate={{ 
                  opacity: 1, 
                  y: 0,
                  transition: { delay: 0.1 }
                }}
              >
                <div className="skeleton-image" />
                <div className="skeleton-content">
                  <div className="skeleton-title" />
                  <div className="skeleton-subtitle" />
                </div>
              </SkeletonItem>
            </>
          ) : searchTerm ? (
            <Message>No tokens found</Message>
          ) : (
            <Message>Start typing to search for tokens</Message>
          )}
        </ResultsContainer>
        
        {results.length > 2 && (
          <ScrollIndicator>
            Scroll for more tokens
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 7L12 17" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 12L12 17L7 12" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </ScrollIndicator>
        )}
      </ContentContainer>

      <ButtonContainer>
        <Button onClick={handleBack} aria-label="Cancel and go back">
          Cancel
        </Button>
        <Button 
          primary 
          onClick={handleAddTokens}
          disabled={selectedCryptos.size === 0 || loading}
          aria-label={`Add ${selectedCryptos.size} tokens`}
        >
          {loading ? (
            <>
              <ButtonSpinner />
              Adding...
            </>
          ) : (
            <>
              Add Token{selectedCryptos.size !== 1 ? 's' : ''} ({selectedCryptos.size})
            </>
          )}
        </Button>
      </ButtonContainer>
    </PageContainer>
  );
};

export default AddTokens;
