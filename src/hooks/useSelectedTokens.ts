import { useState, useCallback } from 'react';

// Define the interface for a crypto result
// (Consider moving to a shared types file later if used elsewhere)
export interface ICryptoResult {
  id: string;
  symbol: string;
  name: string;
  image: string;
  market_cap_rank?: number;
}

export function useSelectedTokens() {
  const [selectedCryptos, setSelectedCryptos] = useState<Map<string, ICryptoResult>>(new Map());

  // Enhanced token selection with icon caching
  const toggleCryptoSelection = useCallback((crypto: ICryptoResult) => {
    setSelectedCryptos(prev => {
      const newMap = new Map(prev);
      
      if (newMap.has(crypto.id)) {
        newMap.delete(crypto.id);
      } else {
        newMap.set(crypto.id, crypto);
        
        // Pre-cache the token icon in localStorage for immediate use
        if (crypto.image) {
          try {
            // Use the correct cache key format to match what CryptoContext expects
            const iconCacheKey = `crypto_icon_${crypto.symbol.toLowerCase()}`;
            localStorage.setItem(iconCacheKey, crypto.image);
            
            // Also cache with ID for redundancy
            const idIconCacheKey = `crypto_icon_id-${crypto.id.toLowerCase()}`;
            localStorage.setItem(idIconCacheKey, crypto.image);
          } catch (error) {
            console.error('Error caching token icon during selection:', error);
            // Consider implementing more robust error handling or logging here
            // For now, we log the error and continue
          }
        } else {
           // For tokens without images, create a canvas placeholder immediately
          const symbol = crypto.symbol.toUpperCase();
          const iconCacheKey = `crypto_icon_${symbol.toLowerCase()}`;
          
          // Check if a placeholder already exists to avoid unnecessary redraws
          if (!localStorage.getItem(iconCacheKey)) {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 32;
              canvas.height = 32;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#8b5cf6'; // Use a consistent theme color
                ctx.beginPath();
                ctx.arc(16, 16, 16, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = 'white';
                ctx.font = 'bold 14px Arial'; // Standard font
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(symbol.charAt(0), 16, 16);
                
                const placeholderIcon = canvas.toDataURL();
                localStorage.setItem(iconCacheKey, placeholderIcon);
              }
            } catch (canvasError) {
              console.error('Error creating canvas fallback for token without image:', canvasError);
            }
          }
        }
      }
      
      return newMap;
    });
  }, []); // No external dependencies needed for setSelectedCryptos

  const removeSelectedCrypto = useCallback((id: string) => {
    setSelectedCryptos(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  }, []); // No external dependencies needed

  const clearAllTokens = useCallback(() => {
    setSelectedCryptos(new Map());
  }, []); // No external dependencies needed

  return {
    selectedCryptos,
    toggleCryptoSelection,
    removeSelectedCrypto,
    clearAllTokens,
  };
} 