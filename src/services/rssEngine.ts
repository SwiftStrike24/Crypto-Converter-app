import { z } from 'zod';
import sanitizeHtml from 'sanitize-html';
import PQueue from 'p-queue';
import crypto from 'crypto';

// ============================================================================
// Types & Schemas
// ============================================================================

export const NormalizedArticleSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  source: z.string(),
  title: z.string(),
  summary: z.string(),
  imageUrl: z.string().url().optional(),
  author: z.string().optional(),
  categories: z.array(z.string()).optional(),
  publishedAt: z.number(),
  isDateApproximate: z.boolean().optional(),
  fetchedAt: z.number(),
  fromCache: z.boolean(),
});

export type NormalizedArticle = z.infer<typeof NormalizedArticleSchema>;

export const RssEngineOptionsSchema = z.object({
  requestTimeoutMs: z.number().positive().default(10000),
  maxRetries: z.number().min(0).default(3),
  concurrency: z.number().positive().default(3),
  cacheFreshMs: z.number().positive().default(10 * 60 * 1000), // 10 minutes
  cacheStaleMs: z.number().positive().default(60 * 60 * 1000), // 1 hour
  summaryTargetLength: z.number().positive().default(150),
});

export type RssEngineOptions = z.infer<typeof RssEngineOptionsSchema>;

interface FeedMeta {
  title?: string;
  description?: string;
  language?: string;
  lastModified?: string;
  etag?: string;
}

interface ParsedFeedItem {
  title?: string;
  description?: string;
  content?: string;
  contentSnippet?: string;
  link?: string;
  guid?: string;
  author?: string;
  categories?: string[];
  pubDate?: string;
  enclosure?: { url?: string; type?: string };
  'media:content'?: Array<{ $?: { url?: string } }>;
  'media:thumbnail'?: Array<{ $?: { url?: string } }>;
}

interface ParsedFeed {
  meta: FeedMeta;
  items: ParsedFeedItem[];
}

interface CacheEntry {
  data: NormalizedArticle[];
  timestamp: number;
  etag?: string;
  lastModified?: string;
}

// ============================================================================
// RSS Engine Implementation  
// ============================================================================

export class RssEngine {
  private options: Required<RssEngineOptions>;
  private cache = new Map<string, CacheEntry>();
  private queue: PQueue;
  private rateLimiters = new Map<string, PQueue>();

  constructor(options: Partial<RssEngineOptions> = {}) {
    this.options = RssEngineOptionsSchema.parse(options) as Required<RssEngineOptions>;
    this.queue = new PQueue({ 
      concurrency: this.options.concurrency,
      interval: 1000,
      intervalCap: this.options.concurrency * 2
    });
  }

  async fetchAll(feedUrls: string[], force: boolean = false): Promise<NormalizedArticle[]> {
    const traceId = this.generateTraceId();
    console.log(`[RSS_ENGINE:${traceId}] Starting fetch for ${feedUrls.length} feeds`, { force });

    const fetchPromises = feedUrls.map(url => 
      this.queue.add(() => this.fetchOne(url, force, traceId))
    );

    const results = await Promise.allSettled(fetchPromises);
    const allArticles: NormalizedArticle[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value && result.value.items.length > 0) {
        allArticles.push(...result.value.items);
        console.log(`[RSS_ENGINE:${traceId}] Success: ${feedUrls[index]} -> ${result.value.items.length} articles`);
      } else {
        const error = result.status === 'rejected' ? result.reason : 'No items returned';
        console.warn(`[RSS_ENGINE:${traceId}] Failed: ${feedUrls[index]}`, error);
      }
    });

    const deduplicated = this.dedupe(allArticles);
    console.log(`[RSS_ENGINE:${traceId}] Completed: ${allArticles.length} total -> ${deduplicated.length} deduplicated`);
    
    return deduplicated;
  }

  async fetchOne(url: string, force: boolean = false, traceId?: string): Promise<{ meta: FeedMeta; items: NormalizedArticle[] }> {
    const id = traceId || this.generateTraceId();
    const cacheKey = this.hashId(url);

    // Check cache first
    if (!force) {
      const cached = this.getCachedFeed(cacheKey);
      if (cached) {
        console.log(`[RSS_ENGINE:${id}] Cache hit for ${url}`);
        return { meta: {}, items: cached.map(item => ({ ...item, fromCache: true })) };
      }
    }

    try {
      console.log(`[RSS_ENGINE:${id}] Fetching ${url}`);
      
      // Get rate limiter for this host
      const hostname = new URL(url).hostname;
      const hostQueue = this.getHostQueue(hostname);

      const result = await hostQueue.add(async () => {
        const cached = this.cache.get(cacheKey);
        const headers: Record<string, string> = {
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          'User-Agent': 'CryptoVertX-RSS/1.0 (+https://cryptovertx.com/rss-bot)',
        };

        // Add conditional request headers
        if (cached?.etag) {
          headers['If-None-Match'] = cached.etag;
        }
        if (cached?.lastModified) {
          headers['If-Modified-Since'] = cached.lastModified;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.requestTimeoutMs);

        try {
          const response = await fetch(url, {
            headers,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // 304 Not Modified - serve from cache
          if (response.status === 304 && cached) {
            console.log(`[RSS_ENGINE:${id}] 304 Not Modified: ${url}`);
            return { meta: {}, items: cached.data.map(item => ({ ...item, fromCache: true })) };
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const xmlText = await response.text();
          const parsed = await this.parse(xmlText, response.headers.get('content-type') || '');
          
          const meta: FeedMeta = {
            ...parsed.meta,
            etag: response.headers.get('etag') || undefined,
            lastModified: response.headers.get('last-modified') || undefined,
          };

          const normalizedItems = parsed.items.map(item => 
            this.normalize(item, meta, url)
          );

          // Cache the results
          this.setCachedFeed(cacheKey, normalizedItems, meta);

          console.log(`[RSS_ENGINE:${id}] Successfully parsed ${normalizedItems.length} items from ${url}`);
          return { meta, items: normalizedItems };

        } finally {
          clearTimeout(timeoutId);
        }
      });

      if (!result) {
        throw new Error('No result returned from queue processing');
      }
      
      return result;

    } catch (error) {
      console.error(`[RSS_ENGINE:${id}] Error fetching ${url}:`, error);
      
      // Try to serve stale cache on error
      const staleCache = this.getStaleCache(cacheKey);
      if (staleCache) {
        console.log(`[RSS_ENGINE:${id}] Serving stale cache for ${url}`);
        return { meta: {}, items: staleCache.map(item => ({ ...item, fromCache: true })) };
      }

      return { meta: {}, items: [] };
    }
  }

  async parse(xmlOrJson: string, _contentType: string): Promise<ParsedFeed> {
    // Simple XML parsing for RSS/Atom feeds
    const meta: FeedMeta = {};
    const items: ParsedFeedItem[] = [];

    try {
      // Extract channel/feed metadata
      const titleMatch = xmlOrJson.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        meta.title = this.decodeHtmlEntities(titleMatch[1]);
      }

      const descMatch = xmlOrJson.match(/<description[^>]*>([^<]+)<\/description>/i);
      if (descMatch) {
        meta.description = this.decodeHtmlEntities(descMatch[1]);
      }

      // Extract items
      const itemMatches = xmlOrJson.match(/<(?:item|entry)[^>]*>[\s\S]*?<\/(?:item|entry)>/gi);
      
      if (itemMatches) {
        for (const itemXml of itemMatches.slice(0, 50)) { // Limit to 50 items
          const item: ParsedFeedItem = {};

          // Title
          const titleMatch = itemXml.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/si);
          if (titleMatch) {
            item.title = this.decodeHtmlEntities(titleMatch[1].trim());
          }

          // Description/Content
          const descMatch = itemXml.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/si);
          if (descMatch) {
            item.description = descMatch[1].trim();
            item.contentSnippet = this.stripHtml(item.description);
          }

          // Content:encoded (richer content)
          const contentMatch = itemXml.match(/<content:encoded[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content:encoded>/si);
          if (contentMatch) {
            item.content = contentMatch[1].trim();
          }

          // Link
          const linkMatch = itemXml.match(/<link[^>]*>([^<]+)<\/link>/i) || 
                           itemXml.match(/<link[^>]+href="([^"]+)"/i);
          if (linkMatch) {
            item.link = linkMatch[1].trim();
          }

          // GUID
          const guidMatch = itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i);
          if (guidMatch) {
            item.guid = guidMatch[1].trim();
          }

          // Author
          const authorMatch = itemXml.match(/<(?:author|dc:creator)[^>]*>([^<]+)<\/(?:author|dc:creator)>/i);
          if (authorMatch) {
            item.author = this.decodeHtmlEntities(authorMatch[1]);
          }

          // Categories
          const categoryMatches = itemXml.match(/<category[^>]*>([^<]+)<\/category>/gi);
          if (categoryMatches) {
            item.categories = categoryMatches.map(cat => 
              this.decodeHtmlEntities(cat.replace(/<[^>]+>/g, ''))
            );
          }

          // Publication date
          const pubDateMatch = itemXml.match(/<(?:pubDate|published|dc:date)[^>]*>([^<]+)<\/(?:pubDate|published|dc:date)>/i);
          if (pubDateMatch) {
            item.pubDate = pubDateMatch[1].trim();
          }

          // Enclosure
          const enclosureMatch = itemXml.match(/<enclosure[^>]+url="([^"]+)"[^>]*>/i);
          if (enclosureMatch) {
            item.enclosure = { url: enclosureMatch[1] };
          }

          // Media content
          const mediaContentMatch = itemXml.match(/<media:content[^>]+url="([^"]+)"[^>]*>/i);
          if (mediaContentMatch) {
            item['media:content'] = [{ $: { url: mediaContentMatch[1] } }];
          }

          items.push(item);
        }
      }

    } catch (error) {
      console.error('[RSS_ENGINE] Parse error:', error);
    }

    return { meta, items };
  }

  normalize(parsedItem: ParsedFeedItem, feedMeta: FeedMeta, feedUrl: string): NormalizedArticle {
    const now = Date.now();
    
    // Generate stable ID
    const id = this.generateStableId(parsedItem, feedUrl);
    
    // Extract and normalize URL
    const url = this.canonicalizeUrl(parsedItem.link || parsedItem.guid || '');
    
    // Get source name from feed or URL
    const source = feedMeta.title || new URL(feedUrl).hostname;
    
    // Extract and clean title
    const title = this.stripHtml(parsedItem.title || 'Untitled').substring(0, 200);
    
    // Parse publication date
    const { timestamp, isApproximate } = this.parseDate(parsedItem.pubDate);
    
    // Extract image
    const imageUrl = this.extractImage(parsedItem);
    
    // Extract categories
    const categories = parsedItem.categories || [];
    
    // Extract author
    const author = parsedItem.author;

    // Create base article (without summary)
    const baseArticle: Omit<NormalizedArticle, 'summary'> = {
      id,
      url,
      source,
      title,
      imageUrl,
      author,
      categories,
      publishedAt: timestamp,
      isDateApproximate: isApproximate,
      fetchedAt: now,
      fromCache: false,
    };

    // Ensure summary using fallback ladder
    const summary = this.ensureSummary(baseArticle, parsedItem);

    return { ...baseArticle, summary };
  }

  ensureSummary(article: Omit<NormalizedArticle, 'summary'>, parsedItem: ParsedFeedItem): string {
    // Priority order for summary extraction
    const candidates = [
      parsedItem.content || parsedItem.description,  // Rich content first
      parsedItem.contentSnippet,                     // Pre-cleaned snippet
      parsedItem.description,                        // Raw description
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate) {
        const cleaned = this.cleanSummary(candidate);
        if (cleaned.length >= 50) { // Minimum viable summary length
          return cleaned;
        }
      }
    }

    // Fallback to title + default text
    return this.generateFallbackSummary(article.title, article.source);
  }

  extractImage(parsedItem: ParsedFeedItem): string | undefined {
    // Priority order for image extraction
    const candidates = [
      // Media enclosures
      parsedItem.enclosure?.url,
      parsedItem['media:content']?.[0]?.$?.url,
      parsedItem['media:thumbnail']?.[0]?.$?.url,
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (this.isValidImageUrl(candidate!)) {
        return candidate;
      }
    }

    // Extract from HTML content
    const htmlContent = parsedItem.content || parsedItem.description || '';
    const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch && this.isValidImageUrl(imgMatch[1])) {
      return imgMatch[1];
    }

    return undefined;
  }

  dedupe(articles: NormalizedArticle[]): NormalizedArticle[] {
    const seen = new Set<string>();
    const deduped: NormalizedArticle[] = [];

    // Sort by publication date (newest first)
    const sorted = [...articles].sort((a, b) => b.publishedAt - a.publishedAt);

    for (const article of sorted) {
      // Create deduplication key from canonical URL and title hash
      const urlKey = this.canonicalizeUrl(article.url);
      const titleHash = crypto.createHash('md5').update(article.title.toLowerCase()).digest('hex').substring(0, 8);
      const dedupeKey = `${urlKey}:${titleHash}`;

      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        deduped.push(article);
      }
    }

    return deduped;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private cleanSummary(rawContent: string): string {
    // First pass: strip HTML and decode entities
    let cleaned = this.stripHtml(rawContent);
    cleaned = this.decodeHtmlEntities(cleaned);
    
    // Remove extra whitespace and normalize
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Truncate to target length
    if (cleaned.length > this.options.summaryTargetLength) {
      cleaned = cleaned.substring(0, this.options.summaryTargetLength - 3) + '...';
    }

    // Sanitize the result
    return sanitizeHtml(cleaned, {
      allowedTags: [],
      allowedAttributes: {},
    });
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
      .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  private parseDate(dateStr?: string): { timestamp: number; isApproximate: boolean } {
    if (!dateStr) {
      return { timestamp: Date.now(), isApproximate: true };
    }

    try {
      const parsed = new Date(dateStr);
      if (isNaN(parsed.getTime())) {
        return { timestamp: Date.now(), isApproximate: true };
      }
      return { timestamp: parsed.getTime(), isApproximate: false };
    } catch {
      return { timestamp: Date.now(), isApproximate: true };
    }
  }

  private canonicalizeUrl(url: string): string {
    if (!url) return '';
    
    try {
      const parsed = new URL(url);
      // Remove common tracking parameters
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source'];
      paramsToRemove.forEach(param => parsed.searchParams.delete(param));
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private isValidImageUrl(url: string): boolean {
    if (!url) return false;
    
    try {
      const parsed = new URL(url);
      return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(parsed.pathname) ||
             parsed.pathname.includes('/image') ||
             parsed.searchParams.has('image');
    } catch {
      return false;
    }
  }

  private generateStableId(item: ParsedFeedItem, feedUrl: string): string {
    // Use GUID if available, otherwise hash the link + title
    if (item.guid) {
      return crypto.createHash('sha256').update(item.guid).digest('hex').substring(0, 16);
    }
    
    const identifier = `${item.link || ''}:${item.title || ''}:${feedUrl}`;
    return crypto.createHash('sha256').update(identifier).digest('hex').substring(0, 16);
  }

  private generateFallbackSummary(title: string, source: string): string {
    return `Article from ${source}: ${title}`.substring(0, this.options.summaryTargetLength);
  }

  private generateTraceId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  private hashId(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex');
  }

  private getHostQueue(hostname: string): PQueue {
    if (!this.rateLimiters.has(hostname)) {
      this.rateLimiters.set(hostname, new PQueue({ 
        concurrency: 1,
        interval: 1000,
        intervalCap: 1 
      }));
    }
    return this.rateLimiters.get(hostname)!;
  }

  private getCachedFeed(cacheKey: string): NormalizedArticle[] | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age <= this.options.cacheFreshMs) {
      return cached.data;
    }

    return null;
  }

  private getStaleCache(cacheKey: string): NormalizedArticle[] | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age <= this.options.cacheStaleMs) {
      return cached.data;
    }

    return null;
  }

  private setCachedFeed(cacheKey: string, items: NormalizedArticle[], meta: FeedMeta): void {
    this.cache.set(cacheKey, {
      data: items,
      timestamp: Date.now(),
      etag: meta.etag,
      lastModified: meta.lastModified,
    });
  }
}

// ============================================================================
// Default Instance Export
// ============================================================================

export const rssEngine = new RssEngine();