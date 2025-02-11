import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { useCrypto } from '../context/CryptoContext';
import { useNavigate } from 'react-router-dom';
import { FaMagnifyingGlassChart } from 'react-icons/fa6';

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

const Tooltip = styled.div`
  position: absolute;
  bottom: calc(100% + 12px);
  padding: 8px 12px;
  background: rgba(17, 17, 17, 0.95);
  color: white;
  font-size: 13px;
  border-radius: 6px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 1000;

  /* Right button tooltip */
  .right-button & {
    left: auto;
    right: 0;
    transform: translateY(4px);
    
    &::after {
      left: auto;
      right: 18px;
    }
  }

  /* Left button tooltip */
  .left-button & {
    left: 0;
    right: auto;
    transform: translateY(4px);
    
    &::after {
      left: 18px;
      right: auto;
    }
  }

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    border-width: 6px;
    border-style: solid;
    border-color: rgba(17, 17, 17, 0.95) transparent transparent transparent;
  }
`;

const ButtonWrapper = styled.div`
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;

  &.right-button:hover ${Tooltip} {
    opacity: 1;
    transform: translateY(0);
  }

  &.left-button:hover ${Tooltip} {
    opacity: 1;
    transform: translateY(0);
  }

  @media (max-width: 768px) {
    &.right-button {
      right: 16px;
      bottom: 16px;
    }
    &.left-button {
      left: 16px;
      bottom: 16px;
    }
  }
`;

const ChartButton = styled.button`
  position: relative;
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

    svg {
      width: 20px;
      height: 20px;
    }
  }
`;

const AnalysisButton = styled(ChartButton)``;

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

const AnalysisIcon = () => (
  <FaMagnifyingGlassChart />
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
  const { prices, availableCryptos } = useCrypto();
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

  const formatNumber = (value: string, isCrypto: boolean): string => {
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    
    // For crypto amounts, use more decimals
    if (isCrypto) {
      if (num < 0.000001) return num.toFixed(8);
      if (num < 0.0001) return num.toFixed(6);
      if (num < 0.01) return num.toFixed(4);
      return num.toFixed(2);
    }
    
    // For fiat amounts
    if (num >= 1000000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (num >= 1) return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 0.01) return num.toFixed(2);
    return num.toFixed(4);
  };

  const handleCryptoAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    setLastEditedField('crypto');
    
    // Remove all non-numeric characters except decimal point
    value = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    setCryptoAmount(value);
    if (value === '') {
      setFiatAmount('');
      return;
    }

    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      setError('Please enter a valid number');
      return;
    }

    const rate = getRate(selectedCrypto, selectedFiat);
    if (rate === 0) {
      setError('Price data unavailable');
      return;
    }

    const convertedAmount = (numericValue * rate).toString();
    setFiatAmount(convertedAmount);
    setError('');
  };

  const handleFiatAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    setLastEditedField('fiat');
    
    // Remove all non-numeric characters except decimal point
    value = value.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    setFiatAmount(value);
    if (value === '') {
      setCryptoAmount('');
      return;
    }

    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      setError('Please enter a valid number');
      return;
    }

    const rate = getRate(selectedCrypto, selectedFiat);
    if (rate === 0) {
      setError('Price data unavailable');
      return;
    }

    const convertedAmount = (numericValue / rate).toString();
    setCryptoAmount(convertedAmount);
    setError('');
  };

  // Add paste event handlers for both inputs
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, isCrypto: boolean) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    
    // Remove all non-numeric characters except decimal point
    const cleanedValue = pastedText.replace(/[^0-9.]/g, '');
    
    // Ensure only one decimal point
    const parts = cleanedValue.split('.');
    const value = parts[0] + (parts.length > 1 ? '.' + parts[1] : '');
    
    if (isCrypto) {
      setLastEditedField('crypto');
      setCryptoAmount(value);
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue)) {
        const rate = getRate(selectedCrypto, selectedFiat);
        const convertedAmount = (numericValue * rate).toString();
        setFiatAmount(convertedAmount);
        setError('');
      }
    } else {
      setLastEditedField('fiat');
      setFiatAmount(value);
      const numericValue = parseFloat(value);
      if (!isNaN(numericValue)) {
        const rate = getRate(selectedCrypto, selectedFiat);
        const convertedAmount = (numericValue / rate).toString();
        setCryptoAmount(convertedAmount);
        setError('');
      }
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
        <Label htmlFor="cryptoAmount">Crypto Amount</Label>
        <Input
          id="cryptoAmount"
          type="text"
          value={cryptoAmount}
          onChange={handleCryptoAmountChange}
          onPaste={(e) => handlePaste(e, true)}
          placeholder="0.00"
        />
        <Select
          value={selectedCrypto}
          onChange={handleCryptoChange}
        >
          {availableCryptos.map((crypto) => (
            <option key={crypto} value={crypto}>
              {crypto}
            </option>
          ))}
        </Select>
      </InputGroup>

      <InputGroup>
        <Label htmlFor="fiatAmount">Fiat Amount</Label>
        <Input
          id="fiatAmount"
          type="text"
          value={fiatAmount}
          onChange={handleFiatAmountChange}
          onPaste={(e) => handlePaste(e, false)}
          placeholder="0.00"
        />
        <Select
          value={selectedFiat}
          onChange={handleFiatChange}
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

      <ButtonWrapper className="right-button" style={{ bottom: '20px', right: '20px' }}>
        <ChartButton onClick={() => navigate('/chart', { 
          state: { 
            cryptoId: selectedCrypto, 
            currency: selectedFiat 
          }
        })}>
          <ChartIcon />
        </ChartButton>
        <Tooltip>View Price Chart</Tooltip>
      </ButtonWrapper>

      <ButtonWrapper className="left-button" style={{ bottom: '20px', left: '20px' }}>
        <AnalysisButton onClick={() => navigate('/analysis', { 
          state: { 
            cryptoId: selectedCrypto, 
            currency: selectedFiat 
          }
        })}>
          <AnalysisIcon />
        </AnalysisButton>
        <Tooltip>Technical Analysis</Tooltip>
      </ButtonWrapper>
    </ConverterContainer>
  );
};

export default Converter;