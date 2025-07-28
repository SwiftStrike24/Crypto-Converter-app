import React from 'react';
import styled from 'styled-components';
import { ipcRenderer } from 'electron'; // Import ipcRenderer
// Import package.json for version
import packageJson from '../../package.json';

const FooterContainer = styled.div`
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: absolute;
  bottom: 5px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
`;

const LinkButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  display: inline;
  font-size: inherit;
  color: #8b5cf6;
  text-decoration: none;
  cursor: pointer;
  
  &:hover {
    text-decoration: underline;
  }
`;

const VersionText = styled.span`
  font-size: 10px;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 2px;
`;

const Footer: React.FC = () => {
  const handleOpenLinkInApp = (url: string) => {
    // Use ipcRenderer.send for one-way messages
    ipcRenderer.send('open-link-in-app', url);
  };

  return (
    <FooterContainer>
      <div>
        Data provided by{' '}
        <LinkButton onClick={() => handleOpenLinkInApp('https://www.coingecko.com')}>
          CoinGecko
        </LinkButton>
      </div>
      <VersionText>v{packageJson.version}</VersionText>
    </FooterContainer>
  );
};

export default Footer; 