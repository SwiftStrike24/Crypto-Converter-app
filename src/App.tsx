import React from 'react';
import styled from 'styled-components';
import Header from './components/Header';
import Converter from './components/Converter';
import Footer from './components/Footer';

const AppContainer = styled.div`
  width: 400px;
  height: 300px;
  background: rgba(18, 18, 18, 0.95);
  border-radius: 10px;
  padding: 0;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  overflow: hidden;
`;

const ContentContainer = styled.div`
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const App: React.FC = () => {
  return (
    <AppContainer>
      <Header />
      <ContentContainer>
        <Converter />
        <Footer />
      </ContentContainer>
    </AppContainer>
  );
};

export default App; 