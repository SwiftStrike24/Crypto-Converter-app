import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useCrypto } from '../context/CryptoContext';
import { FiArrowLeft, FiTrash2, FiTrash } from 'react-icons/fi';
import DefaultTokensDisplay from '../components/DefaultTokensDisplay';
import { DEFAULT_TOKEN_SYMBOLS } from '../constants/cryptoConstants';

const PageContainer = styled(motion.div)`
  height: 100vh;
  width: 100vw;
  background: radial-gradient(ellipse at bottom, #111111 0%, #030305 100%);
  color: white;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  position: relative;
  z-index: 10;
`;

const HeaderContent = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
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

const ClearAllButton = styled(motion.button)`
  background: linear-gradient(145deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.25));
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  cursor: pointer;
  padding: 10px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  font-weight: 500;
  font-size: 0.9rem;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);

  &:hover:not(:disabled) {
    background: linear-gradient(145deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.35));
    border-color: rgba(239, 68, 68, 0.5);
    color: #fecaca;
    transform: translateY(-2px);
    box-shadow: 
      inset 0 1px 1px rgba(255, 255, 255, 0.1),
      0 4px 10px rgba(239, 68, 68, 0.2);
  }
  
  &:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    filter: grayscale(40%);
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.8rem;
  color: #e5e7eb;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0,0,0,0.3);
`;

const TokensContainer = styled(motion.div)`
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 8px;
    
    &:hover {
      background: #444;
    }
  }
`;

const CustomTokensList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto 24px;
  width: 100%;
  background: rgba(28, 28, 40, 0.5);
  border-radius: 16px;
  padding: 16px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
`;

const TokenItem = styled(motion.div)`
  padding: 16px;
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  
  &:hover {
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.05));
    transform: translateY(-2px) scale(1.01);
    border-color: rgba(255, 255, 255, 0.15);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;

const TokenInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;

  .token-symbol {
    font-weight: 500;
    margin-bottom: 2px;
    font-size: 1rem;
    color: #fff;
    white-space: nowrap;
  }

  .token-id {
    font-size: 0.8rem;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;

const DeleteButton = styled(motion.button)`
  background: transparent;
  border: 1px solid transparent;
  color: #ef4444;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    transform: scale(1.1);
    box-shadow: 0 0 8px rgba(239, 68, 68, 0.2);
  }
  
  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    color: #666;
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const Message = styled(motion.div)`
  text-align: center;
  padding: 40px;
  color: #666;
  font-size: 1.1rem;
`;

const ConfirmDialog = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 10, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
`;

const DialogContent = styled(motion.div)`
  background: linear-gradient(145deg, rgba(40, 40, 50, 0.8), rgba(25, 25, 35, 0.85));
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
`;

const DialogTitle = styled.h3`
  margin: 0 0 16px 0;
  font-size: 1.5rem;
  color: #fff;
`;

const DialogMessage = styled.p`
  margin: 0 0 24px 0;
  color: #aaa;
  line-height: 1.6;
`;

const DialogActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
`;

const DialogButton = styled(motion.button)<{ variant?: 'danger' | 'cancel' }>`
  padding: 10px 18px;
  border-radius: 10px;
  border: 1px solid;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);

  background: ${props => props.variant === 'danger' 
    ? 'linear-gradient(145deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.25))' 
    : 'linear-gradient(145deg, rgba(75, 85, 99, 0.2), rgba(55, 65, 81, 0.25))'};
  
  color: ${props => props.variant === 'danger' 
    ? '#fca5a5' 
    : '#d1d5db'};

  border-color: ${props => props.variant === 'danger' 
    ? 'rgba(239, 68, 68, 0.3)' 
    : 'rgba(75, 85, 99, 0.3)'};

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 10px ${props => props.variant === 'danger' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0,0,0,0.2)'};
    background: ${props => props.variant === 'danger' 
      ? 'linear-gradient(145deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.35))' 
      : 'linear-gradient(145deg, rgba(75, 85, 99, 0.3), rgba(55, 65, 81, 0.35))'};
    color: ${props => props.variant === 'danger' ? '#fecaca' : '#fff'};
    border-color: ${props => props.variant === 'danger' 
      ? 'rgba(239, 68, 68, 0.5)' 
      : 'rgba(75, 85, 99, 0.5)'};
  }
  
  &:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
  }
`;

const GradientHighlight = styled.div`
  position: absolute;
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.15), transparent 70%);
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
  top: -50px;
  right: -50px;
  filter: blur(20px);
`;

// For new token animations
const NewTokenBadge = styled.span`
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
  font-size: 0.7rem;
  padding: 3px 8px;
  border-radius: 20px;
  margin-left: 8px;
  animation: pulseGlow 2.5s infinite ease-in-out;

  @keyframes pulseGlow {
    0%, 100% {
      opacity: 0.7;
      box-shadow: 0 0 3px rgba(139, 92, 246, 0.2);
    }
    50% {
      opacity: 1;
      box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
    }
  }
`;

// Animation variants
const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0 }
};

const containerVariants = {
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.4, delay: 0.1 } },
  exit: { y: 20, opacity: 0 }
};

const listVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { staggerChildren: 0.05 } },
  exit: { opacity: 0 }
};

const itemVariants = {
  initial: { y: 20, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  exit: { y: -20, opacity: 0, transition: { duration: 0.2 } }
};

// Special animation for newly added tokens
const newItemVariants = {
  initial: { y: 20, opacity: 0, scale: 0.9 },
  animate: { 
    y: 0, 
    opacity: 1, 
    scale: 1,
    transition: { 
      type: 'spring', 
      stiffness: 400, 
      damping: 20
    }
  },
  exit: { y: -20, opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
};

const buttonVariants = {
  hover: { scale: 1.05 },
  tap: { scale: 0.95 }
};

const dialogVariants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
};

// --- Add Icon Styles (adapted from Converter.tsx) ---
const IconContainer = styled.div`
  width: 36px;
  height: 36px;
  position: relative;
  flex-shrink: 0;
`;

const StyledTokenIcon = styled.img`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #3a3a3a;
  object-fit: cover;
  display: block;
`;

const StyledTokenFallbackIcon = styled.div`
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #8b5cf6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  color: white;
`;
// --- End Icon Styles ---

const ManageTokens: React.FC = () => {
  const navigate = useNavigate();
  const { 
    availableCryptos, 
    getCryptoId, 
    deleteCrypto, 
    tokenMetadata // Get tokenMetadata from context
  } = useCrypto(); 
  const defaultTokens = new Set(DEFAULT_TOKEN_SYMBOLS);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [newlyAddedTokens, setNewlyAddedTokens] = useState<Set<string>>(new Set());

  const customTokens = availableCryptos.filter(symbol => !defaultTokens.has(symbol));
  
  console.log(`📋 [MANAGE_TOKENS_RENDER] Displaying ${customTokens.length} custom tokens:`, customTokens.join(', '));

  useEffect(() => {
    const handleTokensPreAdd = (e: CustomEvent) => {
      console.log('ManageTokens received token pre-add event:', e.detail);
      if (e.detail?.tokens && Array.isArray(e.detail.tokens)) {
        setNewlyAddedTokens(prev => {
          const updatedSet = new Set(prev);
          e.detail.tokens.forEach((token: string) => updatedSet.add(token));
          return updatedSet;
        });
      }
    };

    const handleTokensUpdated = (e: CustomEvent) => {
      console.log('ManageTokens received token update event (context should handle re-render):', e.detail);
    };

    const handleTokensAddComplete = (e: CustomEvent) => {
      console.log('ManageTokens received token add complete event (context should handle re-render):', e.detail);
    };

    window.addEventListener('cryptoTokensPreAdd', handleTokensPreAdd as EventListener);
    window.addEventListener('cryptoTokensUpdated', handleTokensUpdated as EventListener);
    window.addEventListener('cryptoTokensAddComplete', handleTokensAddComplete as EventListener);
    window.addEventListener('cryptoMetadataUpdated', handleTokensUpdated as EventListener);

    return () => {
      window.removeEventListener('cryptoTokensPreAdd', handleTokensPreAdd as EventListener);
      window.removeEventListener('cryptoTokensUpdated', handleTokensUpdated as EventListener);
      window.removeEventListener('cryptoTokensAddComplete', handleTokensAddComplete as EventListener);
      window.removeEventListener('cryptoMetadataUpdated', handleTokensUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    if (newlyAddedTokens.size > 0) {
      const clearTimer = setTimeout(() => {
        setNewlyAddedTokens(new Set());
      }, 5000);

      return () => clearTimeout(clearTimer);
    }
    return undefined;
  }, [newlyAddedTokens]);

  const handleBack = () => {
    navigate('/');
  };

  const handleDeleteToken = (symbol: string) => {
    if (!defaultTokens.has(symbol)) {
      deleteCrypto(symbol);
      setNewlyAddedTokens(prev => {
        const updatedSet = new Set(prev);
        updatedSet.delete(symbol);
        return updatedSet;
      });
    }
  };
  
  const handleClearAll = () => {
    setConfirmDialog(true);
  };
  
  const confirmClearAll = () => {
    customTokens.forEach(symbol => {
      deleteCrypto(symbol);
    });
    setConfirmDialog(false);
    setNewlyAddedTokens(new Set());
  };
  
  const isNewlyAdded = useCallback((symbol: string): boolean => {
    return newlyAddedTokens.has(symbol);
  }, [newlyAddedTokens]);

  // Simple error handler for icons within this component
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.style.display = 'none'; // Hide broken image
    // Attempt to show a sibling fallback icon if available
    const fallback = img.nextElementSibling as HTMLElement;
    if (fallback && fallback.classList.contains('fallback-icon')) {
      fallback.style.display = 'flex';
    }
  };
  
  return (
    <PageContainer 
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      key="manage-tokens"
    >
      <GradientHighlight />
      <Header>
        <HeaderContent>
          <BackButton onClick={handleBack}>
            <FiArrowLeft size={24} />
          </BackButton>
          <Title>Manage Custom Tokens</Title>
        </HeaderContent>
        <HeaderActions>
          <ClearAllButton
            onClick={handleClearAll}
            disabled={customTokens.length === 0}
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <FiTrash size={16} />
            Clear All
          </ClearAllButton>
        </HeaderActions>
      </Header>

      <TokensContainer
        variants={containerVariants}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <CustomTokensList>
          {customTokens.length > 0 ? (
            <motion.div variants={listVariants}>
              <AnimatePresence>
                {customTokens.map(symbol => {
                  // Get crypto ID and image URL
                  const id = getCryptoId(symbol);
                  const imageUrl = id ? tokenMetadata[id]?.image : null;
                  
                  return (
                    <TokenItem
                      key={`token-${symbol}-${isNewlyAdded(symbol) ? 'new' : 'existing'}`}
                      variants={isNewlyAdded(symbol) ? newItemVariants : itemVariants}
                      layout
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      style={{
                        boxShadow: isNewlyAdded(symbol) 
                          ? '0 0 0 1px rgba(139, 92, 246, 0.3), 0 4px 12px rgba(139, 92, 246, 0.15)' 
                          : undefined,
                        borderColor: isNewlyAdded(symbol) 
                          ? 'rgba(139, 92, 246, 0.2)' 
                          : undefined
                      }}
                    >
                      {/* Icon Section */}
                      <IconContainer>
                        {imageUrl ? (
                          <>
                            <StyledTokenIcon 
                              src={imageUrl} 
                              alt={`${symbol} icon`}
                              onError={handleImageError} 
                            />
                            {/* Hidden fallback for error case */}
                            <StyledTokenFallbackIcon 
                              className="fallback-icon" 
                              style={{ display: 'none', position: 'absolute', top: 0, left: 0 }}
                            >
                              {symbol.charAt(0).toUpperCase()}
                            </StyledTokenFallbackIcon>
                          </>
                        ) : (
                          <StyledTokenFallbackIcon className="fallback-icon">
                            {symbol.charAt(0).toUpperCase()}
                          </StyledTokenFallbackIcon>
                        )}
                      </IconContainer>
                      
                      {/* Info Section */}
                      <TokenInfo>
                        <div className="token-symbol">
                          {symbol}
                          {isNewlyAdded(symbol) && (
                            <NewTokenBadge>NEW</NewTokenBadge>
                          )}
                        </div>
                        <div className="token-id">{id || 'Loading...'}</div>
                      </TokenInfo>
                      
                      {/* Delete Button */}
                      <DeleteButton
                        onClick={() => handleDeleteToken(symbol)}
                        title="Delete token"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <FiTrash2 size={20} />
                      </DeleteButton>
                    </TokenItem>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          ) : (
            <Message
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.2 } }}
            >
              No custom tokens added yet.
              <br />
              <br />
              Click the + button to add new tokens.
            </Message>
          )}
        </CustomTokensList>
        <DefaultTokensDisplay />
      </TokensContainer>
      
      <AnimatePresence>
        {confirmDialog && (
          <ConfirmDialog
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
          >
            <DialogContent variants={dialogVariants}>
              <DialogTitle>Clear All Custom Tokens</DialogTitle>
              <DialogMessage>
                Are you sure you want to remove all custom tokens? This action cannot be undone.
              </DialogMessage>
              <DialogActions>
                <DialogButton 
                  onClick={() => setConfirmDialog(false)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Cancel
                </DialogButton>
                <DialogButton 
                  variant="danger"
                  onClick={confirmClearAll}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Clear All
                </DialogButton>
              </DialogActions>
            </DialogContent>
          </ConfirmDialog>
        )}
      </AnimatePresence>
    </PageContainer>
  );
};

export default ManageTokens;
