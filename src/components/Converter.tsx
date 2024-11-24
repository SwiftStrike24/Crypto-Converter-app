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
  position: relative;
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

const ErrorMessage = styled.div`
  color: #ff4444;
  font-size: 12px;
  margin-top: 4px;
  position: absolute;
  bottom: -20px;
  left: 0;
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
  onFiatChange: (fiat: string) => void;
  defaultCrypto: string;
  defaultFiat: string;
}

const Converter: React.FC<ConverterProps> = ({ 
  onCryptoChange, 
  onFiatChange,
  defaultCrypto,
  defaultFiat
}) => {
  const [cryptoAmount, setCryptoAmount] = useState<string>('');
  const [fiatAmount, setFiatAmount] = useState<string>('');
  const [selectedCrypto, setSelectedCrypto] = useState(defaultCrypto);
  const [selectedFiat, setSelectedFiat] = useState(defaultFiat);
  const [error, setError] = useState<string>('');
  const { prices, loading } = useCrypto();

  // Reset inputs when switching assets
  useEffect(() => {
    setCryptoAmount('');
    setFiatAmount('');
    setError('');
  }, [selectedCrypto, selectedFiat]);

  const getRate = (cryptoId: string, fiat: string): number => {
    if (!prices[cryptoId]) return 0;
    return prices[cryptoId][fiat.toLowerCase()] || 0;
  };

  const handleCryptoAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Clear error
    setError('');

    // Validate input
    if (value === '') {
      setCryptoAmount('');
      setFiatAmount('');
      return;
    }

    if (!/^\d*\.?\d*$/.test(value)) {
      setError('Please enter a valid number');
      return;
    }

    const numValue = parseFloat(value);
    if (numValue < 0) {
      setError('Amount cannot be negative');
      return;
    }

    if (numValue > 1000000000) {
      setError('Amount is too large');
      return;
    }

    setCryptoAmount(value);
    const rate = getRate(cryptoIds[selectedCrypto], selectedFiat);
    if (rate) {
      const converted = numValue * rate;
      setFiatAmount(converted.toFixed(2));
    }
  };

  const handleFiatAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Clear error
    setError('');

    // Validate input
    if (value === '') {
      setCryptoAmount('');
      setFiatAmount('');
      return;
    }

    if (!/^\d*\.?\d*$/.test(value)) {
      setError('Please enter a valid number');
      return;
    }

    const numValue = parseFloat(value);
    if (numValue < 0) {
      setError('Amount cannot be negative');
      return;
    }

    if (numValue > 1000000000) {
      setError('Amount is too large');
      return;
    }

    setFiatAmount(value);
    const rate = getRate(cryptoIds[selectedCrypto], selectedFiat);
    if (rate) {
      const converted = numValue / rate;
      setCryptoAmount(converted.toFixed(8));
    }
  };

  // Handle crypto selection change
  const handleCryptoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCrypto = e.target.value;
    setSelectedCrypto(newCrypto);
    onCryptoChange(newCrypto);
  };

  // Handle fiat selection change
  const handleFiatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFiat = e.target.value;
    setSelectedFiat(newFiat);
    onFiatChange(newFiat);
  };

  return (
    <ConverterContainer>
      <InputGroup>
        <Label htmlFor="crypto-amount">Cryptocurrency Amount</Label>
        <Input
          id="crypto-amount"
          type="text"
          value={cryptoAmount}
          onChange={handleCryptoAmountChange}
          placeholder="0.00"
          aria-label="Cryptocurrency amount"
          disabled={loading}
        />
        <Select
          id="crypto-select"
          value={selectedCrypto}
          onChange={handleCryptoChange}
          title="Select Cryptocurrency"
          disabled={loading}
        >
          {cryptos.map((crypto) => (
            <option key={crypto} value={crypto}>
              {crypto}
            </option>
          ))}
        </Select>
        {error && <ErrorMessage>{error}</ErrorMessage>}
      </InputGroup>
      <InputGroup>
        <Label htmlFor="fiat-amount">Fiat Amount</Label>
        <Input
          id="fiat-amount"
          type="text"
          value={fiatAmount}
          onChange={handleFiatAmountChange}
          placeholder="0.00"
          aria-label="Fiat amount"
          disabled={loading}
        />
        <Select
          id="fiat-select"
          value={selectedFiat}
          onChange={handleFiatChange}
          title="Select Fiat Currency"
          disabled={loading}
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