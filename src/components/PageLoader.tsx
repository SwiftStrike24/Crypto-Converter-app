import React from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  min-height: 300px;
  background: transparent;
`;

const glow = keyframes`
  0%, 100% {
    filter: drop-shadow(0 0 2px #9f7aea);
  }
  50% {
    filter: drop-shadow(0 0 8px #9f7aea);
  }
`;

const RotatingSVG = styled(motion.svg)`
  width: 50px;
  height: 50px;
  animation: ${glow} 2s ease-in-out infinite;
`;

const PageLoader: React.FC = () => {
    return (
        <Container>
            <RotatingSVG
                viewBox="0 0 100 100"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            >
                <motion.circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="#9f7aea"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 * 0.75}
                    strokeLinecap="round"
                />
            </RotatingSVG>
        </Container>
    );
};

export default PageLoader;
