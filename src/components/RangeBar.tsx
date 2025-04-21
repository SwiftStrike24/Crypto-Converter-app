import React from 'react';
import styled from 'styled-components';

interface RangeBarProps {
  low: number | null;
  current: number;
  high: number | null;
  currency: string;
}

const RangeBar: React.FC<RangeBarProps> = ({ low, current, high, currency }) => {
  // Early return if missing data
  if (low === null || high === null || current === null) {
    return null;
  }
  
  // Handle edge case where low/high are the same
  const range = Math.max(high - low, 0.00001);
  
  // Calculate position as percentage (clamped between 0-100%)
  const position = Math.min(Math.max(((current - low) / range) * 100, 0), 100);
  
  // Format currency for tooltips and display
  const formatCurrency = (value: number, short: boolean = false): string => {
    if (value === null) return 'N/A';
    
    let formattedValue: string;
    
    // Determine significant digits and format based on value magnitude
    if (value >= 1000) {
      const minDigits = short ? 0 : 2;
      const maxDigits = 2;
      formattedValue = value.toLocaleString(undefined, {
        minimumFractionDigits: minDigits,
        maximumFractionDigits: maxDigits
      });
    } else if (value >= 1) {
      const minDigits = short ? 0 : 2;
      const maxDigits = short ? 2 : 4;
      formattedValue = value.toLocaleString(undefined, {
        minimumFractionDigits: minDigits,
        maximumFractionDigits: maxDigits
      });
    } else if (value >= 0.01) {
      const minDigits = short ? 2 : 4;
      const maxDigits = short ? 4 : 6;
      formattedValue = value.toLocaleString(undefined, {
        minimumFractionDigits: minDigits,
        maximumFractionDigits: maxDigits
      });
    } else if (value > 0) {
      // For very small numbers, show more precision
      let minDigits = 6; // Default min for small numbers
      let maxDigits = 10; // Default max for small numbers
      
      if (short) {
          const valueString = value.toFixed(maxDigits); // Use maxDigits for initial string
          const firstSignificantIndex = valueString.search(/[1-9]/);
          if (firstSignificantIndex > 1) { // Check if it's after '0.'
              // Show 2-3 significant digits after the leading zeros
              maxDigits = Math.min(firstSignificantIndex + 2, maxDigits);
              minDigits = maxDigits; // Keep min and max the same for short
          } else {
              // If significant digit is close to decimal, use standard short logic
              maxDigits = 4;
              minDigits = 4;
          }
      }
      
      formattedValue = value.toLocaleString(undefined, {
          minimumFractionDigits: minDigits,
          maximumFractionDigits: maxDigits
      });
      
    } else { // value is 0 or less
      formattedValue = '0.00';
    }
    
    // Add currency symbol
    switch (currency.toUpperCase()) {
      case 'USD': return `$${formattedValue}`;
      case 'EUR': return `€${formattedValue}`;
      case 'CAD': return `CA$${formattedValue}`;
      default: return `${formattedValue} ${currency.toUpperCase()}`;
    }
  };

  return (
    <RangeBarContainer>
      <RangeBarContent>
        <RangeBarLowValue>
          {formatCurrency(low, true)}
          <RangeBarTooltip>
            Low: {formatCurrency(low)}
          </RangeBarTooltip>
        </RangeBarLowValue>
        
        <RangeBarTrack>
          <RangeBarProgress style={{ width: `${position}%` }} />
          <RangeBarCurrentMarker style={{ left: `${position}%` }}>
            <RangeBarTooltip>
              Current: {formatCurrency(current)}
            </RangeBarTooltip>
          </RangeBarCurrentMarker>
        </RangeBarTrack>
        
        <RangeBarHighValue>
          {formatCurrency(high, true)}
          <RangeBarTooltip>
            High: {formatCurrency(high)}
          </RangeBarTooltip>
        </RangeBarHighValue>
      </RangeBarContent>
    </RangeBarContainer>
  );
};

const RangeBarContainer = styled.div`
  width: 100%;
  margin: 6px 0 0;
  user-select: none;
`;

const RangeBarContent = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  height: 20px;
`;

const RangeBarTrack = styled.div`
  position: relative;
  flex: 1;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1.5px;
  margin: 0 8px;
  box-shadow: inset 0 0 3px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
`;

const RangeBarProgress = styled.div`
  position: absolute;
  height: 100%;
  background: linear-gradient(90deg, 
    rgba(255, 215, 0, 0.85) 0%, 
    rgba(218, 165, 32, 0.8) 25%,
    rgba(186, 85, 211, 0.8) 75%, 
    rgba(139, 92, 246, 0.85) 100%);
  border-radius: 1.5px;
  box-shadow: 0 0 6px rgba(218, 165, 32, 0.4);
`;

const RangeBarCurrentMarker = styled.div`
  position: absolute;
  top: 50%;
  width: 6px;
  height: 6px;
  background-color: white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 5px rgba(139, 92, 246, 0.6), 0 0 2px rgba(255, 215, 0, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.8);
  z-index: 2;
  
  &:hover > div {
    visibility: visible;
    opacity: 1;
    transform: translate(-50%, -100%) translateY(-8px);
  }
`;

const RangeBarValueBase = styled.div`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.7);
  position: relative;
  cursor: default;
  white-space: nowrap;
  
  &:hover > div {
    visibility: visible;
    opacity: 1;
    transform: translate(-50%, -100%) translateY(-8px);
  }
`;

const RangeBarLowValue = styled(RangeBarValueBase)`
  text-align: right;
`;

const RangeBarHighValue = styled(RangeBarValueBase)`
  text-align: left;
`;

const RangeBarTooltip = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translate(-50%, -100%) translateY(-4px);
  background: rgba(28, 32, 38, 0.95);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  white-space: nowrap;
  visibility: hidden;
  opacity: 0;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  z-index: 100;
  
  &:after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-width: 4px;
    border-style: solid;
    border-color: rgba(28, 32, 38, 0.95) transparent transparent transparent;
  }
`;

export default RangeBar; 