import React, { useState, useEffect } from 'react';
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

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: #8b5cf6;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;

  &:hover {
    background: rgba(139, 92, 246, 0.1);
    transform: scale(1.1);
  }
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
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [downloadedFilePath, setDownloadedFilePath] = useState('');
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDownloading(false);
      setDownloadProgress(0);
      setDownloadComplete(false);
      setDownloadedFilePath('');
      setInstalling(false);
      setError(null);
      setStatusMessage(null);
    }
  }, [isOpen]);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setError(null);
      setStatusMessage(null);
      
      const filePath = await downloadUpdate(updateInfo.downloadUrl, (progress) => {
        setDownloadProgress(progress);
      });
      
      if (filePath === 'browser-download' || filePath === 'direct-download') {
        setStatusMessage('Download started');
        setTimeout(() => {
          setDownloadComplete(true);
          setDownloadedFilePath(filePath);
          setStatusMessage('Download complete');
        }, 2000);
      } else {
        setDownloadComplete(true);
        setDownloadedFilePath(filePath);
        setStatusMessage('Download complete');
      }
    } catch (err) {
      console.error('Download error:', (err as Error).message);
      setError('Download failed. Try again or visit website.');
    } finally {
      setDownloading(false);
    }
  };

  const handleInstall = async () => {
    try {
      setInstalling(true);
      setError(null);
      
      if (downloadedFilePath === 'browser-download' || downloadedFilePath === 'direct-download') {
        setStatusMessage('Run the installer to complete update.');
        setTimeout(() => onClose(), 2000);
        return;
      }
      
      try {
        await installUpdate(downloadedFilePath);
        // App will restart automatically
      } catch (installError) {
        console.error('Install error:', installError);
        setError('Installation failed. Run installer manually.');
        setInstalling(false);
      }
    } catch (err) {
      console.error('General install error:', err);
      setError('Installation failed. Please try again.');
      setInstalling(false);
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
          onClick={onClose}
        >
          <DialogContainer
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
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
            
            <Title>
              <FiRefreshCw size={20} />
              Update Available
            </Title>
            
            <CloseButton onClick={onClose}>
              <FiX size={18} />
            </CloseButton>
            
            <Content>
              <VersionInfo>
                <VersionColumn>
                  <VersionLabel>Current</VersionLabel>
                  <Version>{updateInfo.currentVersion}</Version>
                </VersionColumn>
                
                <VersionArrow
                  animate={{ x: [0, 5, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                >
                  <FiArrowRight />
                </VersionArrow>
                
                <VersionColumn>
                  <VersionLabel>Latest</VersionLabel>
                  <Version $isLatest>{updateInfo.latestVersion}</Version>
                </VersionColumn>
              </VersionInfo>
              
              <p>New version available. Update now?</p>
              
              {error && (
                <StatusMessage 
                  $type="error"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <FiX size={16} />
                  {error}
                </StatusMessage>
              )}
              
              {statusMessage && !error && (
                <StatusMessage 
                  $type={downloadComplete ? 'success' : 'info'}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={statusMessage}
                >
                  {downloadComplete ? (
                    <FiCheck size={16} />
                  ) : (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                    >
                      <FiRefreshCw size={16} />
                    </motion.div>
                  )}
                  {statusMessage}
                  {!downloadComplete && (
                    <LoadingPulse variants={loadingVariants} animate="animate">
                      <Dot variants={dotVariants} />
                      <Dot variants={dotVariants} />
                      <Dot variants={dotVariants} />
                    </LoadingPulse>
                  )}
                </StatusMessage>
              )}
              
              {downloading && (
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
                    <span>Downloading</span>
                    <span>{downloadProgress.toFixed(0)}%</span>
                  </ProgressText>
                </ProgressContainer>
              )}
              
              {installing && (
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
                </StatusMessage>
              )}
            </Content>
            
            <ButtonContainer>
              {!downloadComplete && (
                <>
                  <Button onClick={onClose}>
                    <FiX size={16} /> Later
                  </Button>
                  <Button 
                    $primary 
                    onClick={handleDownload} 
                    disabled={downloading}
                  >
                    {downloading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        >
                          <FiRefreshCw size={16} />
                        </motion.div>
                        Downloading
                      </>
                    ) : (
                      <>
                        <FiDownload size={16} /> 
                        Update
                      </>
                    )}
                  </Button>
                </>
              )}
              
              {downloadComplete && !installing && (
                <>
                  <Button onClick={onClose}>
                    <FiX size={16} /> Close
                  </Button>
                  {downloadedFilePath !== 'browser-download' && downloadedFilePath !== 'direct-download' && (
                    <Button 
                      $primary 
                      onClick={handleInstall} 
                      disabled={installing}
                    >
                      <FiCheck size={16} /> Install
                    </Button>
                  )}
                </>
              )}
              
              {installing && (
                <Button disabled>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  >
                    <FiRefreshCw size={16} />
                  </motion.div>
                  Installing
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