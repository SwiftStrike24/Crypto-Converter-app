import React from 'react';
import styled from 'styled-components';

const HeaderContainer = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ExchangeRate = styled.div`
  font-size: 14px;
  color: #ffffff;
`;

const PowerButton = styled.button`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ff4444;
  border: none;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #ff0000;
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