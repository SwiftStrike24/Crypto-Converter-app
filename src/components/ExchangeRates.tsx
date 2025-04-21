import React from 'react';
import { useExchangeRates } from '../context/ExchangeRatesContext';
import styled from 'styled-components';
import { CircularProgress } from '@mui/material';
import { MdRefresh } from 'react-icons/md';

const RatesContainer = styled.div`
  display: flex;
  flex-direction: column;
  background-color: rgba(30, 30, 30, 0.7);
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
  font-size: 0.9rem;
`;

const RatesHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const RatesTitle = styled.span`
  font-weight: 500;
  color: #aaa;
`;

const RefreshButton = styled.button`
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 50%;
  transition: all 0.2s;
  
  &:hover {
    color: #fff;
    background-color: rgba(80, 80, 80, 0.4);
  }
`;

const RateRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin: 4px 0;
  color: #ddd;
`;

const UpdatedText = styled.div`
  font-size: 0.8rem;
  color: #888;
  margin-top: 6px;
  text-align: right;
`;

const ErrorText = styled.div`
  color: #ff6b6b;
  font-size: 0.8rem;
  margin-top: 4px;
`;

const ExchangeRates: React.FC = () => {
  const { rates, lastUpdated, loading, error, refreshRates } = useExchangeRates();

  const handleRefresh = () => {
    refreshRates();
  };

  return (
    <RatesContainer>
      <RatesHeader>
        <RatesTitle>Exchange Rates</RatesTitle>
        <RefreshButton onClick={handleRefresh} disabled={loading}>
          {loading ? (
            <CircularProgress size={14} thickness={4} color="inherit" />
          ) : (
            <MdRefresh size={16} />
          )}
        </RefreshButton>
      </RatesHeader>
      
      <RateRow>
        <span>1 USD =</span>
        <span>{rates.CAD.toFixed(2)} CAD</span>
      </RateRow>
      
      <RateRow>
        <span>1 USD =</span>
        <span>{rates.EUR.toFixed(2)} EUR</span>
      </RateRow>
      
      {error ? (
        <ErrorText>{error}</ErrorText>
      ) : (
        <UpdatedText>Last updated: {lastUpdated}</UpdatedText>
      )}
    </RatesContainer>
  );
};

export default ExchangeRates; 