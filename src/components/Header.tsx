import React from 'react';
import styled from 'styled-components';

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  -webkit-app-region: drag;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
`;

const ExchangeRate = styled.div`
  font-size: 14px;
  color: #ffffff;
  margin-right: 10px;
`;

const PowerButton = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ff4444;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  -webkit-app-region: no-drag;

  &:hover {
    background: #ff0000;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const Header: React.FC = () => {
  const handlePowerClick = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.send('quit-app');
  };

  return (
    <HeaderContainer>
      <PowerButton onClick={handlePowerClick} aria-label="Power off" />
      <ExchangeRate>1 BTC = $45,000 USD</ExchangeRate>
    </HeaderContainer>
  );
};

export default Header; 