import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import axios from 'axios';

const ConverterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const InputGroup = styled.div`
  display: flex;
  gap: 10px;
`;

const Input = styled.input`
  flex: 1;
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  font-size: 16px;

  &:focus {
    outline: none;
    border-color: #8b5cf6;
  }
`;

const Select = styled.select`
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #8b5cf6;
  }

  option {
    background: #1a1a1a;
  }
`;

const cryptos = ['BTC', 'ETH', 'SOL', 'USDC', 'XRP'];
const fiats = ['USD', 'CAD', 'EUR'];

const Converter: React.FC = () => {
  const [amount, setAmount] = useState<string>('');
  const [selectedCrypto, setSelectedCrypto] = useState('BTC');
  const [selectedFiat, setSelectedFiat] = useState('USD');
  const [convertedAmount, setConvertedAmount] = useState<string>('');

  useEffect(() => {
    const fetchRate = async () => {
      if (!amount) {
        setConvertedAmount('');
        return;
      }

      try {
        const response = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,usd-coin,ripple&vs_currencies=usd,cad,eur`
        );

        // Map crypto symbols to CoinGecko IDs
        const cryptoIds: { [key: string]: string } = {
          BTC: 'bitcoin',
          ETH: 'ethereum',
          SOL: 'solana',
          USDC: 'usd-coin',
          XRP: 'ripple'
        };

        const rate = response.data[cryptoIds[selectedCrypto]][selectedFiat.toLowerCase()];
        const converted = parseFloat(amount) * rate;
        setConvertedAmount(converted.toFixed(2));
      } catch (error) {
        console.error('Error fetching rate:', error);
        setConvertedAmount('Error');
      }
    };

    fetchRate();
  }, [amount, selectedCrypto, selectedFiat]);

  return (
    <ConverterContainer>
      <InputGroup>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          aria-label="Cryptocurrency amount"
        />
        <Select
          value={selectedCrypto}
          onChange={(e) => setSelectedCrypto(e.target.value)}
          aria-label="Select cryptocurrency"
        >
          {cryptos.map((crypto) => (
            <option key={crypto} value={crypto}>
              {crypto}
            </option>
          ))}
        </Select>
      </InputGroup>
      <InputGroup>
        <Input
          type="text"
          value={convertedAmount}
          readOnly
          placeholder="Converted amount"
          aria-label="Converted fiat amount"
        />
        <Select
          value={selectedFiat}
          onChange={(e) => setSelectedFiat(e.target.value)}
          aria-label="Select fiat currency"
        >
          {fiats.map((fiat) => (
            <option key={fiat} value={fiat}>
              {fiat}
            </option>
          ))}
        </Select>
      </InputGroup>
    </ConverterContainer>
  );
};

export default Converter; 