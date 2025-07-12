import React from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheck, FiPlus } from 'react-icons/fi';
import { ICryptoResult } from '../hooks/useTokenSearch'; // Assuming ICryptoResult is exported from here

// --- Styled Components (Copied from AddTokens.tsx, consider consolidating later) ---

const ResultsContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 8px; // Slightly reduced gap for a tighter 3-item fit
  background: #212121; // Slightly darker background
  border-radius: 10px; // Match item radius
  padding: 8px; // Reduced padding
  // Recalculated height for exactly 3 items
  // Item height ~68px (padding 12*2 + content ~44) + gap 8px = 76px
  // 3 items = 3 * 68 = 204px
  // 2 gaps = 2 * 8 = 16px
  // Padding = 2 * 8 = 16px
  // Total = 204 + 16 + 16 = 236px
  max-height: 236px; 
  min-height: 100px; // Lower min-height, okay if less than 3 results
  overflow-y: auto;
  border: 1px solid #333; // Slightly darker border
  position: relative;

  /* Nicer scrollbar */
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
  &::-webkit-scrollbar-thumb { background: #555; border-radius: 3px; }
  &::-webkit-scrollbar-thumb:hover { background: #666; }
  
  /* Adjust responsive heights */
  @media (max-width: 768px) { max-height: 236px; } // Keep 3 items
  @media (max-width: 480px) { max-height: 236px; padding: 6px; gap: 6px; } // Keep 3 items, adjust padding/gap
  
  /* Bottom fade */
  &::after { 
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 20px; // Shorter fade
    background: linear-gradient(to top, rgba(33, 33, 33, 1), rgba(33, 33, 33, 0)); // Match background
    pointer-events: none;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
   }
`;

const CryptoItem = styled(motion.div)<{ isSelected: boolean; isAdded: boolean }>`
  padding: 12px 14px; // Adjusted padding
  border-radius: 8px; // Slightly less round
  cursor: ${props => props.isAdded ? 'not-allowed' : 'pointer'};
  display: flex;
  align-items: center;
  gap: 12px; 
  background: ${props => props.isSelected ? 'rgba(139, 92, 246, 0.2)' : '#2b2b2b'};
  transition: background 0.1s ease-out, border-color 0.1s ease-out, opacity 0.2s ease;
  border: 1px solid ${props => props.isSelected ? 'rgba(139, 92, 246, 0.45)' : '#383838'};
  position: relative; 
  overflow: hidden; 
  flex-shrink: 0;
  opacity: ${props => props.isAdded ? 0.5 : 1};
  
  &:hover {
    background: ${props => 
      props.isAdded ? (props.isSelected ? 'rgba(139, 92, 246, 0.2)' : '#2b2b2b') : 
      props.isSelected ? 'rgba(139, 92, 246, 0.25)' : '#363636'}; 
    border-color: ${props => 
      props.isAdded ? (props.isSelected ? 'rgba(139, 92, 246, 0.45)' : '#383838') :
      props.isSelected ? 'rgba(139, 92, 246, 0.6)' : '#4d4d4d'}; 
  }

  img {
    width: 32px; // Slightly smaller image
    height: 32px;
    border-radius: 50%;
    background: #3a3a3a; 
    padding: 0; // No padding needed if bg is set
    flex-shrink: 0;
  }

  .crypto-info {
    flex: 1;
    min-width: 0; 
    .crypto-name {
      font-weight: 500;
      margin-bottom: 2px; 
      font-size: 0.95rem; 
      color: ${props => props.isSelected ? '#d1c4e9' : '#e0e0e0'}; // Softer colors
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .crypto-symbol {
      font-size: 0.8rem; 
      color: ${props => props.isSelected ? 'rgba(179, 157, 219, 0.8)' : '#757575'}; // Softer colors
      text-transform: uppercase;
    }
  }
  
  .status-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: auto;
    padding-left: 6px;
    flex-shrink: 0;
  }

  .check-icon {
    color: #b39ddb; // Softer purple
    opacity: ${props => props.isSelected ? 1 : 0};
    transform: ${props => props.isSelected ? 'scale(1)' : 'scale(0.6)'}; // Start smaller
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); 
  }
  
  // Remove media query for simplicity or adjust if needed for extreme small screens
`;

const AddedBadge = styled.div`
  font-size: 0.75rem;
  font-weight: 500;
  color: #a78bfa;
  background: rgba(139, 92, 246, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(139, 92, 246, 0.2);
`;

const SkeletonItem = styled(motion.div)`
  padding: 12px 14px; // Match CryptoItem
  border-radius: 8px;
  background: #2b2b2b;
  border: 1px solid #383838;
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0.4; // More transparent
  flex-shrink: 0;
  height: 60px; // Approximate height of CryptoItem
  
  .skeleton-image {
    width: 32px; // Match CryptoItem
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(90deg, #3a3a3a 25%, #4a4a4a 50%, #3a3a3a 75%);
    background-size: 200% 100%;
    animation: shimmer 1.6s infinite linear; // Slightly faster
    flex-shrink: 0;
  }
  .skeleton-content {
    flex: 1;
    .skeleton-title {
      width: 60%; 
      height: 14px; 
      margin-bottom: 5px;
      background: linear-gradient(90deg, #3a3a3a 25%, #4a4a4a 50%, #3a3a3a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.6s infinite linear;
      border-radius: 4px;
    }
    .skeleton-subtitle {
      width: 30%; 
      height: 10px; 
      background: linear-gradient(90deg, #3a3a3a 25%, #4a4a4a 50%, #3a3a3a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.6s infinite linear;
      border-radius: 4px;
    }
  }
  
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

const Message = styled(motion.div)`
  text-align: center;
  padding: 30px 20px; // Adjusted padding
  color: #777; // Slightly lighter color
  font-size: 0.9rem; 
  min-height: 100px; 
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column; // Allow for potential icon later
  gap: 8px;
`;

// --- Component Props Interface ---

interface SearchResultsListProps {
  results: ICryptoResult[];
  isSearching: boolean;
  searchTerm: string;
  selectedCryptos: Map<string, ICryptoResult>;
  onToggleSelection: (crypto: ICryptoResult) => void;
  existingTokens: Set<string>;
}

// --- Individual Result Item (Memoized + ForwardRef) ---

interface CryptoResultItemProps {
  crypto: ICryptoResult;
  isSelected: boolean;
  isAdded: boolean;
  onToggleSelection: (crypto: ICryptoResult) => void;
  index: number; 
}

// Wrap the functional component with forwardRef FIRST, then memo
const CryptoResultItem = React.memo(React.forwardRef<HTMLDivElement, CryptoResultItemProps>(
  ({ crypto, isSelected, isAdded, onToggleSelection, index }, ref) => {
    return (
      <CryptoItem
        ref={ref} 
        isSelected={isSelected}
        isAdded={isAdded}
        onClick={() => !isAdded && onToggleSelection(crypto)}
        variants={{
          // Slightly faster animations
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0, transition: { delay: index * 0.04, duration: 0.25, ease: "easeOut" } }, 
          exit: { opacity: 0, x: -15, transition: { duration: 0.15, ease: "easeIn" } } 
        }}
        initial="hidden"
        animate="visible"
        exit="exit"
        layout="position"
        whileHover={{ scale: 1.02, transition: { duration: 0.1 } }} // Faster hover
        whileTap={{ scale: 0.98 }}
      >
        <img 
          src={crypto.image} 
          alt={crypto.name}
          loading="lazy"
          onError={(e) => { 
            (e.target as HTMLImageElement).src = `https://via.placeholder.com/32/3a3a3a/757575?text=${crypto.symbol.charAt(0)}`; // Updated placeholder
          }}
        />
        <div className="crypto-info">
          <div className="crypto-name" title={crypto.name}>{crypto.name}</div>
          <div className="crypto-symbol">{crypto.symbol}</div>
        </div>
        <motion.div layout className="status-icon-container">
          {isAdded ? (
            <AddedBadge>Added</AddedBadge>
          ) : isSelected ? (
            <FiCheck className="check-icon" size={18} /> // Slightly smaller icon
          ) : (
            <FiPlus className="check-icon" size={18} />
          )}
        </motion.div>
      </CryptoItem>
    );
  }
));

// --- Main Search Results List Component ---

const listContainerVariants = {
  hidden: { opacity: 0 },
  // Faster stagger children overall
  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.05 } }, 
};

export const SearchResultsList: React.FC<SearchResultsListProps> = ({ 
  results, 
  isSearching, 
  searchTerm, 
  selectedCryptos, 
  onToggleSelection,
  existingTokens
}) => {
  const renderContent = () => {
    if (isSearching) {
      // Ensure skeleton matches item height
      return [
        <SkeletonItem key="skel-1" initial={{ opacity: 0 }} animate={{ opacity: 0.4, transition: { delay: 0.05 } }} />, 
        <SkeletonItem key="skel-2" initial={{ opacity: 0 }} animate={{ opacity: 0.4, transition: { delay: 0.1 } }} />, 
        <SkeletonItem key="skel-3" initial={{ opacity: 0 }} animate={{ opacity: 0.4, transition: { delay: 0.15 } }} />
      ];
    }

    if (results.length > 0) {
      return (
        <AnimatePresence mode="popLayout" initial={false}> 
          {results.map((crypto, index) => (
            <CryptoResultItem
              key={crypto.id} 
              crypto={crypto}
              isSelected={selectedCryptos.has(crypto.id)}
              isAdded={existingTokens.has(crypto.symbol.toUpperCase())}
              onToggleSelection={onToggleSelection}
              index={index}
            />
          ))}
        </AnimatePresence>
      );
    }

    const messageVariants = {
      hidden: { opacity: 0, y: 10 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    };

    if (searchTerm) {
      return <Message variants={messageVariants} initial="hidden" animate="visible">No tokens found for "{searchTerm}"</Message>;
    }

    return <Message variants={messageVariants} initial="hidden" animate="visible">Start typing to search...</Message>;
  };

  return (
    <ResultsContainer 
       variants={listContainerVariants}
       initial="hidden"
       animate="visible"
       layout
    >
      {renderContent()}
    </ResultsContainer>
  );
}; 