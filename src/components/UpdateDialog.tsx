import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FiDownload, FiCheck, FiX, FiRefreshCw, FiArrowRight } from 'react-icons/fi';
import { downloadUpdate, installUpdate } from '../services/updateService';

const Overlay = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
  padding: 10px;
  
  /* Ensure dialog is always centered in the Electron app window */
  display: grid;
  place-items: center;
`;

const DialogContainer = styled(motion.div)`
  background: #1a1a2e;
  border-radius: 16px;
  padding: 20px;
  width: 100%;
  max-width: 340px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  border: 1px solid #8b5cf6;
  color: white;
  position: relative;
  overflow: hidden;
  outline: none; /* Remove default focus outline as we'll handle it ourselves */
`;

const GlowEffect = styled(motion.div)`
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    circle at center,
    rgba(139, 92, 246, 0.15) 0%,
    rgba(139, 92, 246, 0) 70%
  );
  pointer-events: none;
  z-index: -1;
`;

const Title = styled.h2`
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: #8b5cf6;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Content = styled.div`
  margin-bottom: 18px;
  font-size: 14px;
  
  p {
    margin: 10px 0;
    line-height: 1.4;
  }
`;

const VersionInfo = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
`;

const VersionColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const VersionLabel = styled.span`
  font-size: 11px;
  color: #a0aec0;
  margin-bottom: 4px;
`;

const Version = styled.span<{ $isLatest?: boolean }>`
  font-size: 16px;
  font-weight: ${props => props.$isLatest ? '600' : '400'};
  color: ${props => props.$isLatest ? '#8b5cf6' : 'white'};
`;

const VersionArrow = styled(motion.div)`
  display: flex;
  align-items: center;
  color: #8b5cf6;
  font-size: 18px;
`;

const ButtonContainer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  background: ${props => props.$primary ? '#8b5cf6' : 'rgba(139, 92, 246, 0.1)'};
  color: ${props => props.$primary ? 'white' : '#8b5cf6'};

  &:hover {
    transform: translateY(-2px);
    background: ${props => props.$primary ? '#9f7aea' : 'rgba(139, 92, 246, 0.2)'};
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const ProgressContainer = styled.div`
  margin-top: 16px;
  width: 100%;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
`;

const ProgressFill = styled(motion.div)<{ progress: number }>`
  height: 100%;
  width: ${props => props.progress}%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa);
  border-radius: 4px;
`;

const ProgressText = styled.div`
  font-size: 11px;
  color: #a0aec0;
  display: flex;
  justify-content: space-between;
`;

const StatusMessage = styled(motion.div)<{ $type: 'success' | 'error' | 'info' }>`
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  background: ${props => 
    props.$type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 
    props.$type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 
    'rgba(139, 92, 246, 0.1)'
  };
  color: ${props => 
    props.$type === 'success' ? '#10b981' : 
    props.$type === 'error' ? '#ef4444' : 
    '#8b5cf6'
  };
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Loading animation component
const LoadingPulse = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
`;

const Dot = styled(motion.div)`
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: currentColor;
`;

// Define a type for the update process state
type UpdateState = 'idle' | 'downloading' | 'downloaded' | 'installing' | 'error';

// New styled component for the wait message
const WaitMessage = styled.span`
  margin-left: 4px;
  font-size: 11px;
`;

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: {
    currentVersion: string;
    latestVersion: string;
    downloadUrl: string;
    fileName: string;
    fileSize: number;
  };
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ isOpen, onClose, updateInfo }) => {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedFilePath, setDownloadedFilePath] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  
  // Ensure we have valid version information
  const currentVersion = updateInfo?.currentVersion && updateInfo.currentVersion !== '0.0.0' 
    ? updateInfo.currentVersion 
    : '';
  const latestVersion = updateInfo?.latestVersion || '';

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setUpdateState('idle');
      setDownloadProgress(0);
      setDownloadedFilePath('');
      setErrorMessage('');
      
      // Focus the dialog when it opens
      setTimeout(() => {
        if (dialogRef.current) {
          dialogRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  // Handle close with cleanup if needed
  const handleClose = useCallback(() => {
    // Don't allow closing during installation unless there's an error
    if (updateState === 'installing' && !errorMessage) {
      return;
    }
    onClose();
  }, [updateState, errorMessage, onClose]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  }, [handleClose]);

  const handleDownload = async () => {
    setUpdateState('downloading');
    setErrorMessage('');
    setDownloadProgress(0);

    try {
      const filePath = await downloadUpdate(updateInfo.downloadUrl, setDownloadProgress);
      setDownloadedFilePath(filePath);
      setUpdateState('downloaded');
    } catch (err) {
      const error = err as Error;
      console.error('Download error:', error.message);
      setErrorMessage(error.message || 'Download failed. Please try again.');
      setUpdateState('error');
    }
  };

  const handleInstall = async () => {
    setUpdateState('installing');
    setErrorMessage('');
    try {
      await installUpdate(downloadedFilePath);
      // On success, the application will quit, so no further state change is needed.
    } catch (err) {
      const error = err as Error;
      console.error('Install error:', error.message);
      setErrorMessage(error.message || 'Installation failed. Please run the installer manually.');
      setUpdateState('error');
    }
  };

  // Loading dots animation
  const loadingVariants = {
    animate: {
      transition: {
        staggerChildren: 0.2
      }
    }
  };
  
  const dotVariants = {
    initial: { opacity: 0, y: 0 },
    animate: { 
      opacity: [0, 1, 0],
      y: [0, -5, 0],
      transition: {
        repeat: Infinity,
        duration: 1
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <Overlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <DialogContainer
            ref={dialogRef}
            tabIndex={-1} // Make the dialog focusable
            onKeyDown={handleKeyDown}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-dialog-title"
          >
            <GlowEffect 
              animate={{ 
                rotate: 360,
                opacity: [0.5, 0.8, 0.5],
              }} 
              transition={{ 
                rotate: { repeat: Infinity, duration: 10, ease: 'linear' },
                opacity: { repeat: Infinity, duration: 3, ease: 'easeInOut' }
              }} 
            />
            
            <Title id="update-dialog-title">
              <FiRefreshCw size={20} />
              Update Available
            </Title>
            
            <Content>
              <VersionInfo>
                <VersionColumn>
                  <VersionLabel>Current</VersionLabel>
                  <Version>{currentVersion}</Version>
                </VersionColumn>
                
                <VersionArrow
                  animate={{ x: [0, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <FiArrowRight />
                </VersionArrow>
                
                <VersionColumn>
                  <VersionLabel>Latest</VersionLabel>
                  <Version $isLatest>{latestVersion}</Version>
                </VersionColumn>
              </VersionInfo>
              
              <p>
                {updateState === 'downloaded'
                  ? 'Download complete. The application will restart to install the update.'
                  : 'A new version of CryptoVertX is available. Update now?'}
              </p>
              
              {updateState === 'error' && errorMessage && (
                <StatusMessage 
                  $type="error"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <FiX size={16} />
                  {errorMessage}
                </StatusMessage>
              )}
              
              {updateState === 'downloading' && (
                <ProgressContainer>
                  <ProgressBar>
                    <ProgressFill 
                      progress={downloadProgress}
                      initial={{ width: '0%' }}
                      animate={{ width: `${downloadProgress}%` }}
                      transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                    />
                  </ProgressBar>
                  <ProgressText>
                    <span>Downloading update...</span>
                    <span>{downloadProgress.toFixed(0)}%</span>
                  </ProgressText>
                </ProgressContainer>
              )}
              
              {updateState === 'installing' && (
                <StatusMessage 
                  $type="info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  >
                    <FiRefreshCw size={16} />
                  </motion.div>
                  Installing... App will restart
                  <WaitMessage>(please wait)</WaitMessage>
                </StatusMessage>
              )}
            </Content>
            
            <ButtonContainer>
              <Button onClick={handleClose} disabled={updateState === 'installing'}>
                {updateState === 'downloaded' ? 'Close' : 'Later'}
              </Button>
              
              {updateState === 'idle' && (
                <Button $primary onClick={handleDownload}>
                  <FiDownload size={16} /> Update Now
                </Button>
              )}

              {updateState === 'downloading' && (
                <Button $primary disabled>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  >
                    <FiRefreshCw size={16} />
                  </motion.div>
                  Downloading...
                </Button>
              )}

              {updateState === 'downloaded' && (
                <Button $primary onClick={handleInstall}>
                  <FiCheck size={16} /> Install & Restart
                </Button>
              )}

              {updateState === 'installing' && (
                <Button $primary disabled>
                   <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  >
                    <FiRefreshCw size={16} />
                  </motion.div>
                  Installing...
                </Button>
              )}

              {updateState === 'error' && (
                 <Button $primary onClick={handleDownload}>
                  <FiRefreshCw size={16} /> Retry Download
                </Button>
              )}
            </ButtonContainer>
          </DialogContainer>
        </Overlay>
      )}
    </AnimatePresence>
  );
};

export default UpdateDialog; 