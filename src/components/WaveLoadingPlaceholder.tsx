import React from 'react';
import styled, { keyframes } from 'styled-components';

interface WaveLoadingPlaceholderProps {
  width?: string;
  height?: string;
  className?: string; // Allow className to be passed for additional styling
}

const shimmerAnimation = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`;

const Placeholder = styled.div<WaveLoadingPlaceholderProps>`
  width: ${({ width }) => width || '100px'};
  height: ${({ height }) => height || '20px'};
  border-radius: 4px;
  background-image: linear-gradient(
    to right,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0.15) 20%,
    rgba(255, 255, 255, 0.08) 40%
  );
  background-size: 200px 100%;
  background-repeat: no-repeat;
  display: inline-block;
  animation: ${shimmerAnimation} 1.5s infinite linear;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05); // Optional: subtle shadow
`;

const WaveLoadingPlaceholder: React.FC<WaveLoadingPlaceholderProps> = ({ width, height, className }) => {
  return <Placeholder width={width} height={height} className={className} />;
};

export default WaveLoadingPlaceholder; 