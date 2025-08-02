import { rssEngine, NormalizedArticleSchema } from '../rssEngine';

// Mock dependencies
jest.mock('rss-parser');
jest.mock('sanitize-html');
jest.mock('p-queue');

const mockRSSParser = require('rss-parser');
const mockSanitizeHtml = require('sanitize-html');
const mockPQueue = require('p-queue');

describe('RSS Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockSanitizeHtml.mockImplementation((html: string) => html.replace(/<[^>]*>/g, ''));
    mockPQueue.mockImplementation(() => ({
      add: jest.fn(async (fn) => await fn()),
      size: 0,
      pending: 0
    }));
  });

  describe('Summary Generation', () => {
    it('should never return empty summaries', async () => {
      const mockFeedItems = [
        {
          title: 'Test Article',
          link: 'https://example.com/article1',
          contentSnippet: '', // Empty content
          content: '', // Empty content
          pubDate: new Date().toISOString(),
          guid: 'test-guid-1'
        }
      ];

      mockRSSParser.mockImplementation(() => ({
        parseURL: jest.fn().mockResolvedValue({
          title: 'Test Feed',
          items: mockFeedItems
        })
      }));

      const results = await rssEngine.fetchAll(['https://example.com/rss']);
      
      expect(results).toHaveLength(1);
      expect(results[0].summary).toBeTruthy();
      expect(results[0].summary.length).toBeGreaterThan(0);
      expect(results[0].summary).not.toBe('No summary available');
    });

    it('should prioritize content sources correctly', async () => {
      const mockFeedItems = [
        {
          title: 'Test Article with Rich Content',
          link: 'https://example.com/article1',
          'content:encoded': '<p>This is rich encoded content that should be prioritized.</p>',
          summary: 'This is a summary.',
          contentSnippet: 'This is a content snippet.',
          description: 'This is a description.',
          pubDate: new Date().toISOString(),
          guid: 'test-guid-1'
        }
      ];

      mockRSSParser.mockImplementation(() => ({
        parseURL: jest.fn().mockResolvedValue({
          title: 'Test Feed',
          items: mockFeedItems
        })
      }));

      const results = await rssEngine.fetchAll(['https://example.com/rss']);
      
      expect(results[0].summary).toContain('rich encoded content');
    });

    it('should generate fallback summaries from titles when content is missing', async () => {
      const mockFeedItems = [
        {
          title: 'Bitcoin Reaches New All-Time High as Institutional Adoption Continues to Grow Worldwide',
          link: 'https://example.com/article1',
          pubDate: new Date().toISOString(),
          guid: 'test-guid-1'
          // No content fields
        }
      ];

      mockRSSParser.mockImplementation(() => ({
        parseURL: jest.fn().mockResolvedValue({
          title: 'Test Feed',
          items: mockFeedItems
        })
      }));

      const results = await rssEngine.fetchAll(['https://example.com/rss']);
      
      expect(results[0].summary).toBeTruthy();
      expect(results[0].summary.length).toBeGreaterThan(20);
    });
  });

  describe('Data Normalization', () => {
    it('should normalize articles to valid schema', async () => {
      const mockFeedItems = [
        {
          title: 'Valid Article',
          link: 'https://example.com/article1',
          contentSnippet: 'This is a valid article summary.',
          pubDate: new Date().toISOString(),
          guid: 'test-guid-1',
          creator: 'John Doe',
          categories: ['Bitcoin', 'News']
        }
      ];

      mockRSSParser.mockImplementation(() => ({
        parseURL: jest.fn().mockResolvedValue({
          title: 'Test Feed',
          items: mockFeedItems
        })
      }));

      const results = await rssEngine.fetchAll(['https://example.com/rss']);
      
      expect(() => NormalizedArticleSchema.parse(results[0])).not.toThrow();
      expect(results[0]).toMatchObject({
        id: expect.any(String),
        url: 'https://example.com/article1',
        source: 'Test Feed',
        title: 'Valid Article',
        summary: expect.any(String),
        author: 'John Doe',
        categories: ['Bitcoin', 'News'],
        publishedAt: expect.any(Number),
        fetchedAt: expect.any(Number),
        fromCache: false
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockRSSParser.mockImplementation(() => ({
        parseURL: jest.fn().mockRejectedValue(new Error('Network error'))
      }));

      const results = await rssEngine.fetchAll(['https://invalid.com/rss']);
      
      expect(results).toEqual([]);
    });
  });
});