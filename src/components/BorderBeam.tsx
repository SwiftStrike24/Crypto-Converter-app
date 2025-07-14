import styled, { keyframes } from 'styled-components';

const beamAnimation = keyframes`
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
`;

export const BorderBeam = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 10px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;

  &::before {
    content: '';
    position: absolute;
    width: 200%;
    height: 200%;
    top: -50%;
    left: -50%;
    background: conic-gradient(
      from 0deg,
      transparent 0%,
      transparent 50%,
      #8b5cf6 70%,
      #a78bfa 85%,
      #c4b5fd 95%,
      transparent 100%
    );
    animation: ${beamAnimation} 8s linear infinite;
    filter: blur(40px);
    opacity: 0.3;
  }

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    right: 2px;
    bottom: 2px;
    background: #121212;
    border-radius: 8px;
  }
`; 