import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import { useNavigate } from 'react-router-dom';

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

const fiats = ['USD', 'CAD', 'EUR'];

interface ConverterProps {
  onCryptoChange: (crypto: string) => void;
  onFiatChange: (fiat: string) => void;
  defaultCrypto: string;
  defaultFiat: string;
}

const ChartButton = styled.button`
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: transparent;
  color: #8b5cf6;
  border: 2px solid rgba(139, 92, 246, 0.3);
  border-radius: 50%;
  width: 48px;
  height: 48px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
  
  &:hover {
    transform: translateY(-2px) scale(1.05);
    border-color: #8b5cf6;
    color: #7c3aed;
    background: rgba(139, 92, 246, 0.1);
  }

  &:active {
    transform: translateY(0) scale(0.95);
    background: rgba(139, 92, 246, 0.2);
  }

  svg {
    width: 24px;
    height: 24px;
    transition: transform 0.3s ease;
    filter: drop-shadow(0 2px 4px rgba(139, 92, 246, 0.2));
  }

  &:hover svg {
    transform: scale(1.1);
    filter: drop-shadow(0 4px 8px rgba(139, 92, 246, 0.3));
  }

  @media (max-width: 768px) {
    width: 42px;
    height: 42px;
    bottom: 16px;
    right: 16px;

    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const ChartIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
  >
    <path d="M3 3v18h18" />
    <path d="M18 9l-5 5-2-2-4 4" />
    <circle cx="18" cy="9" r="1" />
    <circle cx="13" cy="14" r="1" />
    <circle cx="11" cy="12" r="1" />
    <circle cx="7" cy="16" r="1" />
  </svg>
);

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
  const { prices, loading, availableCryptos } = useCrypto();
  const cryptoInputRef = useRef<HTMLInputElement>(null);
  const fiatInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

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

  const getRate = (crypto: string, fiat: string): number => {
    if (!prices[crypto] || !prices[crypto][fiat.toLowerCase()]) {
      return 0;
    }
    return prices[crypto][fiat.toLowerCase()];
  };

  // Add utility function for optimal decimals
  const getOptimalDecimals = (value: number, isCrypto: boolean): number => {
    if (isCrypto) {
      // For crypto amounts
      if (value >= 1000) return 2;
      if (value >= 1) return 4;
      if (value >= 0.1) return 6;
      if (value >= 0.0001) return 8;
      return 8;  // Cap at 8 decimals for readability
    } else {
      // For fiat amounts
      if (value >= 1000) return 2;
      if (value >= 100) return 3;
      if (value >= 10) return 4;
      if (value >= 1) return 6;
      if (value >= 0.01) return 8;
      return 8;  // Cap at 8 decimals for readability
    }
  };

  const formatSmallNumber = (num: number): string => {
    // Convert to string to avoid scientific notation
    const str = num.toString();
    
    // If it's in scientific notation, convert it
    if (str.includes('e')) {
      const [base, exponent] = str.split('e');
      const exp = parseInt(exponent);
      if (exp < 0) {
        // Move decimal point left by adding zeros
        const absExp = Math.abs(exp);
        return '0.' + '0'.repeat(absExp - 1) + base.replace('.', '');
      }
    }
    
    // For regular numbers, ensure we show appropriate decimals
    const parts = str.split('.');
    if (parts.length === 2) {
      const decimals = Math.min(8, parts[1].length);
      return num.toFixed(decimals);
    }
    
    return str;
  };

  const formatNumber = (value: string, isCrypto: boolean): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    
    // For very small numbers, use special formatting
    if (!isCrypto && num < 0.01) {
      return formatSmallNumber(num);
    }

    const decimals = getOptimalDecimals(num, isCrypto);
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
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
    const rate = getRate(selectedCrypto, selectedFiat);
    if (rate) {
      const converted = numValue * rate;
      const decimals = getOptimalDecimals(converted, false);
      setFiatAmount(converted.toFixed(decimals));
    } else {
      setFiatAmount('N/A');
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
    const rate = getRate(selectedCrypto, selectedFiat);
    if (rate) {
      const converted = numValue / rate;
      const decimals = getOptimalDecimals(converted, true);
      setCryptoAmount(converted.toFixed(decimals));
    } else {
      setCryptoAmount('N/A');
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

  useEffect(() => {
    const resetState = () => {
      setCryptoAmount('');
      setFiatAmount('');
      setError('');
    };

    // Reset state when crypto selection changes
    resetState();
    
    // Update selected crypto if it's no longer available
    if (!availableCryptos.includes(selectedCrypto)) {
      setSelectedCrypto(availableCryptos[0]);
      onCryptoChange(availableCryptos[0]);
    }
  }, [selectedCrypto, selectedFiat, availableCryptos]);

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
          {availableCryptos.map((crypto) => (
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

      <ChartButton onClick={() => navigate('/chart', { 
        state: { 
          cryptoId: selectedCrypto, 
          currency: selectedFiat 
        }
      })}>
        <ChartIcon />
      </ChartButton>
    </ConverterContainer>
  );
};

export default Converter;