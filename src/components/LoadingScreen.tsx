import React, { useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';

interface LoadingScreenProps {
  onFinish: () => void;
}

const randomGlitch1 = keyframes`
  0% { transform: translate(0, 0) scale(1); opacity: 0; }
  2% { transform: translate(-3px, 5px) scale(1.02); opacity: 0.8; }
  4% { transform: translate(2px, -2px) scale(0.98); opacity: 0; }
  7% { transform: translate(-1px, 3px) scale(1.01); opacity: 0.6; }
  9% { transform: translate(4px, -1px) scale(0.99); opacity: 0; }
  100% { transform: translate(0, 0) scale(1); opacity: 0; }
`;

const randomGlitch2 = keyframes`
  0% { transform: translate(0, 0) scaleX(1); opacity: 0; }
  3% { transform: translate(2px, -4px) scaleX(1.1); opacity: 0.7; }
  6% { transform: translate(-5px, 1px) scaleX(0.9); opacity: 0; }
  11% { transform: translate(1px, -3px) scaleX(1.05); opacity: 0.5; }
  13% { transform: translate(-2px, 2px) scaleX(0.95); opacity: 0; }
  100% { transform: translate(0, 0) scaleX(1); opacity: 0; }
`;

const randomGlitch3 = keyframes`
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
  1% { transform: translate(-4px, 3px) rotate(1deg); opacity: 0.9; }
  3% { transform: translate(3px, -5px) rotate(-1deg); opacity: 0; }
  8% { transform: translate(-1px, 4px) rotate(0.5deg); opacity: 0.4; }
  10% { transform: translate(2px, -1px) rotate(-0.5deg); opacity: 0; }
  100% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
`;

const pixelNoise = keyframes`
  0%, 100% { opacity: 0; }
  5% { opacity: 0.8; }
  10% { opacity: 0; }
  15% { opacity: 0.6; }
  20% { opacity: 0; }
  45% { opacity: 0.9; }
  50% { opacity: 0; }
  75% { opacity: 0.3; }
  80% { opacity: 0; }
`;

const chromaticShift = keyframes`
  0% { filter: hue-rotate(0deg) saturate(1); }
  15% { filter: hue-rotate(180deg) saturate(1.5); }
  30% { filter: hue-rotate(0deg) saturate(1); }
  45% { filter: hue-rotate(270deg) saturate(0.8); }
  60% { filter: hue-rotate(0deg) saturate(1); }
  75% { filter: hue-rotate(90deg) saturate(1.2); }
  100% { filter: hue-rotate(0deg) saturate(1); }
`;

const digitalDistortion = keyframes`
  0%, 90%, 100% { transform: translate(0, 0) skew(0deg); opacity: 0; }
  2% { transform: translate(-2px, 1px) skew(0.5deg); opacity: 0.3; }
  4% { transform: translate(1px, -3px) skew(-0.3deg); opacity: 0.7; }
  6% { transform: translate(-3px, 2px) skew(0.8deg); opacity: 0.2; }
  8% { transform: translate(2px, -1px) skew(-0.6deg); opacity: 0.5; }
`;

const FullScreenContainer = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #121212;
  z-index: 9999;
  overflow: hidden;
`;

const GlitchLayer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1;
`;

const RandomGlitchBlock = styled.div<{ 
  $top: string; 
  $left: string; 
  $width: string; 
  $height: string; 
  $delay: number;
  $animationType: number;
}>`
  position: absolute;
  top: ${({ $top }) => $top};
  left: ${({ $left }) => $left};
  width: ${({ $width }) => $width};
  height: ${({ $height }) => $height};
  background: rgba(159, 122, 234, 0.1);
  animation: ${({ $animationType }) => {
    switch($animationType) {
      case 1: return randomGlitch1;
      case 2: return randomGlitch2;
      default: return randomGlitch3;
    }
  }} ${() => 3 + Math.random() * 2}s infinite;
  animation-delay: ${({ $delay }) => $delay}s;
  mix-blend-mode: screen;
`;

const PixelNoiseBlock = styled.div<{ 
  $top: string; 
  $left: string; 
  $size: string; 
  $delay: number;
}>`
  position: absolute;
  top: ${({ $top }) => $top};
  left: ${({ $left }) => $left};
  width: ${({ $size }) => $size};
  height: ${({ $size }) => $size};
  background: #9f7aea;
  animation: ${pixelNoise} ${() => 1 + Math.random() * 2}s infinite;
  animation-delay: ${({ $delay }) => $delay}s;
  mix-blend-mode: difference;
`;

const DigitalDistortionLayer = styled.div<{ $delay: number }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    ${() => Math.random() * 360}deg,
    transparent ${() => Math.random() * 30}%,
    rgba(159, 122, 234, 0.05) ${() => 40 + Math.random() * 20}%,
    transparent ${() => 70 + Math.random() * 30}%
  );
  animation: ${digitalDistortion} ${() => 2 + Math.random() * 3}s infinite;
  animation-delay: ${({ $delay }) => $delay}s;
  mix-blend-mode: overlay;
`;

const ChromaticLayer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: #121212;
  animation: ${chromaticShift} 4s infinite ease-in-out;
  opacity: 0.1;
  mix-blend-mode: color;
`;

const ContentLayer = styled.div`
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
`;

const LogoWrapper = styled(motion.div)`
  display: flex;
  justify-content: center;
  align-items: center;
`;

const glow = keyframes`
  0%, 100% {
    filter: drop-shadow(0 0 5px #9f7aea) drop-shadow(0 0 10px #9f7aea);
  }
  50% {
    filter: drop-shadow(0 0 15px #9f7aea) drop-shadow(0 0 25px #9f7aea);
  }
`;

const RotatingSVG = styled(motion.svg)`
  width: 80px;
  height: 80px;
  animation: ${glow} 2.5s ease-in-out infinite;
`;

const ProgressBarContainer = styled.div`
  position: absolute;
  bottom: 50px;
  width: 250px;
  height: 6px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
`;

const ProgressIndicator = styled(motion.div)`
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #8a2be2, #9f7aea);
  border-radius: 3px;
  transform-origin: left;
`;

// Generate random glitch elements
const generateRandomGlitches = () => {
  const glitches = [];
  const pixelNoise = [];
  const distortions = [];
  
  // Random glitch blocks
  for (let i = 0; i < 15; i++) {
    glitches.push({
      key: `glitch-${i}`,
      $top: `${Math.random() * 100}%`,
      $left: `${Math.random() * 100}%`,
      $width: `${10 + Math.random() * 40}px`,
      $height: `${5 + Math.random() * 20}px`,
      $delay: Math.random() * 3,
      $animationType: Math.floor(Math.random() * 3) + 1
    });
  }
  
  // Random pixel noise
  for (let i = 0; i < 25; i++) {
    pixelNoise.push({
      key: `pixel-${i}`,
      $top: `${Math.random() * 100}%`,
      $left: `${Math.random() * 100}%`,
      $size: `${1 + Math.random() * 3}px`,
      $delay: Math.random() * 2
    });
  }
  
  // Random distortion layers
  for (let i = 0; i < 5; i++) {
    distortions.push({
      key: `distortion-${i}`,
      $delay: Math.random() * 4
    });
  }
  
  return { glitches, pixelNoise, distortions };
};

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onFinish]);

  const { glitches, pixelNoise, distortions } = generateRandomGlitches();

  return (
    <FullScreenContainer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <GlitchLayer>
        <ChromaticLayer />
        
        {/* Random glitch blocks */}
        {glitches.map((glitch) => (
          <RandomGlitchBlock
            key={glitch.key}
            $top={glitch.$top}
            $left={glitch.$left}
            $width={glitch.$width}
            $height={glitch.$height}
            $delay={glitch.$delay}
            $animationType={glitch.$animationType}
          />
        ))}
        
        {/* Random pixel noise */}
        {pixelNoise.map((pixel) => (
          <PixelNoiseBlock
            key={pixel.key}
            $top={pixel.$top}
            $left={pixel.$left}
            $size={pixel.$size}
            $delay={pixel.$delay}
          />
        ))}
        
        {/* Random distortion layers */}
        {distortions.map((distortion) => (
          <DigitalDistortionLayer
            key={distortion.key}
            $delay={distortion.$delay}
          />
        ))}
      </GlitchLayer>
      
      <ContentLayer>
        <LogoWrapper>
          <RotatingSVG
            viewBox="0 0 100 100"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <motion.circle
              cx="50"
              cy="50"
              r="45"
              stroke="#9f7aea"
              strokeWidth="5"
              fill="transparent"
              strokeDasharray="282.7"
              strokeDashoffset={282.7 * (3/4)} // Start at the top
            />
          </RotatingSVG>
        </LogoWrapper>
        <ProgressBarContainer>
          <ProgressIndicator
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2.8, ease: 'easeInOut' }}
          />
        </ProgressBarContainer>
      </ContentLayer>
    </FullScreenContainer>
  );
};

export default LoadingScreen;