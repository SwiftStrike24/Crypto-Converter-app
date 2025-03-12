import React from 'react';
import styled from 'styled-components';
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
`;

const Link = styled.a`
  color: #8b5cf6;
  text-decoration: none;
  
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
  return (
    <FooterContainer>
      <div>
        Data provided by{' '}
        <Link href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
          CoinGecko
        </Link>
      </div>
      <VersionText>v{packageJson.version}</VersionText>
    </FooterContainer>
  );
};

export default Footer; 