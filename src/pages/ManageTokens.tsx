import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useCrypto } from '../context/CryptoContext';
import { FiArrowLeft, FiTrash2, FiTrash } from 'react-icons/fi';

const PageContainer = styled(motion.div)`
  min-height: 100vh;
  width: 100vw;
  background: linear-gradient(135deg, rgba(18, 18, 18, 0.97), rgba(26, 26, 28, 0.95));
  color: white;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  backdrop-filter: blur(10px);
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
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
    transform: scale(1.05);
  }
  
  &:active {
    transform: scale(0.95);
  }
`;

const ClearAllButton = styled(motion.button)`
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  cursor: pointer;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 12px;
  transition: all 0.2s ease;
  font-weight: 500;
  font-size: 0.9rem;

  &:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
  }
  
  &:active {
    transform: scale(0.95);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: rgba(239, 68, 68, 0.05);
    border-color: rgba(239, 68, 68, 0.1);
  }
`;

const Title = styled.h1`
  margin: 0;
  font-size: 2rem;
  color: #ffffff;
  font-weight: 600;
`;

const TokensContainer = styled(motion.div)`
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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);

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

const TokenItem = styled(motion.div)`
  padding: 16px;
  border-radius: 12px;
  background: #2a2a2a;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.03);
  
  &:hover {
    background: #333;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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

const DeleteButton = styled(motion.button)`
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
    transform: scale(1.1);
  }
  
  &:active {
    transform: scale(0.9);
  }

  &:disabled {
    color: #666;
    cursor: not-allowed;
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
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

const DialogContent = styled(motion.div)`
  background: #242424;
  border-radius: 16px;
  padding: 24px;
  width: 90%;
  max-width: 400px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
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
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  background: ${props => props.variant === 'danger' 
    ? 'rgba(239, 68, 68, 0.1)' 
    : 'rgba(75, 85, 99, 0.1)'};
  
  color: ${props => props.variant === 'danger' 
    ? '#ef4444' 
    : '#9ca3af'};
  
  border: 1px solid ${props => props.variant === 'danger' 
    ? 'rgba(239, 68, 68, 0.3)' 
    : 'rgba(75, 85, 99, 0.2)'};

  &:hover {
    background: ${props => props.variant === 'danger' 
      ? 'rgba(239, 68, 68, 0.15)' 
      : 'rgba(75, 85, 99, 0.15)'};
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(1px);
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
  animation: pulse 2s infinite;
  
  @keyframes pulse {
    0% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.6;
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

const ManageTokens: React.FC = () => {
  const navigate = useNavigate();
  const { availableCryptos, getCryptoId, deleteCrypto } = useCrypto();
  const defaultTokens = new Set(['BTC', 'ETH', 'SOL', 'USDC', 'XRP']);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0);
  
  // Add refs for keeping track of newly added tokens
  const newlyAddedTokens = useRef<Set<string>>(new Set());
  const lastUpdateTime = useRef<number>(Date.now());

  // Filter out default tokens
  const customTokens = availableCryptos.filter(symbol => !defaultTokens.has(symbol));

  // Listen for token update events
  useEffect(() => {
    const handleTokensPreAdd = (e: CustomEvent) => {
      console.log('ManageTokens received token pre-add event:', e.detail);
      
      // Mark tokens as newly added
      if (e.detail?.tokens && Array.isArray(e.detail.tokens)) {
        e.detail.tokens.forEach((token: string) => {
          newlyAddedTokens.current.add(token);
        });
      }
      
      // Force UI to refresh
      setForceUpdate(prev => prev + 1);
    };
    
    const handleTokensUpdated = (e: CustomEvent) => {
      console.log('ManageTokens received token update event:', e.detail);
      
      // Force UI to refresh
      setForceUpdate(prev => prev + 1);
      lastUpdateTime.current = Date.now();
    };
    
    const handleTokensAddComplete = (e: CustomEvent) => {
      console.log('ManageTokens received token add complete event:', e.detail);
      
      // Force a final refresh after tokens are fully added
      setTimeout(() => {
        setForceUpdate(prev => prev + 1);
      }, 100);
    };
    
    // Add event listeners for token updates
    window.addEventListener('cryptoTokensPreAdd', handleTokensPreAdd as EventListener);
    window.addEventListener('cryptoTokensUpdated', handleTokensUpdated as EventListener);
    window.addEventListener('cryptoTokensAddComplete', handleTokensAddComplete as EventListener);
    window.addEventListener('cryptoMetadataUpdated', handleTokensUpdated as EventListener);
    
    // Clean up event listeners on unmount
    return () => {
      window.removeEventListener('cryptoTokensPreAdd', handleTokensPreAdd as EventListener);
      window.removeEventListener('cryptoTokensUpdated', handleTokensUpdated as EventListener);
      window.removeEventListener('cryptoTokensAddComplete', handleTokensAddComplete as EventListener);
      window.removeEventListener('cryptoMetadataUpdated', handleTokensUpdated as EventListener);
    };
  }, []);
  
  // Clear newly added tokens markers after a delay
  useEffect(() => {
    if (newlyAddedTokens.current.size > 0) {
      const clearTimer = setTimeout(() => {
        newlyAddedTokens.current.clear();
        setForceUpdate(prev => prev + 1);
      }, 5000);
      
      return () => clearTimeout(clearTimer);
    }
  }, [forceUpdate]);

  const handleBack = () => {
    navigate('/');
  };

  const handleDeleteToken = (symbol: string) => {
    if (!defaultTokens.has(symbol)) {
      deleteCrypto(symbol);
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
  };
  
  // Function to check if a token was recently added
  const isNewlyAdded = (symbol: string) => {
    return newlyAddedTokens.current.has(symbol);
  };

  return (
    <PageContainer 
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      key={`manage-tokens-${forceUpdate}`}
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
        {customTokens.length > 0 ? (
          <motion.div variants={listVariants}>
            <AnimatePresence>
              {customTokens.map(symbol => (
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
                  <TokenInfo>
                    <div className="token-symbol">
                      {symbol}
                      {isNewlyAdded(symbol) && (
                        <NewTokenBadge>NEW</NewTokenBadge>
                      )}
                    </div>
                    <div className="token-id">{getCryptoId(symbol)}</div>
                  </TokenInfo>
                  <DeleteButton
                    onClick={() => handleDeleteToken(symbol)}
                    title="Delete token"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <FiTrash2 size={20} />
                  </DeleteButton>
                </TokenItem>
              ))}
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
