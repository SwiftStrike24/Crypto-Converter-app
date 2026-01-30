import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios', () => {
  const get = vi.fn();
  const isAxiosError = vi.fn(() => false);
  return {
    default: { get, isAxiosError },
    get,
    isAxiosError,
  };
});

describe('cryptoApiService request deduplication', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('dedups identical /search requests', async () => {
    const axios = (await import('axios')).default as any;

    let resolve: ((value: any) => void) | null = null;
    axios.get.mockImplementation(() => new Promise((r) => { resolve = r; }));

    const { searchCoinGecko } = await import('./cryptoApiService');

    const p1 = searchCoinGecko('bitcoin');
    const p2 = searchCoinGecko('bitcoin');

    expect(axios.get).toHaveBeenCalledTimes(1);

    resolve?.({ data: { coins: [] }, headers: {} });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ coins: [] });
    expect(r2).toEqual(r1);
  });

  it('does not dedup different /search queries', async () => {
    const axios = (await import('axios')).default as any;

    axios.get
      .mockResolvedValueOnce({ data: { coins: [{ id: 'a' }] }, headers: {} })
      .mockResolvedValueOnce({ data: { coins: [{ id: 'b' }] }, headers: {} });

    const { searchCoinGecko } = await import('./cryptoApiService');

    const [r1, r2] = await Promise.all([
      searchCoinGecko('a'),
      searchCoinGecko('b'),
    ]);

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ coins: [{ id: 'a' }] });
    expect(r2).toEqual({ coins: [{ id: 'b' }] });
  });
});
