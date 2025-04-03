import React from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCopy } from 'react-icons/fi';
import { ICryptoResult } from '../hooks/useSelectedTokens'; // Use hook interface

// --- Styled Components (Moved from AddTokens.tsx) ---

const SectionContainer = styled(motion.div)`
  /* Optional: Add container animations if needed */
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 8px; // Add some space below the header
`;

const SectionTitle = styled.h2`
  font-size: 1.2rem;
  color: #888;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TokenCount = styled(motion.span)`
  background: rgba(139, 92, 246, 0.2);
  color: #8b5cf6;
  padding: 4px 10px;
  border-radius: 100px;
  font-size: 0.9rem;
  font-weight: 500;
  display: inline-block;
`;

const ClearAllButton = styled(motion.button)`
  background: none;
  border: none;
  color: #666;
  font-size: 0.9rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
  
  &:hover:not(:disabled) {
    color: #c4b5fd;
    background: rgba(139, 92, 246, 0.15);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SelectedTokensContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 54px;
  max-height: 110px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 10px;
  background: #1f1f1f;
  border: 1px solid #2f2f2f;
  
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }
  &::-webkit-scrollbar-thumb:hover { background: #555; }
`;

const SelectedToken = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 16px;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.35);
  margin-bottom: 4px;
  color: #c4b5fd;
  cursor: default;

  img {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .token-symbol {
    font-weight: 500;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .remove-button {
    background: none;
    border: none;
    color: #a78bfa;
    cursor: pointer;
    padding: 2px;
    margin-left: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.15s ease;
    flex-shrink: 0;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ede9fe;
    }
  }
`;

const EmptySelection = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 54px;
  color: #666;
  font-size: 0.9rem;
  border: 1px dashed #333;
  border-radius: 12px;
`;

// --- Component Props Interface ---

interface SelectedTokensDisplayProps {
  selectedCryptos: Map<string, ICryptoResult>;
  onRemoveToken: (id: string) => void;
  onClearAll: () => void;
}

// --- Main Component ---

export const SelectedTokensDisplay: React.FC<SelectedTokensDisplayProps> = ({ 
  selectedCryptos, 
  onRemoveToken, 
  onClearAll 
}) => {
  const hasSelection = selectedCryptos.size > 0;

  return (
    <div> {/* Wrap in a div to group header and container */}
      <SectionHeader>
        <SectionTitle>
          Selected <TokenCount>{selectedCryptos.size}</TokenCount>
        </SectionTitle>
        <ClearAllButton 
          onClick={onClearAll} 
          disabled={!hasSelection}
          title="Clear all selected tokens"
          aria-label="Clear all selected tokens"
        >
          Clear All
        </ClearAllButton>
      </SectionHeader>
      
      <SelectedTokensContainer>
        {!hasSelection ? (
          <EmptySelection>Tokens you select will appear here</EmptySelection>
        ) : (
          <AnimatePresence initial={false}> {/* Prevents initial animation on load */}
            {Array.from(selectedCryptos.values()).map(crypto => (
              <SelectedToken
                key={crypto.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                layout // Smooth transition when items are added/removed
              >
                <img 
                  src={crypto.image} 
                  alt={crypto.name} 
                  loading="lazy" 
                  onError={(e) => { 
                    (e.target as HTMLImageElement).src = `https://via.placeholder.com/20/3a3a3a/888?text=${crypto.symbol.charAt(0)}`; 
                  }}
                />
                <span className="token-symbol">{crypto.symbol}</span>
                <button 
                  className="remove-button"
                  onClick={(e) => { 
                    e.stopPropagation(); // Prevent potential parent clicks
                    onRemoveToken(crypto.id); 
                  }}
                  title={`Remove ${crypto.symbol}`}
                  aria-label={`Remove ${crypto.symbol}`}
                >
                  <FiX size={14} />
                </button>
              </SelectedToken>
            ))}
          </AnimatePresence>
        )}
      </SelectedTokensContainer>
    </div>
  );
}; 