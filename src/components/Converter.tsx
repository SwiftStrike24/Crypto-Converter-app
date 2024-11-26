import React, { useState, useEffect, useRef } from 'react';
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
  -webkit-app-region: no-drag;
`;

const Input = styled.input`
  flex: 1;
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  font-size: 16px;
  -webkit-app-region: no-drag;

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
  -webkit-app-region: no-drag;

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

const ResultBox = styled.div`
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 4px;
  padding: 12px;
  margin-top: 10px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    background: rgba(139, 92, 246, 0.15);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0px);
  }

  &::before {
    content: "Copied!";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(139, 92, 246, 0.9);
    padding: 4px 12px;
    border-radius: 4px;
    color: white;
    font-size: 14px;
    opacity: 0;
    transition: all 0.3s ease;
    pointer-events: none;
  }

  &.copied::before {
    animation: showCopied 1s ease forwards;
  }

  @keyframes showCopied {
    0% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
    10% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    90% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.8);
    }
  }

  &::after {
    content: "Click to copy";
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &:hover::after {
    opacity: 1;
  }
`;

const Amount = styled.div`
  font-size: 20px;
  color: white;
  font-weight: 500;
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
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [lastEditedField, setLastEditedField] = useState<'crypto' | 'fiat'>('crypto');
  const { prices, loading } = useCrypto();
  const cryptoInputRef = useRef<HTMLInputElement>(null);
  const fiatInputRef = useRef<HTMLInputElement>(null);

  // Enhanced focus handling
  useEffect(() => {
    const electron = window.require('electron');
    const ipcRenderer = electron.ipcRenderer;

    const handleWindowFocus = () => {
      // Small delay to ensure window is fully focused
      setTimeout(() => {
        if (lastEditedField === 'crypto' && cryptoInputRef.current) {
          cryptoInputRef.current.focus();
        } else if (lastEditedField === 'fiat' && fiatInputRef.current) {
          fiatInputRef.current.focus();
        }
      }, 50);
    };

    // Listen for focus events from main process
    ipcRenderer.on('window-focused', handleWindowFocus);

    return () => {
      ipcRenderer.removeListener('window-focused', handleWindowFocus);
    };
  }, [lastEditedField]);

  // Input focus handlers
  const handleInputFocus = (field: 'crypto' | 'fiat') => {
    setLastEditedField(field);
  };

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

  // Add utility function for optimal decimals
  const getOptimalDecimals = (value: number, isCrypto: boolean): number => {
    if (isCrypto) {
      // For crypto amounts
      if (value >= 1000) return 2;
      if (value >= 1) return 4;
      if (value >= 0.1) return 6;
      return 8;
    } else {
      // For fiat amounts
      if (value >= 1000) return 0;
      if (value >= 100) return 1;
      if (value >= 10) return 2;
      if (value >= 1) return 3;
      return 4;
    }
  };

  const handleCryptoAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLastEditedField('crypto');
    const value = e.target.value;
    
    setError('');

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
      const decimals = getOptimalDecimals(converted, false);
      setFiatAmount(converted.toFixed(decimals));
    }
  };

  const handleFiatAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLastEditedField('fiat');
    const value = e.target.value;
    
    setError('');

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
      const decimals = getOptimalDecimals(converted, true);
      setCryptoAmount(converted.toFixed(decimals));
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

  const formatNumber = (value: string, isCrypto: boolean): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    
    const decimals = getOptimalDecimals(num, isCrypto);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  };

  const handleCopy = async () => {
    if (cryptoAmount && fiatAmount) {
      let textToCopy = '';
      textToCopy = lastEditedField === 'crypto' 
        ? formatNumber(fiatAmount, false)
        : formatNumber(cryptoAmount, true);
      
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopyFeedback(true);
        setTimeout(() => setCopyFeedback(false), 1000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  return (
    <ConverterContainer>
      <InputGroup>
        <Label htmlFor="crypto-amount">Cryptocurrency Amount</Label>
        <Input
          ref={cryptoInputRef}
          id="crypto-amount"
          type="text"
          value={cryptoAmount}
          onChange={handleCryptoAmountChange}
          onFocus={() => handleInputFocus('crypto')}
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
      </InputGroup>

      <InputGroup>
        <Label htmlFor="fiat-amount">Fiat Amount</Label>
        <Input
          ref={fiatInputRef}
          id="fiat-amount"
          type="text"
          value={fiatAmount}
          onChange={handleFiatAmountChange}
          onFocus={() => handleInputFocus('fiat')}
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

      {error && <ErrorMessage>{error}</ErrorMessage>}
      
      {(cryptoAmount || fiatAmount) && !error && (
        <ResultBox 
          onClick={handleCopy} 
          className={copyFeedback ? 'copied' : ''}
        >
          <Label>{lastEditedField === 'crypto' ? 'Converted to Fiat' : 'Converted to Crypto'}</Label>
          <Amount>
            {lastEditedField === 'crypto' 
              ? `${selectedFiat} ${formatNumber(fiatAmount, false)}`
              : `${selectedCrypto} ${formatNumber(cryptoAmount, true)}`}
          </Amount>
        </ResultBox>
      )}
    </ConverterContainer>
  );
};

export default Converter; 