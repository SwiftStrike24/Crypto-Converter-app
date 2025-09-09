import { useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useCrypto } from '../../context/CryptoContext';

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
`;

const SelectContainer = styled.div`
  position: relative;
  min-width: 220px;
`;

const SelectButton = styled.button<{ $open?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(139, 92, 246, 0.4); }

  .arrow { margin-left: auto; transform: rotate(${p => (p.$open ? 180 : 0)}deg); transition: transform 0.2s ease; }
`;

const Dropdown = styled.div<{ $open: boolean }>`
  display: ${p => (p.$open ? 'block' : 'none')};
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #141418;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  z-index: 40;
  overflow: hidden;
`;

const SearchBox = styled.input`
  width: 100%;
  padding: 10px 12px;
  background: #1b1b22;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  outline: none;
`;

const List = styled.div`
  max-height: 280px;
  overflow-y: auto;
  padding: 6px 0;

  &::-webkit-scrollbar { width: 8px; }
  &::-webkit-scrollbar-thumb { background: #2b2b32; border-radius: 4px; }
`;

const Item = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: ${p => (p.$selected ? 'rgba(139, 92, 246, 0.15)' : 'transparent')};
  border: none;
  color: #fff;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;

  &:hover { background: rgba(255, 255, 255, 0.07); }
`;

const Icon = styled.img`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #2a2a2a;
  object-fit: cover;
`;

const FallbackIcon = styled.div`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #8b5cf6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  &.loading { background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%); background-size: 200% 100%; animation: ${shimmer} 1.5s infinite; }
`;

const LabelText = styled.span`
  font-size: 14px;
`;

const ItemText = styled.span`
  font-size: 14px;
`;

const EmptyRow = styled.div`
  padding: 10px 12px;
  color: #999;
`;

interface TokenSelectorProps {
  selected: string;
  onChange: (symbol: string) => void;
}

export function TokenSelector({ selected, onChange }: TokenSelectorProps) {
  const { availableCryptos, tokenMetadata, getCryptoId } = useCrypto();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return availableCryptos.filter(sym => {
      if (!lower) return true;
      const id = getCryptoId(sym) || '';
      const name = (tokenMetadata[id]?.name || '').toLowerCase();
      return sym.toLowerCase().includes(lower) || name.includes(lower);
    });
  }, [availableCryptos, query, tokenMetadata, getCryptoId]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) { setOpen(false); }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <SelectContainer ref={containerRef}>
      <SelectButton $open={open} onClick={() => setOpen(v => !v)} aria-expanded={open} aria-haspopup="listbox">
        {(() => {
          const id = getCryptoId(selected);
          const img = id ? tokenMetadata[id]?.image : undefined;
          if (img) return <Icon src={img} alt={selected} />;
          return <FallbackIcon>{selected.charAt(0)}</FallbackIcon>;
        })()}
        <LabelText>{selected}</LabelText>
        <svg className="arrow" width="12" height="6" viewBox="0 0 12 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L6 5L11 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </SelectButton>
      <Dropdown $open={open} role="listbox">
        <SearchBox placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <List>
          {items.length === 0 && (
            <EmptyRow>No results</EmptyRow>
          )}
          {items.map(sym => {
            const id = getCryptoId(sym);
            const img = id ? tokenMetadata[id]?.image : undefined;
            return (
              <Item key={sym} $selected={sym === selected} onClick={() => { onChange(sym); setOpen(false); }}>
                {img ? <Icon src={img} alt={sym} /> : <FallbackIcon>{sym.charAt(0)}</FallbackIcon>}
                <ItemText>{sym}</ItemText>
              </Item>
            );
          })}
        </List>
      </Dropdown>
    </SelectContainer>
  );
}

export default TokenSelector;
