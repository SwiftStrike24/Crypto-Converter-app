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
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
`;

const App: React.FC = () => {
  return (
    <AppContainer>
      <Header />
      <Converter />
      <Footer />
    </AppContainer>
  );
};

export default App; 