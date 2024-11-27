import React, { useCallback, useEffect, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { CryptoChart } from './CryptoChart';
import FocusTrap from 'focus-trap-react';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
  animation: ${fadeIn} 0.2s ease-out;
  -webkit-app-region: no-drag;
`;

const ModalContent = styled.div`
  background: #242424;
  padding: 20px;
  border-radius: 12px;
  width: 90%;
  max-width: 900px;
  position: relative;
  border: 1px solid rgba(255, 255, 255, 0.1);
  animation: ${slideUp} 0.3s ease-out;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  -webkit-app-region: no-drag;
  
  @media (max-width: 768px) {
    width: 95%;
    padding: 15px;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  right: 15px;
  top: 15px;
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  z-index: 1002;
  transition: all 0.2s ease;
  padding: 8px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  -webkit-app-region: no-drag;

  &:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
    transform: scale(1.05);
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px #2196f3;
  }

  &:active {
    transform: scale(0.95);
  }

  @media (max-width: 768px) {
    width: 32px;
    height: 32px;
    font-size: 20px;
  }
`;

interface ChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cryptoId: string;
  currency: string;
}

export const ChartModal: React.FC<ChartModalProps> = ({ 
  isOpen, 
  onClose, 
  cryptoId, 
  currency 
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleCloseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <FocusTrap>
      <ModalOverlay 
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-modal-title"
      >
        <ModalContent 
          ref={modalRef}
          onClick={e => e.stopPropagation()}
        >
          <CloseButton 
            onClick={handleCloseClick}
            aria-label="Close chart"
          >
            ×
          </CloseButton>
          <CryptoChart 
            cryptoId={cryptoId} 
            currency={currency} 
          />
        </ModalContent>
      </ModalOverlay>
    </FocusTrap>
  );
}; 