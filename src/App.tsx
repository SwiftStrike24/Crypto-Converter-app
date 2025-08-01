import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './components/Header';
import Converter from './components/Converter';
import Footer from './components/Footer';
import AddTokens from './pages/AddTokens';
import ManageTokens from './pages/ManageTokens';
import ChartPage from './pages/ChartPage';
import TechnicalAnalysisPage from './pages/TechnicalAnalysisPage';
import TrendingTokensPage from './pages/TrendingTokensPage'; // Import the new page
import NewsPage from './pages/NewsPage';
import { CryptoProvider } from './context/CryptoContext';
import { CryptoCompareProvider } from './context/CryptoCompareContext';
import { ExchangeRatesProvider } from './context/ExchangeRatesContext';
import { BorderBeam } from './components/BorderBeam';
import InstanceDialog from './pages/InstanceDialog';
import LoadingScreen from './components/LoadingScreen';

const AppContainer = styled.div<{ $isFullScreen?: boolean }>`
  width: ${props => props.$isFullScreen ? '100%' : '400px'};
  height: ${props => props.$isFullScreen ? '100%' : '300px'};
  background: #121212;
  border-radius: ${props => props.$isFullScreen ? '0' : '10px'};
  padding: 0;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  border: ${props => props.$isFullScreen ? 'none' : '1px solid rgba(255, 255, 255, 0.1)'};
  box-shadow: ${props => props.$isFullScreen ? 'none' : '0 8px 32px 0 rgba(0, 0, 0, 0.37)'};
  overflow: hidden;
  position: relative;
`;

const ContentContainer = styled.div`
  padding: 15px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const MainContentWrapper = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

const AppContent: React.FC = () => {
  const location = useLocation();
  const isFullScreen = location.pathname === '/add-tokens' || 
                      location.pathname === '/chart' || 
                      location.pathname === '/manage-tokens' ||
                      location.pathname === '/analysis' ||
                      location.pathname === '/trending' ||
                      location.pathname === '/news'; // Add news to full screen
  const [selectedCrypto, setSelectedCrypto] = useState('BTC');
  const [selectedFiat, setSelectedFiat] = useState('USD');

  useEffect(() => {
    // Resize electron window based on route
    const { ipcRenderer } = window.require('electron');
    if (location.pathname === '/chart') {
      ipcRenderer.send('set-window-size', { width: 1200, height: 800, isFullScreen: true });
    } else if (location.pathname === '/analysis') {
      ipcRenderer.send('set-window-size', { width: 800, height: 600, isFullScreen: true });
    } else if (location.pathname === '/add-tokens') {
      ipcRenderer.send('set-window-size', { width: 800, height: 830, isFullScreen: true });
    } else if (location.pathname === '/trending') {
      ipcRenderer.send('set-window-size', { width: 1200, height: 800, isFullScreen: true });
    } else if (location.pathname === '/news') {
      ipcRenderer.send('set-window-size', { width: 1200, height: 800, isFullScreen: true });
    } else if (isFullScreen) {
      ipcRenderer.send('set-window-size', { width: 800, height: 600, isFullScreen: true });
    } else {
      ipcRenderer.send('set-window-size', { width: 400, height: 300, isFullScreen: false });
    }
  }, [isFullScreen, location.pathname]);

  return (
    <Routes>
      <Route path="/add-tokens" element={<AddTokens />} />
      <Route path="/manage-tokens" element={<ManageTokens />} />
      <Route path="/chart" element={<ChartPage />} />
      <Route path="/analysis" element={<TechnicalAnalysisPage />} />
      <Route path="/trending" element={<TrendingTokensPage />} />
      <Route path="/news" element={<NewsPage />} />
      <Route path="/" element={
        <AppContainer $isFullScreen={false}>
          <BorderBeam />
          <MainContentWrapper>
            <Header selectedCrypto={selectedCrypto} selectedFiat={selectedFiat} />
            <ContentContainer>
              <Converter 
                onCryptoChange={setSelectedCrypto} 
                onFiatChange={setSelectedFiat}
                defaultCrypto={selectedCrypto}
                defaultFiat={selectedFiat}
              />
            </ContentContainer>
            <Footer />
          </MainContentWrapper>
        </AppContainer>
      } />
      <Route path="/instance-dialog" element={<InstanceDialog />} />
    </Routes>
  );
};

const App: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleUpdateSuccess = () => {
      window.dispatchEvent(new CustomEvent('show-update-notification', {
        detail: { message: '✅ Update successful!', type: 'success' }
      }));
    };

    if (typeof window.require === 'function') {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('update-successful', handleUpdateSuccess);

        return () => {
          ipcRenderer.removeAllListeners('update-successful');
        };
      } catch (error) {
        // Not in electron, so do nothing.
      }
    }
  }, []);

  return (
    <ExchangeRatesProvider>
      <CryptoProvider>
        <CryptoCompareProvider>
          <Router>
            <AnimatePresence mode="wait">
              {isLoading ? (
                <LoadingScreen key="loading" onFinish={() => setIsLoading(false)} />
              ) : (
                <motion.div
                  key="content"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <AppContent />
                </motion.div>
              )}
            </AnimatePresence>
          </Router>
        </CryptoCompareProvider>
      </CryptoProvider>
    </ExchangeRatesProvider>
  );
};

export default App;
