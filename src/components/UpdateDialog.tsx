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
  height: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
  position: relative;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      45deg,
      transparent 25%,
      rgba(255, 255, 255, 0.05) 25%,
      rgba(255, 255, 255, 0.05) 50%,
      transparent 50%,
      transparent 75%,
      rgba(255, 255, 255, 0.05) 75%
    );
    background-size: 20px 20px;
    animation: progressBarAnimation 2s linear infinite;
    border-radius: 8px;
  }
  
  @keyframes progressBarAnimation {
    0% { background-position: 0 0; }
    100% { background-position: 20px 0; }
  }
`;

const ProgressFill = styled(motion.div)<{ progress: number }>`
  height: 100%;
  width: ${props => props.progress}%;
  background: linear-gradient(90deg, #8b5cf6, #a78bfa, #c084fc);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.4) 50%,
      transparent
    );
    animation: progressShimmer 1.5s ease-in-out infinite;
  }
  
  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.2) 0%,
      transparent 50%,
      rgba(0, 0, 0, 0.1) 100%
    );
    border-radius: 8px;
  }
  
  @keyframes progressShimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;

const ProgressText = styled.div`
  font-size: 11px;
  color: #a0aec0;
  display: flex;
  justify-content: space-between;
  font-weight: 500;
  margin-bottom: 4px;
  
  span:last-child {
    color: #8b5cf6;
    font-weight: 600;
  }
`;

const ProgressStats = styled.div`
  font-size: 10px;
  color: #6b7280;
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  
  span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  
  .speed {
    color: #10b981;
  }
  
  .eta {
    color: #f59e0b;
  }
  
  .size {
    color: #8b5cf6;
  }
`;

const StatusMessage = styled(motion.div)<{ $type: 'success' | 'error' | 'info' | 'warning' }>`
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  background: ${props => 
    props.$type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 
    props.$type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 
    props.$type === 'warning' ? 'rgba(234, 179, 8, 0.1)' : 
    'rgba(139, 92, 246, 0.1)'
  };
  color: ${props => 
    props.$type === 'success' ? '#10b981' : 
    props.$type === 'error' ? '#ef4444' : 
    props.$type === 'warning' ? '#f59e0b' : 
    '#8b5cf6'
  };
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
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

interface ProgressData {
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({ isOpen, onClose, updateInfo }) => {
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [progressData, setProgressData] = useState<ProgressData>({ progress: 0 });
  const [downloadedFilePath, setDownloadedFilePath] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  
  // Ensure we have valid version information
  const currentVersion = updateInfo?.currentVersion && updateInfo.currentVersion !== '0.0.0' 
    ? updateInfo.currentVersion 
    : '';
  const latestVersion = updateInfo?.latestVersion || '';

  // Helper functions for formatting download metrics
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const formatETA = (seconds: number): string => {
    if (seconds <= 0) return '';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setUpdateState('idle');
      setDownloadProgress(0);
      setProgressData({ progress: 0 });
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
    setProgressData({ progress: 0 });

    try {
      const filePath = await downloadUpdate(updateInfo.downloadUrl, (progressInfo: number | ProgressData) => {
        if (typeof progressInfo === 'number') {
          // Legacy format - just a number
          setDownloadProgress(progressInfo);
          setProgressData({ progress: progressInfo });
        } else {
          // Enhanced format - object with additional data
          setDownloadProgress(progressInfo.progress);
          setProgressData(progressInfo);
        }
      });
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
      
      // Clean up the error message by removing IPC wrapper text
      let cleanErrorMessage = error.message || 'Installation failed. Please run the installer manually.';
      
      // Remove the IPC error wrapper if present
      if (cleanErrorMessage.startsWith('Error invoking remote method')) {
        const match = cleanErrorMessage.match(/Error invoking remote method '[^']+': Error: (.+)/);
        if (match && match[1]) {
          cleanErrorMessage = match[1];
        }
      }
      
      // Check if this is a user cancellation error specifically
      const isCancellation = cleanErrorMessage.includes('Installation was cancelled');
      
      // For cancellation, use an even more concise message
      if (isCancellation) {
        cleanErrorMessage = 'Installation cancelled. Try again.';
      }
      
      setErrorMessage(cleanErrorMessage);
      
      // For cancellation errors, return to downloaded state so user can try again
      // For other errors, go to error state
      if (isCancellation) {
        console.log('Installation cancelled, returning to downloaded state');
        setUpdateState('downloaded');
      } else {
        console.log('Installation failed with error, setting error state');
        setUpdateState('error');
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
              
              {updateState === 'downloaded' && errorMessage && (
                <StatusMessage 
                  $type="warning"
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
                      initial={{ width: '0%', opacity: 0 }}
                      animate={{ 
                        width: `${downloadProgress}%`,
                        opacity: 1
                      }}
                      transition={{ 
                        width: { 
                          type: 'spring', 
                          damping: 25, 
                          stiffness: 120,
                          mass: 0.8
                        },
                        opacity: { duration: 0.3 }
                      }}
                    />
                  </ProgressBar>
                  <ProgressText>
                    <motion.span
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      Downloading update...
                    </motion.span>
                    <motion.span
                      key={downloadProgress} // Re-animate when progress changes
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      {downloadProgress.toFixed(0)}%
                    </motion.span>
                  </ProgressText>
                  {(progressData.speed || progressData.downloadedBytes || progressData.eta) && (
                    <ProgressStats>
                      <span className="size">
                        {progressData.downloadedBytes && progressData.totalBytes 
                          ? `${formatBytes(progressData.downloadedBytes)} / ${formatBytes(progressData.totalBytes)}`
                          : progressData.downloadedBytes 
                            ? formatBytes(progressData.downloadedBytes)
                            : ''
                        }
                      </span>
                      <span>
                        {progressData.speed && progressData.speed > 0 && (
                          <span className="speed">
                            {formatSpeed(progressData.speed)}
                          </span>
                        )}
                        {progressData.eta && progressData.eta > 0 && (
                          <span className="eta">
                            ETA: {formatETA(progressData.eta)}
                          </span>
                        )}
                      </span>
                    </ProgressStats>
                  )}
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