import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { GiPowerButton } from "react-icons/gi";
import { IoMdAdd } from "react-icons/io";
import { FiRefreshCw, FiX, FiCheck } from "react-icons/fi";
import { FiTrash2 } from "react-icons/fi";
import { useCrypto } from '../context/CryptoContext';
import AddCryptoModal from './AddCryptoModal';
import UpdateDialog from './UpdateDialog';
import { checkForUpdates } from '../services/updateService';

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
  padding: 10px 15px;
  background: rgba(0, 0, 0, 0.2);
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
  position: relative;
`;

const WindowControls = styled.div`
  -webkit-app-region: no-drag;
  display: flex;
  gap: 8px;
`;

const PowerButton = styled.button`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  background: #ff5f57;
  
  &:hover {
    background: #ff3b30;
    transform: scale(1.05);
    box-shadow: 0 0 12px rgba(255, 59, 48, 0.5);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 12px;
    height: 12px;
    color: white;
  }
`;

const UpdateButton = styled.button`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  background: #8b5cf6;
  
  &:hover {
    background: #9f7aea;
    transform: scale(1.05);
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.6);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 12px;
    height: 12px;
    color: white;
  }
`;

const IconButton = styled.button`
  -webkit-app-region: no-drag;
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 6px;
  margin-right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 6px;
  position: relative;

  &:hover {
    color: #8b5cf6;
    transform: scale(1.1);
    background: rgba(139, 92, 246, 0.1);
  }

  &:active {
    transform: scale(0.95);
  }
  
  /* Purple glow effect for buttons */
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 6px;
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  
  &:hover::after {
    opacity: 1;
    box-shadow: 0 0 12px rgba(139, 92, 246, 0.4);
    animation: iconPulse 2s infinite;
  }
  
  @keyframes iconPulse {
    0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); }
    70% { box-shadow: 0 0 0 6px rgba(139, 92, 246, 0); }
    100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
  }
`;

const IconsContainer = styled.div`
  display: flex;
  gap: 8px;
`;

const ExchangeRate = styled.div<{ $isError?: boolean }>`
  font-size: 14px;
  color: ${props => props.$isError ? '#ff4444' : '#ffffff'};
  margin-right: 10px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  transition: color 0.2s ease;
  white-space: nowrap;
  -webkit-app-region: no-drag;

  &:hover {
    color: ${props => props.$isError ? '#ff6666' : '#ffffff'};
  }

  &:hover .last-updated {
    opacity: 1;
  }
`;

const PriceChange = styled.span<{ $isPositive: boolean | null }>`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  margin-left: 6px;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);
  display: inline-flex;
  align-items: center;
  letter-spacing: 0.3px;
  
  /* Modern gradient backgrounds with depth effect */
  background: ${props => 
    props.$isPositive === null 
      ? 'rgba(255, 255, 255, 0.1)' 
      : props.$isPositive 
        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.15) 100%)' 
        : 'linear-gradient(135deg, rgba(255, 68, 68, 0.2) 0%, rgba(255, 68, 68, 0.15) 100%)'
  };
  
  /* Subtle 3D-like border effect */
  box-shadow: ${props => 
    props.$isPositive === null 
      ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)' 
      : props.$isPositive 
        ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)' 
        : 'inset 0 0 0 1px rgba(255, 68, 68, 0.2), 0 1px 2px rgba(0, 0, 0, 0.1)'
  };
  
  /* Text color and glow effect */
  color: ${props => 
    props.$isPositive === null 
      ? 'rgba(255, 255, 255, 0.6)' 
      : props.$isPositive 
        ? '#10b981' 
        : '#ff4444'
  };
  
  /* Enhanced text glow effect */
  text-shadow: ${props => 
    props.$isPositive === null 
      ? 'none' 
      : props.$isPositive 
        ? '0 0 8px rgba(16, 185, 129, 0.4)' 
        : '0 0 8px rgba(255, 68, 68, 0.4)'
  };
  
  /* Hover effect for interactive feel */
  &:hover {
    transform: translateY(-1px);
    box-shadow: ${props => 
      props.$isPositive === null 
        ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.15)' 
        : props.$isPositive 
          ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.3), 0 2px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(16, 185, 129, 0.2)' 
          : 'inset 0 0 0 1px rgba(255, 68, 68, 0.3), 0 2px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(255, 68, 68, 0.2)'
    };
  }
  
  /* Pulse animation on data refresh with enhanced glow */
  animation: ${props => 
    props.$isPositive !== null 
      ? 'pricePulse 1.5s ease-out' 
      : 'none'
  };
  
  /* Subtle shimmer effect */
  &::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(
      circle, 
      ${props => 
        props.$isPositive === null
          ? 'rgba(255, 255, 255, 0.1)'
          : props.$isPositive
            ? 'rgba(16, 185, 129, 0.1)'
            : 'rgba(255, 68, 68, 0.1)'
      } 0%, 
      transparent 70%
    );
    opacity: 0;
    transform: rotate(30deg);
    animation: shimmer 3s linear infinite;
  }
  
  @keyframes pricePulse {
    0% { 
      transform: scale(0.95); 
      opacity: 0.7; 
      filter: brightness(0.9);
    }
    50% { 
      transform: scale(1.05); 
      opacity: 1; 
      filter: brightness(1.1);
      box-shadow: ${props => 
        props.$isPositive === null 
          ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 2px 4px rgba(0, 0, 0, 0.15)' 
          : props.$isPositive 
            ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.3), 0 2px 4px rgba(0, 0, 0, 0.15), 0 0 16px rgba(16, 185, 129, 0.3)' 
            : 'inset 0 0 0 1px rgba(255, 68, 68, 0.3), 0 2px 4px rgba(0, 0, 0, 0.15), 0 0 16px rgba(255, 68, 68, 0.3)'
      };
    }
    100% { 
      transform: scale(1); 
      opacity: 1; 
      filter: brightness(1);
    }
  }
  
  @keyframes shimmer {
    0% { opacity: 0; transform: translateX(-100%) rotate(30deg); }
    20% { opacity: 0.3; }
    30% { opacity: 0.5; }
    40% { opacity: 0.3; }
    60% { opacity: 0; }
    100% { opacity: 0; transform: translateX(100%) rotate(30deg); }
  }
`;

const LoadingDot = styled.div`
  width: 8px;
  height: 8px;
  background-color: #8b5cf6;
  border-radius: 50%;
  animation: pulse 1.5s infinite;

  @keyframes pulse {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
  }
`;

const RetryButton = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
  margin-left: 8px;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: #9f7aea;
    background: rgba(139, 92, 246, 0.1);
    box-shadow: 0 0 8px rgba(139, 92, 246, 0.4);
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(0) scale(0.95);
  }
`;

const LastUpdated = styled.span`
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  opacity: 0;
  transition: opacity 0.2s ease;
`;

// --- Tooltip Styles ---
const Tooltip = styled.div<{
    $position: 'top' | 'bottom';
}>`
  position: absolute;
  padding: 8px 12px;
  background: rgba(25, 25, 35, 0.95);
  color: #f0f0f0;
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(139, 92, 246, 0.15);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(139, 92, 246, 0.2);
  z-index: 1001;
  line-height: 1.4;
  transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s 0.3s;
  letter-spacing: 0.3px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;

  /* Position Above/Below */
  ${props => props.$position === 'top' && css`
    bottom: calc(100% + 8px);
    &::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border-width: 5px;
      border-style: solid;
      border-color: rgba(25, 25, 35, 0.95) transparent transparent transparent;
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1));
    }
  `}
  ${props => props.$position === 'bottom' && css`
    top: calc(100% + 8px);
     &::after {
       content: '';
       position: absolute;
       bottom: 100%;
       left: 50%;
       transform: translateX(-50%);
       border-width: 5px;
       border-style: solid;
       border-color: transparent transparent rgba(25, 25, 35, 0.95) transparent;
       filter: drop-shadow(0 -1px 1px rgba(0, 0, 0, 0.1));
    }
  `}
`;

// Wrapper to control hover state for tooltips
const HoverButtonWrapper = styled.div<{
    $tooltipVisible: boolean;
    $tooltipPosition: 'top' | 'bottom';
    $tooltipStyle: React.CSSProperties;
}>`
  position: relative;
  display: inline-flex;
  z-index: 10;
  transition: transform 0.2s ease;

  &:hover {
    transform: translateY(-1px);
  }

  ${Tooltip} {
      opacity: ${props => props.$tooltipVisible ? 1 : 0};
      visibility: ${props => props.$tooltipVisible ? 'visible' : 'hidden'};
      transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s ${props => props.$tooltipVisible ? '0s' : '0.3s'};
      z-index: ${props => props.$tooltipVisible ? (props.className?.includes('control-button') ? 9999 : 1001) : -1};

      // Apply transform directly from the style state
      transform: ${props => props.$tooltipStyle.transform || 'translateX(-50%) translateY(4px)'};

      // Purple glow effect, etc. (remain the same)
      box-shadow: ${props => props.$tooltipVisible
        ? '0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2)'
        : '0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(139, 92, 246, 0.15)'
      };

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0) 60%);
        border-radius: 6px;
        opacity: ${props => props.$tooltipVisible ? 1 : 0};
        transition: opacity 0.3s ease;
        z-index: -1;
      }
  }

  &:hover ${Tooltip} {
    animation: ${props => props.$tooltipVisible ? 'tooltipPulse 2s infinite' : 'none'};
  }

  @keyframes tooltipPulse {
    0% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2); }
    50% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 16px rgba(139, 92, 246, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.3); }
    100% { box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 8px rgba(139, 92, 246, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2); }
  }
`;
// --- End Tooltip Styles ---


// --- Styles for the Update Check Tooltip (Restyled) ---
const UpdateTooltipContainer = styled.div<{ $isVisible: boolean }>`
  position: absolute;
  top: 40px;
  right: 10px;
  width: 220px;
  background: rgba(25, 25, 35, 0.95);
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.2);
  color: #f0f0f0;
  z-index: 1000;
  opacity: ${props => props.$isVisible ? 1 : 0};
  visibility: ${props => props.$isVisible ? 'visible' : 'hidden'};
  transform: ${props => props.$isVisible ? 'translateY(0)' : 'translateY(-10px)'};
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  font-size: 12px;
  backdrop-filter: blur(8px);
  letter-spacing: 0.2px;
  
  /* Purple glow effect when visible */
  ${props => props.$isVisible && css`
    animation: updateTooltipPulse 3s infinite;
    
    @keyframes updateTooltipPulse {
      0% { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2); }
      50% { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(139, 92, 246, 0.3), 0 0 0 1px rgba(139, 92, 246, 0.3); }
      100% { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(139, 92, 246, 0.2); }
    }
  `}
`;

const UpdateTooltipTitle = styled.div`
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #8b5cf6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(139, 92, 246, 0.15);
  padding-bottom: 8px;
`;

const UpdateTooltipContent = styled.div`
  font-size: 12px;
  line-height: 1.6;
  color: rgba(240, 240, 240, 0.9);
`;

const UpdateCloseButton = styled.button`
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  padding: 6px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(139, 92, 246, 0.15);
    transform: scale(1.1);
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.4);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const UpdateTooltipIcon = styled.div<{ $type: 'success' | 'error' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${props => props.$type === 'success' ? '#10b981' : '#ff4444'};
  color: white;
  margin-right: 8px;
  flex-shrink: 0;
  box-shadow: 0 0 8px ${props => props.$type === 'success' ? 'rgba(16, 185, 129, 0.6)' : 'rgba(255, 68, 68, 0.6)'};
  
  /* Inner glow effect */
  position: relative;
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 4px ${props => props.$type === 'success' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.4)'};
  }
`;

const UpdateTooltipHeader = styled.div`
  display: flex;
  align-items: center;
`;
// --- End Update Check Tooltip Styles ---


const UpdateButtonSpinner = styled.div`
  animation: spin 1s linear infinite;
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  
  /* Add subtle glow effect when spinning */
  svg {
    filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.6));
  }
`;

interface HeaderProps {
  selectedCrypto: string;
  selectedFiat: string;
}

interface TooltipState {
  visible: boolean;
  position: 'top' | 'bottom';
  style: React.CSSProperties;
}

const Header: React.FC<HeaderProps> = ({ selectedCrypto, selectedFiat }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateTooltipVisible, setUpdateTooltipVisible] = useState(false);
  const [updateTooltipMessage, setUpdateTooltipMessage] = useState('');
  const [updateTooltipType, setUpdateTooltipType] = useState<'success' | 'error'>('success');
  const updateTooltipTimeoutRef = useRef<number | null>(null);
  const { prices, loading, error, lastUpdated, updatePrices, isPending } = useCrypto();

  // State for individual tooltip visibility and position
  const [tooltipState, setTooltipState] = useState<Record<string, TooltipState>>({
    add: { visible: false, position: 'top', style: {} },
    manage: { visible: false, position: 'top', style: {} },
    update: { visible: false, position: 'top', style: {} },
    quit: { visible: false, position: 'top', style: {} },
  });

  // Refs for tooltips
  const addTooltipRef = useRef<HTMLDivElement>(null);
  const manageTooltipRef = useRef<HTMLDivElement>(null);
  const updateHoverTooltipRef = useRef<HTMLDivElement>(null);
  const quitTooltipRef = useRef<HTMLDivElement>(null);

  const tooltipRefs: Record<string, React.RefObject<HTMLDivElement>> = {
      add: addTooltipRef,
      manage: manageTooltipRef,
      update: updateHoverTooltipRef,
      quit: quitTooltipRef
  };

  // Debounce timer ref
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback((key: string) => {
    if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
    }

    hoverTimeoutRef.current = setTimeout(() => {
        const buttonWrapper = tooltipRefs[key]?.current?.closest('.button-wrapper-class');
        const tooltipElement = tooltipRefs[key]?.current;

        if (!buttonWrapper || !tooltipElement) return;

        // Ensure tooltip is rendered to get offsetWidth
        tooltipElement.style.position = 'absolute'; // Position relative to wrapper for offsetWidth
        tooltipElement.style.visibility = 'hidden'; // Keep hidden during measurement
        tooltipElement.style.opacity = '0';

        requestAnimationFrame(() => {
            const tooltipWidth = tooltipElement.offsetWidth;
            const tooltipHeight = tooltipElement.offsetHeight;
            const buttonRect = buttonWrapper.getBoundingClientRect();
            const container = document.getElementById('root') ?? document.body;
            const containerRect = container.getBoundingClientRect();

            // --- Vertical Positioning (remains the same) ---
            let preferredPosition: 'top' | 'bottom' = 'top';
            const spaceAbove = buttonRect.top - containerRect.top;
            const spaceBelow = containerRect.bottom - buttonRect.bottom;
            const tooltipHeightWithGap = tooltipHeight + 10;

            if (tooltipHeightWithGap > spaceAbove && tooltipHeightWithGap <= spaceBelow) {
                preferredPosition = 'bottom';
            } else if (tooltipHeightWithGap > spaceAbove && tooltipHeightWithGap > spaceBelow) {
                preferredPosition = spaceBelow > spaceAbove ? 'bottom' : 'top';
            } else {
                preferredPosition = 'top';
            }

            // --- Horizontal Positioning & Style Calculation ---
            const calculatedStyle: React.CSSProperties = {};
            const buffer = 5;

            // Calculate positions relative to the container
            const buttonLeftRel = buttonRect.left - containerRect.left;
            const buttonRightRel = buttonRect.right - containerRect.left;
            const buttonCenterRel = buttonLeftRel + buttonRect.width / 2;
            const containerWidth = containerRect.width;

            // Default: Center tooltip relative to button center
            calculatedStyle.left = `${buttonCenterRel}px`;
            calculatedStyle.transform = 'translateX(-50%)';
            let tooltipLeftEdgeRel = buttonCenterRel - tooltipWidth / 2;
            let tooltipRightEdgeRel = buttonCenterRel + tooltipWidth / 2;

            // Check for overflow with default centering
            const centeredOverflowLeft = tooltipLeftEdgeRel < buffer;
            const centeredOverflowRight = tooltipRightEdgeRel > containerWidth - buffer;

            if (centeredOverflowLeft && !centeredOverflowRight) {
                // Pin Left
                calculatedStyle.left = `${buffer}px`;
                calculatedStyle.transform = 'translateX(0)';
            } else if (!centeredOverflowLeft && centeredOverflowRight) {
                // Pin Right
                calculatedStyle.left = 'auto';
                calculatedStyle.right = `${buffer}px`;
                calculatedStyle.transform = 'translateX(0)';
            } else if (centeredOverflowLeft && centeredOverflowRight) {
                 // Tooltip wider than container - Pin Left
                 calculatedStyle.left = `${buffer}px`;
                 calculatedStyle.transform = 'translateX(0)';
            }
            // Else: Default Centering is fine

            // Specific refined handling for control buttons
            if (buttonWrapper.classList.contains('control-button')) {
                // Try aligning right edge of tooltip with right edge of button
                const rightAlignLeftEdge = buttonRightRel - tooltipWidth;
                const rightAlignOverflowLeft = rightAlignLeftEdge < buffer;

                if (!rightAlignOverflowLeft) {
                    // Right alignment fits without left overflow
                    calculatedStyle.left = 'auto';
                    calculatedStyle.right = `0px`; // Relative to button wrapper
                    calculatedStyle.transform = 'translateX(0)';
                } else {
                    // Right alignment overflows left, try left alignment
                    const leftAlignRightEdge = buttonLeftRel + tooltipWidth;
                    const leftAlignOverflowRight = leftAlignRightEdge > containerWidth - buffer;

                    if (!leftAlignOverflowRight) {
                        // Left alignment fits without right overflow
                        calculatedStyle.left = `0px`; // Relative to button wrapper
                        calculatedStyle.right = 'auto';
                        calculatedStyle.transform = 'translateX(0)';
                    } else {
                         // Neither edge alignment works, fallback to previous container pinning logic
                         // Recalculate centered edges
                         tooltipLeftEdgeRel = buttonCenterRel - tooltipWidth / 2;
                         tooltipRightEdgeRel = buttonCenterRel + tooltipWidth / 2;
                         const newCenteredOverflowLeft = tooltipLeftEdgeRel < buffer;
                         const newCenteredOverflowRight = tooltipRightEdgeRel > containerWidth - buffer;

                         if (newCenteredOverflowLeft && !newCenteredOverflowRight) {
                             calculatedStyle.left = `${buffer}px`;
                             calculatedStyle.transform = 'translateX(0)';
                         } else if (!newCenteredOverflowLeft && newCenteredOverflowRight) {
                             calculatedStyle.left = 'auto';
                             calculatedStyle.right = `${buffer}px`;
                             calculatedStyle.transform = 'translateX(0)';
                         } else {
                             // Fallback: center if possible, else pin left
                             calculatedStyle.left = '50%';
                             calculatedStyle.transform = 'translateX(-50%)';
                              if (buttonCenterRel - tooltipWidth / 2 < buffer) {
                                 calculatedStyle.left = `${buffer}px`;
                                 calculatedStyle.transform = 'translateX(0)';
                              }
                         }
                    }
                }
            }

            // Create the final style object for the VISIBLE state (reset vertical offset)
            const finalStyle: React.CSSProperties = {
                ...calculatedStyle,
                // Reset vertical transform part for visible state
                transform: `${calculatedStyle.transform?.toString().replace(/ translateY\([^)]+\)/, '') || ''} translateY(0)`,
            };
            // Create style for the HIDDEN state (initial vertical offset)
            const initialStyle: React.CSSProperties = {
                 ...calculatedStyle,
                 // Keep initial vertical transform offset
                 transform: `${calculatedStyle.transform?.toString().replace(/ translateY\([^)]+\)/, '') || ''} translateY(${preferredPosition === 'top' ? '4px' : '-4px'})`,
            };


            // Reset temporary styles before applying state
            tooltipElement.style.visibility = '';
            tooltipElement.style.opacity = '';
            tooltipElement.style.position = '';

            setTooltipState(prev => ({
                ...prev,
                [key]: {
                    visible: true,
                    position: preferredPosition,
                    style: initialStyle, // Store initial style with offset
                 },
            }));

            // Trigger transition by applying final style shortly after
             requestAnimationFrame(() => {
                 setTooltipState(prev => ({
                    ...prev,
                    [key]: { ...prev[key], visible: true, style: finalStyle }
                 }));
             });

        });
    }, 50);
  }, [tooltipRefs]);

  const handleMouseLeave = useCallback((key: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setTooltipState(prev => ({ ...prev, [key]: { ...prev[key], visible: false } }));
  }, []);

  // Clear update tooltip timeout on unmount
  useEffect(() => {
    return () => {
      if (updateTooltipTimeoutRef.current) {
        window.clearTimeout(updateTooltipTimeoutRef.current);
      }
    };
  }, []);

  const showUpdateTooltip = (message: string, type: 'success' | 'error' = 'success') => {
    setUpdateTooltipMessage(message);
    setUpdateTooltipType(type);
    setUpdateTooltipVisible(true);
    
    // Auto-hide tooltip after 5 seconds
    if (updateTooltipTimeoutRef.current) {
      window.clearTimeout(updateTooltipTimeoutRef.current);
    }
    
    updateTooltipTimeoutRef.current = window.setTimeout(() => {
      setUpdateTooltipVisible(false);
    }, 5000);
  };

  const hideUpdateTooltip = () => {
    setUpdateTooltipVisible(false);
    if (updateTooltipTimeoutRef.current) {
      window.clearTimeout(updateTooltipTimeoutRef.current);
      updateTooltipTimeoutRef.current = null;
    }
  };

  const handleQuit = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('quit-app');
  };

  const handleCheckUpdate = async () => {
    if (isCheckingUpdate) return;
    
    try {
      setIsCheckingUpdate(true);
      const result = await checkForUpdates();
      
      if (result.hasUpdate) {
        setUpdateInfo(result);
        setIsUpdateDialogOpen(true);
      } else {
        const versionToShow = result.latestVersion || result.currentVersion || '';
        showUpdateTooltip(`You're already using the latest version (${versionToShow}).`);
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      showUpdateTooltip('Could not check for updates. Please try again later.', 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleRetry = () => {
    updatePrices(true).catch(console.error);
  };

  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const formatPrice = (price: number, fiat: string): string => {
    let formattedValue: string;

    // SPECIAL CASE: Handle stablecoins or prices very close to 1
    if (price > 0.999 && price < 1.001) {
        formattedValue = (1).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    // Use the refined logic similar to LivePrice.tsx
    else if (price >= 1000) {
      // e.g., 1,234.56
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } else if (price >= 1) {
      // e.g., 12.34
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2
      });
    } else if (price >= 0.01) {
      // e.g., 0.1646 
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 4, 
        maximumFractionDigits: 4
      });
    } else if (price > 0) {
      // e.g., 0.00123456 or 0.00001234
      formattedValue = price.toLocaleString(undefined, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 8
      });
    } else { 
      // Handle zero or invalid price
      formattedValue = '0.00';
    }

    // Add the appropriate currency symbol (using a simpler approach)
    switch (fiat.toUpperCase()) {
      case 'USD': return `$${formattedValue}`;
      case 'EUR': return `€${formattedValue}`;
      case 'GBP': return `£${formattedValue}`;
      case 'JPY': return `¥${formattedValue}`;
      case 'CAD': return `CA$${formattedValue}`;
      case 'AUD': return `A$${formattedValue}`;
      case 'CNY': return `¥${formattedValue}`;
      case 'INR': return `₹${formattedValue}`;
      default: return `${fiat.toUpperCase()} ${formattedValue}`;
    }
  };

  // Only show price on main page
  const showPrice = location.pathname === '/';

  const getPrice = () => {
    if (loading && !prices[selectedCrypto]) return <LoadingDot />; // Show loading only if no price exists

    if (error) {
      return (
        <>
          {error}
          <RetryButton onClick={handleRetry} title="Retry">↻</RetryButton>
        </>
      );
    }
    
    const currentPriceData = prices[selectedCrypto]?.[selectedFiat.toLowerCase()];
    const isDataPending = isPending(selectedCrypto);

    // If data is pending and we have no cached data at all for this fiat, show loading
    if (isDataPending && !currentPriceData?.price) {
        return (
            <>
              {selectedCrypto} <LoadingDot />
            </>
          );
    }
    
    // If we don't have any price data (even after loading/pending check)
    if (!currentPriceData?.price) {
        // Try localStorage cache as a last resort before showing N/A
        try {
            const priceCacheKey = `crypto_price_${selectedCrypto.toLowerCase()}`;
            const cachedStorageData = localStorage.getItem(priceCacheKey);
            if (cachedStorageData) {
                const priceStorageData = JSON.parse(cachedStorageData);
                const fiatPriceData = priceStorageData?.[selectedFiat.toLowerCase()];
                if (fiatPriceData?.price) {
                    return (
                        <>
                          {formatPrice(fiatPriceData.price, selectedFiat)}
                          {/* Show placeholder for change when using storage cache */}
                          <PriceChange $isPositive={null}>--%</PriceChange> 
                        </>
                      );
                }
            }
          } catch (e) { /* Ignore cache errors */ }
        
        // If still no data, return N/A
        return 'N/A';
    }

    // We have price data (current or cached)
    const formattedPrice = formatPrice(currentPriceData.price, selectedFiat);
    const changePercent = currentPriceData.change24h;

    return (
      <>
        {formattedPrice}
        {typeof changePercent === 'number' ? (
          <PriceChange $isPositive={changePercent >= 0}>
            {`${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`}
          </PriceChange>
        ) : isDataPending ? (
          // Show loading indicator for percentage if price is available but data is pending
          <PriceChange $isPositive={null}>...</PriceChange> 
        ) : (
          // Show placeholder if change is genuinely null (and not pending)
          <PriceChange $isPositive={null}>--%</PriceChange> 
        )}
      </>
    );
  };

  return (
    <HeaderContainer>
      <IconsContainer>
        <HoverButtonWrapper
          className="button-wrapper-class"
          $tooltipVisible={tooltipState.add.visible}
          $tooltipPosition={tooltipState.add.position}
          $tooltipStyle={tooltipState.add.style}
          onMouseEnter={() => handleMouseEnter('add')}
          onMouseLeave={() => handleMouseLeave('add')}
        >
          <IconButton onClick={() => navigate('/add-tokens')}>
            <IoMdAdd size={20} />
          </IconButton>
          <Tooltip
            ref={addTooltipRef}
            $position={tooltipState.add.position}
            style={tooltipState.add.style}
          >
            Add Tokens
          </Tooltip>
        </HoverButtonWrapper>
        <HoverButtonWrapper
          className="button-wrapper-class"
          $tooltipVisible={tooltipState.manage.visible}
          $tooltipPosition={tooltipState.manage.position}
          $tooltipStyle={tooltipState.manage.style}
          onMouseEnter={() => handleMouseEnter('manage')}
          onMouseLeave={() => handleMouseLeave('manage')}
        >
          <IconButton onClick={() => navigate('/manage-tokens')}>
            <FiTrash2 size={18} />
          </IconButton>
          <Tooltip
            ref={manageTooltipRef}
            $position={tooltipState.manage.position}
            style={tooltipState.manage.style}
          >
            Manage Tokens
          </Tooltip>
        </HoverButtonWrapper>
      </IconsContainer>

      {showPrice && (
        <ExchangeRate $isError={!!error}>
          <LastUpdated className="last-updated">
            {lastUpdated ? formatTimeAgo(lastUpdated) : ''}
          </LastUpdated>
          {getPrice()}
        </ExchangeRate>
      )}

      <WindowControls>
        <HoverButtonWrapper
          className="control-button button-wrapper-class"
          $tooltipVisible={tooltipState.update.visible}
          $tooltipPosition={tooltipState.update.position}
          $tooltipStyle={tooltipState.update.style}
          onMouseEnter={() => handleMouseEnter('update')}
          onMouseLeave={() => handleMouseLeave('update')}
        >
          <UpdateButton onClick={handleCheckUpdate} disabled={isCheckingUpdate}>
            {isCheckingUpdate ? <UpdateButtonSpinner><FiRefreshCw /></UpdateButtonSpinner> : <FiRefreshCw />}
          </UpdateButton>
          <Tooltip
            ref={updateHoverTooltipRef}
            $position={tooltipState.update.position}
            style={tooltipState.update.style}
          >
            Check for Updates
          </Tooltip>
        </HoverButtonWrapper>
        <HoverButtonWrapper
          className="control-button button-wrapper-class"
          $tooltipVisible={tooltipState.quit.visible}
          $tooltipPosition={tooltipState.quit.position}
          $tooltipStyle={tooltipState.quit.style}
          onMouseEnter={() => handleMouseEnter('quit')}
          onMouseLeave={() => handleMouseLeave('quit')}
        >
          <PowerButton onClick={handleQuit}>
            <GiPowerButton />
          </PowerButton>
          <Tooltip
            ref={quitTooltipRef}
            $position={tooltipState.quit.position}
            style={tooltipState.quit.style}
          >
            Quit Application
          </Tooltip>
        </HoverButtonWrapper>
        
        <UpdateTooltipContainer $isVisible={updateTooltipVisible}>
          <UpdateTooltipTitle>
            <UpdateTooltipHeader>
              <UpdateTooltipIcon $type={updateTooltipType}>
                {updateTooltipType === 'success' ? <FiCheck size={14} /> : <FiX size={14} />}
              </UpdateTooltipIcon>
              <span>{updateTooltipType === 'success' ? 'Update Check' : 'Update Error'}</span>
            </UpdateTooltipHeader>
            <UpdateCloseButton onClick={hideUpdateTooltip}>
              <FiX size={16} />
            </UpdateCloseButton>
          </UpdateTooltipTitle>
          <UpdateTooltipContent>
            {updateTooltipMessage}
          </UpdateTooltipContent>
        </UpdateTooltipContainer>
      </WindowControls>
      
      <AddCryptoModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      {updateInfo && (
        <UpdateDialog 
          isOpen={isUpdateDialogOpen} 
          onClose={() => setIsUpdateDialogOpen(false)} 
          updateInfo={updateInfo}
        />
      )}
    </HeaderContainer>
  );
};

export default Header;