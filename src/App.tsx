import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import Header from './components/Header';
import Converter from './components/Converter';
import Footer from './components/Footer';
import AddTokens from './pages/AddTokens';
import ManageTokens from './pages/ManageTokens';
import ChartPage from './pages/ChartPage';
import { CryptoProvider } from './context/CryptoContext';
import { CryptoCompareProvider } from './context/CryptoCompareContext';
import InstanceDialog from './pages/InstanceDialog';

const AppContainer = styled.div<{ isFullScreen?: boolean }>`
  width: ${props => props.isFullScreen ? '100vw' : '400px'};
  height: ${props => props.isFullScreen ? '100vh' : '300px'};
  background: rgba(18, 18, 18, 0.95);
  border-radius: ${props => props.isFullScreen ? '0' : '10px'};
  padding: 0;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  border: ${props => props.isFullScreen ? 'none' : '1px solid rgba(255, 255, 255, 0.1)'};
  box-shadow: ${props => props.isFullScreen ? 'none' : '0 8px 32px 0 rgba(0, 0, 0, 0.37)'};
  overflow: hidden;
`;

const ContentContainer = styled.div`
  padding: 15px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const AppContent: React.FC = () => {
  const location = useLocation();
  const isFullScreen = location.pathname === '/add-tokens' || 
                      location.pathname === '/chart' || 
                      location.pathname === '/manage-tokens';
  const [selectedCrypto, setSelectedCrypto] = useState('BTC');
  const [selectedFiat, setSelectedFiat] = useState('USD');

  useEffect(() => {
    // Resize electron window based on route
    const { ipcRenderer } = window.require('electron');
    if (isFullScreen) {
      ipcRenderer.send('set-window-size', { width: 800, height: 600, isFullScreen: true });
    } else {
      ipcRenderer.send('set-window-size', { width: 400, height: 300, isFullScreen: false });
    }
  }, [isFullScreen]);

  return (
    <Routes>
      <Route path="/add-tokens" element={<AddTokens />} />
      <Route path="/manage-tokens" element={<ManageTokens />} />
      <Route path="/chart" element={<ChartPage />} />
      <Route path="/" element={
        <AppContainer isFullScreen={false}>
          <Header selectedCrypto={selectedCrypto} selectedFiat={selectedFiat} />
          <ContentContainer>
            <Converter 
              onCryptoChange={setSelectedCrypto} 
              onFiatChange={setSelectedFiat}
              defaultCrypto={selectedCrypto}
              defaultFiat={selectedFiat}
            />
            <Footer />
          </ContentContainer>
        </AppContainer>
      } />
      <Route path="/instance-dialog" element={<InstanceDialog />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <CryptoProvider>
      <CryptoCompareProvider>
        <Router>
          <AppContent />
        </Router>
      </CryptoCompareProvider>
    </CryptoProvider>
  );
};

export default App;