import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';

const ConverterContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 15px;
`;

const InputGroup = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
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
` as React.FC<React.SelectHTMLAttributes<HTMLSelectElement>>;

const Label = styled.label`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const cryptos = ['BTC', 'ETH', 'SOL', 'USDC', 'XRP'];
const fiats = ['USD', 'EUR', 'CAD'];

const cryptoIds: { [key: string]: string } = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple'
};

interface ConverterProps {
  onCryptoChange: (crypto: string) => void;
  defaultCrypto: string;
}

const Converter: React.FC<ConverterProps> = ({ onCryptoChange, defaultCrypto }) => {
  const [amount, setAmount] = useState<string>('');
  const [selectedCrypto, setSelectedCrypto] = useState(defaultCrypto);
  const [selectedFiat, setSelectedFiat] = useState('USD');
  const { prices, loading } = useCrypto();

  const convertedAmount = useMemo(() => {
    if (!amount || loading || !prices) return '';

    const cryptoId = cryptoIds[selectedCrypto];
    if (!prices[cryptoId]) return '';

    const rate = prices[cryptoId][selectedFiat.toLowerCase()];
    if (!rate) return '';

    const converted = parseFloat(amount) * rate;
    return converted.toFixed(2);
  }, [amount, selectedCrypto, selectedFiat, prices, loading]);

  // Handle crypto selection change
  const handleCryptoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCrypto = e.target.value;
    setSelectedCrypto(newCrypto);
    onCryptoChange(newCrypto);
  };

  return (
    <ConverterContainer>
      <InputGroup>
        <Label htmlFor="crypto-amount">Cryptocurrency Amount</Label>
        <Input
          id="crypto-amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          aria-label="Cryptocurrency amount"
        />
        <Select
          id="crypto-select"
          value={selectedCrypto}
          onChange={handleCryptoChange}
          title="Cryptocurrency"
        >
          {cryptos.map((crypto) => (
            <option key={crypto} value={crypto}>
              {crypto}
            </option>
          ))}
        </Select>
      </InputGroup>
      <InputGroup>
        <Label htmlFor="fiat-amount">Fiat Amount</Label>
        <Input
          id="fiat-amount"
          type="text"
          value={convertedAmount}
          readOnly
          placeholder="Converted amount"
          aria-label="Converted fiat amount"
        />
        <Select
          id="fiat-select"
          value={selectedFiat}
          onChange={(e) => setSelectedFiat(e.target.value)}
          title="Fiat Currency"
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