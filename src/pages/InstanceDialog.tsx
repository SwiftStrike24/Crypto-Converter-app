import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { FiAlertTriangle } from 'react-icons/fi';
import { ipcRenderer } from 'electron';

const PageContainer = styled(motion.div)`
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background: radial-gradient(ellipse at bottom, #111111 0%, #030305 100%);
  color: white;
  position: fixed;
  top: 0;
  left: 0;
  overflow: hidden;
`;

const DialogContainer = styled(motion.div)`
  background: linear-gradient(145deg, rgba(40, 40, 50, 0.8), rgba(25, 25, 35, 0.85));
  border-radius: 16px;
  padding: 28px;
  width: 90%;
  max-width: 420px;
  border: 1px solid rgba(139, 92, 246, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
`;

const IconWrapper = styled.div`
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.25));
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0;

  svg {
    width: 24px;
    height: 24px;
  }
`;

const DialogTitle = styled.h2`
  margin: 0;
  font-size: 1.6rem;
  color: #e5e7eb;
  font-weight: 600;
`;

const DialogMessage = styled.p`
  margin: 0;
  color: #a0aec0;
  line-height: 1.5;
  max-width: 90%;
`;

const RestartButton = styled(motion.button)`
  margin-top: 8px;
  padding: 12px 24px;
  border-radius: 10px;
  border: 1px solid rgba(167, 139, 250, 0.5);
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3), inset 0 1px 1px rgba(255,255,255,0.1);
  background: linear-gradient(145deg, #8b5cf6, #7c3aed);
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);
    background: linear-gradient(145deg, #9f7aea, #8b5cf6);
    border-color: rgba(167, 139, 250, 0.7);
  }
  
  &:active {
    transform: translateY(0) scale(0.98);
  }
`;

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const dialogVariants = {
  initial: { opacity: 0, y: -20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 25 } },
  exit: { opacity: 0, y: 10, scale: 0.95 },
};

const InstanceDialog: React.FC = () => {
  return (
    <PageContainer
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <DialogContainer variants={dialogVariants}>
        <IconWrapper>
          <FiAlertTriangle />
        </IconWrapper>
        <DialogTitle>App Already Running</DialogTitle>
        <DialogMessage>
          Another instance of CryptoVertX is open. You can restart the application from here if needed.
        </DialogMessage>
        <RestartButton
          onClick={() => ipcRenderer.send('instance-dialog-restart')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          Restart App
        </RestartButton>
      </DialogContainer>
    </PageContainer>
  );
};

export default InstanceDialog; 