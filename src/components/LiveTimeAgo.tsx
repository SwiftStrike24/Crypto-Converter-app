import React, { useState, useEffect } from 'react';

interface LiveTimeAgoProps {
  date: Date;
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

const LiveTimeAgo: React.FC<LiveTimeAgoProps> = ({ date }) => {
  const [timeAgo, setTimeAgo] = useState(() => formatTimeAgo(date));

  useEffect(() => {
    setTimeAgo(formatTimeAgo(date)); // Update immediately when date prop changes

    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(date));
    }, 1000);

    return () => clearInterval(interval);
  }, [date]);

  return <>{timeAgo}</>;
};

export default LiveTimeAgo; 