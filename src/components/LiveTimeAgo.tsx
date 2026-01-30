import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import styled from 'styled-components';

interface LiveTimeAgoProps {
  date: Date;
  lastRefreshedTimestamp?: Date | null;
}

const NOW_TICK_MS = 30_000;

let nowMs = Date.now();
let nowTimer: number | null = null;
const nowListeners = new Set<() => void>();

function subscribeNow(listener: () => void): () => void {
  nowListeners.add(listener);
  if (nowTimer === null) {
    nowTimer = window.setInterval(() => {
      nowMs = Date.now();
      nowListeners.forEach((l) => l());
    }, NOW_TICK_MS);
  }

  return () => {
    nowListeners.delete(listener);
    if (nowListeners.size === 0 && nowTimer !== null) {
      window.clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

function getNowSnapshot(): number {
  return nowMs;
}

function useNowMs(): number {
  return useSyncExternalStore(subscribeNow, getNowSnapshot, getNowSnapshot);
}

const formatTimeAgo = (date: Date, now: number): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'just now';
  }

  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));

  if (seconds < 60) return 'just now';
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const TimeWrapper = styled.span`
  &.refreshed {
    transition: color 0.1s ease-in-out;
    color: #a78bfa;
    animation: fadeOutColor 1.5s forwards;
  }

  @keyframes fadeOutColor {
    from { color: #a78bfa; }
    to { color: inherit; }
  }
`;

const LiveTimeAgo: React.FC<LiveTimeAgoProps> = ({ date, lastRefreshedTimestamp }) => {
  const now = useNowMs();
  const timeAgo = useMemo(() => formatTimeAgo(date, now), [date, now]);
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    if (lastRefreshedTimestamp) {
      setRefreshed(true);
      const timer = setTimeout(() => setRefreshed(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [lastRefreshedTimestamp]);

  return <TimeWrapper className={refreshed ? 'refreshed' : ''}>{timeAgo}</TimeWrapper>;
};

export default LiveTimeAgo; 
