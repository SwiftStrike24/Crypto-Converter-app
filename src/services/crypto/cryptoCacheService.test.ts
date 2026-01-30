import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  setCachedData,
  getCachedDataFresh,
  getCachedDataAllowStale,
  pruneCacheKey,
} from './cryptoCacheService';

describe('cryptoCacheService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-28T00:00:00Z'));
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('returns fresh data before expiry', () => {
    setCachedData('k', { ok: true }, 1000);

    const fresh = getCachedDataFresh<{ ok: boolean }>('k');
    expect(fresh).not.toBeNull();
    expect(fresh?.data).toEqual({ ok: true });
    expect(fresh?.isStale).toBe(false);
    expect(fresh?.ageMs).toBe(0);
  });

  it('does not evict expired entries; allows stale reads', () => {
    setCachedData('k', { ok: true }, 1000);
    vi.advanceTimersByTime(1500);

    const fresh = getCachedDataFresh<{ ok: boolean }>('k');
    expect(fresh).toBeNull();

    const stale = getCachedDataAllowStale<{ ok: boolean }>('k');
    expect(stale).not.toBeNull();
    expect(stale?.data).toEqual({ ok: true });
    expect(stale?.isStale).toBe(true);
  });

  it('prunes entries older than maxAgeMs', () => {
    setCachedData('k', { ok: true }, 1000);
    vi.advanceTimersByTime(10_000);

    const removed = pruneCacheKey('k', 5_000);
    expect(removed).toBe(true);
    expect(getCachedDataAllowStale('k')).toBeNull();
  });

  it('removes corrupted cache entries on read', () => {
    localStorage.setItem('cryptovertx-cache-k', '{not valid json');
    expect(getCachedDataAllowStale('k')).toBeNull();
    expect(localStorage.getItem('cryptovertx-cache-k')).toBeNull();
  });
});
