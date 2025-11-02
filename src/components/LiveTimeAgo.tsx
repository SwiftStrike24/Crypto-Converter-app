import React, { useState, useEffect } from 'react';
import styled from 'styled-components';

interface LiveTimeAgoProps {
  date: Date;
  lastRefreshedTimestamp?: Date | null;
}

const formatTimeAgo = (date: Date): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'just now';
  }

  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  
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
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(date));
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    setTimeAgo(formatTimeAgo(date)); // Update immediately when date prop changes

    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(date));
    }, 1000);

    return () => clearInterval(interval);
  }, [date]);

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