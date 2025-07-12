import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import { FiArrowLeft, FiSearch, FiInfo, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelectedTokens } from '../hooks/useSelectedTokens';
import { useTokenSearch } from '../hooks/useTokenSearch';
import { SearchResultsList } from '../components/SearchResultsList';
import { SelectedTokensDisplay } from '../components/SelectedTokensDisplay';

const PageContainer = styled.div`
  height: 100vh;
  width: 100vw;
  background: radial-gradient(ellipse at bottom, #111111 0%, #030305 100%);
  color: white;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
  box-sizing: border-box;

  @media (max-width: 768px) {
    padding: 16px;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0.75rem 1rem;
  background: rgba(28, 28, 40, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 
    inset 0 1px 1px rgba(255, 255, 255, 0.05),
    0 4px 12px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
`;

const BackButton = styled.button`
  background: linear-gradient(145deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05));
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  cursor: pointer;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);

  &:hover {
    background: linear-gradient(145deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.1));
    transform: translateY(-2px);
    color: #ddd6fe;
    border-color: rgba(139, 92, 246, 0.3);
    box-shadow: 
      inset 0 1px 1px rgba(255, 255, 255, 0.08),
      0 4px 8px rgba(0, 0, 0, 0.2),
      0 0 10px rgba(139, 92, 246, 0.3);
  }
  
  &:active {
    transform: translateY(0) scale(0.98);
    box-shadow: inset 0 2px 2px rgba(0, 0, 0, 0.1);
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.8rem;
  color: #e5e7eb;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0,0,0,0.3);
  
  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const ContentContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  flex: 1;
  overflow-y: auto;
  padding-bottom: 100px;
  
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.1);
    border-radius: 8px;
    border: 2px solid transparent;
    background-clip: content-box;
    
    &:hover {
      background: rgba(255,255,255,0.2);
    }
  }
  
  @media (max-width: 768px) {
    padding-bottom: 120px;
    gap: 18px;
  }
  
  @media (max-width: 480px) {
    padding-bottom: 100px;
    gap: 16px;
  }
`;

const SearchContainer = styled.div`
  position: relative;
  width: 100%;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: #8b5cf6;
  opacity: 0.6;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 16px 16px 16px 52px;
  border-radius: 12px;
  border: 1px solid rgba(139, 92, 246, 0.25);
  background: rgba(28, 28, 40, 0.7);
  color: white;
  font-size: 16px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  
  &:focus {
    outline: none;
    border-color: rgba(139, 92, 246, 0.5);
    background: rgba(35, 35, 50, 0.7);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
  }

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
`;

const ApiStatusIndicator = styled.div<{ $status: 'available' | 'limited' | 'unavailable' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: ${props => 
    props.$status === 'available' ? '#4ade80' : 
    props.$status === 'limited' ? '#fbbf24' : 
    '#ef4444'};
  margin-top: 8px;
  padding-left: 4px;
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: ${props => 
      props.$status === 'available' ? '#4ade80' : 
      props.$status === 'limited' ? '#fbbf24' : 
      '#ef4444'};
  }
`;

const ApiErrorMessage = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 87, 87, 0.1);
  border: 1px solid rgba(255, 87, 87, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  
  .error-icon { color: #ff5757; flex-shrink: 0; }
  .error-text { font-size: 0.9rem; color: #ff9494; flex: 1; }
  .retry-button {
    background: none; border: none; color: #8b5cf6; cursor: pointer;
    padding: 8px; display: flex; align-items: center; justify-content: center;
    border-radius: 50%; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    &:hover { 
      background: rgba(139, 92, 246, 0.1); 
      transform: scale(1.1);
    }
    &:active {
      transform: scale(1);
    }
  }
`;

const InfoBanner = styled(motion.div)`
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;

  .info-icon { color: #8b5cf6; flex-shrink: 0; }
  .info-text { font-size: 0.9rem; color: #bbb; }
`;

const ScrollIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  color: #666;
  font-size: 0.8rem;
  margin-top: 4px;
  opacity: 0.8;
  
  svg {
    margin-left: 4px;
    animation: bounce 1.5s infinite;
  }
  
  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-5px); }
    60% { transform: translateY(-3px); }
  }
  
  @media (max-width: 480px) {
    font-size: 0.75rem;
    padding: 6px 0;
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 16px;
  width: 100%;
  padding: 16px 24px;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(28, 28, 40, 0.6);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 20;
  box-sizing: border-box;
  border-top: 1px solid rgba(139, 92, 246, 0.25);
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.2);
  
  @media (max-width: 480px) {
    padding: 12px 16px;
    gap: 12px;
  }
`;

const Button = styled.button<{ $primary?: boolean }>`
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);

  ${props => props.$primary ? css`
    background: linear-gradient(145deg, #8b5cf6, #7c3aed);
    color: white;
    border-color: rgba(167, 139, 250, 0.5);
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    
    &:hover:not(:disabled) {
      background: linear-gradient(145deg, #9f7aea, #8b5cf6);
      border-color: rgba(167, 139, 250, 0.7);
      box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
    }
  ` : css`
    background: linear-gradient(145deg, rgba(75, 85, 99, 0.2), rgba(55, 65, 81, 0.25));
    color: #d1d5db;
    border-color: rgba(75, 85, 99, 0.3);

    &:hover:not(:disabled) {
      background: linear-gradient(145deg, rgba(75, 85, 99, 0.3), rgba(55, 65, 81, 0.35));
      border-color: rgba(75, 85, 99, 0.5);
      color: white;
    }
  `}

  &:hover:not(:disabled) {
    transform: translateY(-2px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: grayscale(40%);
    transform: none;
    box-shadow: none;
  }
  
  @media (max-width: 480px) {
    padding: 14px 10px;
    font-size: 14px;
    gap: 4px;
  }
`;

const ButtonSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 1s linear infinite;
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const AddTokens: React.FC = () => {
  const { 
    selectedCryptos, 
    toggleCryptoSelection, 
    removeSelectedCrypto,
    clearAllTokens
  } = useSelectedTokens();
  
  const { 
    searchTerm, 
    results, 
    isSearching,
    error: searchError,
    apiStatus,
    retrySearch,
    handleSearchChange
  } = useTokenSearch();

  const [isAdding, setIsAdding] = useState(false);
  
  const { addCryptos, checkAndUpdateMissingIcons, availableCryptos } = useCrypto();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/');
  };

  const handleAddTokens = async () => {
    const tokensToAdd = Array.from(selectedCryptos.values()).map(crypto => ({ 
      symbol: crypto.symbol, 
      id: crypto.id 
    }));

    if (tokensToAdd.length === 0) return;

    setIsAdding(true);
    try {
      window.dispatchEvent(new CustomEvent('cryptoTokensPreAdd', { 
        detail: { tokens: tokensToAdd.map(t => t.symbol.toUpperCase()) } 
      }));
      await addCryptos(tokensToAdd);
      setTimeout(async () => {
        await checkAndUpdateMissingIcons();
        window.dispatchEvent(new CustomEvent('cryptoTokensAddComplete', {
          detail: { tokens: tokensToAdd.map(t => t.symbol.toUpperCase()) }
        }));
        setTimeout(checkAndUpdateMissingIcons, 2000);
      }, 500);
      navigate('/');
    } catch (error) {
      console.error('Failed to add tokens:', error);
      alert('Failed to add tokens. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={handleBack} aria-label="Go back">
          <FiArrowLeft size={24} />
        </BackButton>
        <Title>Add New Tokens</Title>
      </Header>
      
      <ContentContainer>
        <AnimatePresence>
          {selectedCryptos.size > 0 && (
            <InfoBanner
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            >
              <FiInfo className="info-icon" size={20} />
              <span className="info-text">
                {selectedCryptos.size} token{selectedCryptos.size !== 1 ? 's' : ''} selected. Ready to add?
              </span>
            </InfoBanner>
          )}
        </AnimatePresence>
        
        <SelectedTokensDisplay 
          selectedCryptos={selectedCryptos} 
          onRemoveToken={removeSelectedCrypto}
          onClearAll={clearAllTokens}
        />
        
        <SearchContainer>
          <SearchIcon><FiSearch size={20} /></SearchIcon>
          <SearchInput
            type="text"
            placeholder="Search tokens by name or symbol..."
            value={searchTerm}
            onChange={handleSearchChange}
            autoFocus
            aria-label="Search for tokens"
          />
          <ApiStatusIndicator $status={apiStatus}>
            <div className="status-dot"></div>
            <span>
              {apiStatus === 'available' ? `API: OK` : 
               apiStatus === 'limited' ? 'API Limit Reached' : 'API Fallback'}
            </span>
          </ApiStatusIndicator>
        </SearchContainer>

        <AnimatePresence>
          {searchError && (
            <ApiErrorMessage 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            >
              <FiAlertTriangle className="error-icon" size={20} />
              <span className="error-text">{searchError}</span>
              <button 
                className="retry-button"
                onClick={retrySearch}
                title="Retry search"
              >
                <FiRefreshCw size={16} />
              </button>
            </ApiErrorMessage>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {apiStatus === 'unavailable' && !searchError && (
            <InfoBanner
               initial={{ opacity: 0, y: -10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            >
              <FiInfo className="info-icon" size={20} />
              <span className="info-text">
                Using alternative data source. Results may be limited.
              </span>
            </InfoBanner>
          )}
        </AnimatePresence>

        <SearchResultsList
          results={results}
          isSearching={isSearching}
          searchTerm={searchTerm}
          selectedCryptos={selectedCryptos}
          onToggleSelection={toggleCryptoSelection}
          existingTokens={new Set(availableCryptos.map(t => t.toUpperCase()))}
        />
        
        {results.length > 3 && (
           <ScrollIndicator>
             Scroll for more
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
          $primary 
          onClick={handleAddTokens}
          disabled={selectedCryptos.size === 0 || isAdding}
          aria-label={`Add ${selectedCryptos.size} tokens`}
        >
          {isAdding ? (
            <><ButtonSpinner /> Adding...</>
          ) : (
            <>Add {selectedCryptos.size} Token{selectedCryptos.size !== 1 ? 's' : ''}</>
          )}
        </Button>
      </ButtonContainer>
    </PageContainer>
  );
};

export default AddTokens;
