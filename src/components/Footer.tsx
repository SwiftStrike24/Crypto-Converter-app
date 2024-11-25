import React from 'react';
import styled from 'styled-components';

const FooterContainer = styled.div`
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 5px;
`;

const Link = styled.a`
  color: #8b5cf6;
  text-decoration: none;
  
  &:hover {
    text-decoration: underline;
  }
`;

const Footer: React.FC = () => {
  return (
    <FooterContainer>
      Data provided by{' '}
      <Link href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
        CoinGecko
      </Link>
    </FooterContainer>
  );
};

export default Footer; 