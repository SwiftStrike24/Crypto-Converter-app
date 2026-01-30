import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { NewsArticle } from '../services/newsService';
import LiveTimeAgo from './LiveTimeAgo';

const CardWrapper = styled(motion.div)`
  position: relative;
  padding: 1rem;
  background: rgba(40, 42, 58, 0.6);
  border: 1px solid rgba(139, 92, 246, 0.2);
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  will-change: transform, box-shadow, border-color;

  &:hover {
    background: rgba(50, 52, 68, 0.85);
    border-color: rgba(139, 92, 246, 0.45);
    box-shadow: 0 8px 24px rgba(139, 92, 246, 0.25);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
`;

const TagRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  padding-right: 60px; /* Make space for sentiment badge */
`;

const Tag = styled.span<{ $variant?: 'chain' | 'tokenless' | 'category' | 'deal' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 999px;
  border: 1px solid rgba(139, 92, 246, 0.45);
  
  ${p => {
    if (p.$variant === 'tokenless') {
      return `
        color: #4ade80;
        background: linear-gradient(145deg, rgba(34,197,94,0.25), rgba(34,197,94,0.15));
      `;
    } else if (p.$variant === 'category') {
      return `
        color: #60a5fa;
        border-color: rgba(96, 165, 250, 0.45);
        background: linear-gradient(145deg, rgba(96,165,250,0.25), rgba(96,165,250,0.15));
      `;
    } else if (p.$variant === 'deal') {
      return `
        color: #fbbf24;
        border-color: rgba(251, 191, 36, 0.45);
        background: linear-gradient(145deg, rgba(251,191,36,0.25), rgba(251,191,36,0.15));
      `;
    } else {
      return `
        color: #ddd6fe;
        background: linear-gradient(145deg, rgba(139,92,246,0.25), rgba(139,92,246,0.15));
      `;
    }
  }}
  
  text-shadow: 0 0 6px rgba(0,0,0,0.15);
`;

const SentimentBadge = styled.div<{ $sentiment?: 'positive' | 'negative' | 'neutral' }>`
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: 1px solid;
  
  ${p => {
    switch (p.$sentiment) {
      case 'positive':
        return `
          color: #4ade80;
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.3);
        `;
      case 'negative':
        return `
          color: #f87171;
          background: rgba(248, 113, 113, 0.15);
          border-color: rgba(248, 113, 113, 0.3);
        `;
      default:
        return `
          color: #94a3b8;
          background: rgba(148, 163, 184, 0.15);
          border-color: rgba(148, 163, 184, 0.3);
        `;
    }
  }}
`;


const ArticleHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
`;

const ArticleImage = styled.img`
  width: 60px;
  height: 60px;
  border-radius: 8px;
  object-fit: cover;
  transition: transform 0.2s ease;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.2);
`;

const ArticleImagePlaceholder = styled.div`
  width: 60px;
  height: 60px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.05));
  border: 1px solid rgba(139, 92, 246, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
`;

const ArticleContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ArticleTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #e0e0e0;
  margin: 0 0 0.5rem 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.2s ease, font-weight 0.2s ease;

  ${CardWrapper}:hover & {
    font-weight: 700;
    color: #ffffff;
  }
`;

const ArticleSummary = styled.p`
  font-size: 0.85rem;
  color: #a0a0a0;
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
  transition: color 0.2s ease;

  ${CardWrapper}:hover & {
    color: #c0c0c0;
  }
`;

const ArticleFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
`;

const SourceInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const SourceName = styled.span`
  font-size: 0.8rem;
  color: #8b5cf6;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const RelatedSources = styled.div`
  font-size: 0.7rem;
  color: #64748b;
  margin-top: 4px;
  font-style: italic;
`;

const OpenButton = styled.button`
  background: linear-gradient(145deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.1));
  border: 1px solid rgba(139, 92, 246, 0.25);
  color: #c4b5fd;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);

  &:hover {
    background: linear-gradient(145deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.15));
    transform: translateY(-1px);
    color: #ddd6fe;
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 
      inset 0 1px 1px rgba(255, 255, 255, 0.08),
      0 4px 8px rgba(0, 0, 0, 0.2);
  }
`;

const ExternalLinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15,3 21,3 21,9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

interface NewsCardProps {
  article: NewsArticle;
  index: number;
}

// Helper function to validate image URLs
const isValidImageUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;

  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) return false;

    // Strict hostname validation - must be at least 4 characters and contain a dot
    if (!urlObj.hostname || urlObj.hostname.length < 4 || !urlObj.hostname.includes('.')) {
      return false;
    }

    // Check for obviously malformed hostnames
    if (urlObj.hostname.includes('..') || urlObj.hostname.startsWith('.') || urlObj.hostname.endsWith('.')) {
      return false;
    }

    // Check for common image extensions
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i;
    if (imageExtensions.test(url)) {
      return true;
    }

    // Check for known image hosting domains and CDNs - be more specific
    const imageHostingDomains = /\.(imgur|cloudinary|unsplash|pexels|pixabay|flickr|amazonaws|googleusercontent|wp|wordpress|gravatar|twimg|fbcdn|cdninstagram|ytimg)\.com$/i;
    if (imageHostingDomains.test(urlObj.hostname)) {
      return true;
    }

    // Be more strict with jwpsrv - only allow if it has proper path structure
    if (urlObj.hostname.includes('jwpsrv.com') && urlObj.pathname.includes('/') && urlObj.pathname.length > 10) {
      return true;
    }

    // Check for other common CDN patterns but be more strict
    const cdnPatterns = /(cdn\.|images\.|static\.|media\.|assets\.|thumb)/i;
    if (cdnPatterns.test(urlObj.hostname) && urlObj.pathname.length > 5) {
      return true;
    }

    // If URL contains common image-related keywords and has a reasonable path, it's likely an image
    const imageKeywords = /(image|img|photo|pic|thumb|avatar|logo|banner)/i;
    if (imageKeywords.test(url) && urlObj.pathname.length > 5) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const NewsCard: React.FC<NewsCardProps> = React.memo(({ article, index }) => {
  const [imageError, setImageError] = useState(false);

  const handleOpenArticle = (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      console.log('Opening news article in-app:', article.url);
      if (typeof window.cryptovertx?.links?.openInApp === 'function') {
        window.cryptovertx.links.openInApp(article.url);
      }
    } catch (error) {
      console.error('Failed to open article in internal browser:', error);
      // Fallback to external browser
      window.open(article.url, '_blank');
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Card click opens the article as well
    handleOpenArticle(e);
  };

  // Optimization: Only stagger animation for the first few items
  // Items appearing on scroll should appear almost instantly
  const shouldStagger = index < 12;

  return (
    <CardWrapper
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        // Cap delay to avoid empty spaces during fast scroll (virtualization)
        delay: shouldStagger ? index * 0.05 : 0,
        ease: [0.16, 1, 0.3, 1]
      }}
      whileHover={{
        scale: 1.02,
        borderColor: article.isHighImpact ? 'rgba(251, 191, 36, 0.6)' : 'rgba(139, 92, 246, 0.4)',
        boxShadow: article.isHighImpact ? '0 8px 24px rgba(251, 191, 36, 0.25)' : '0 8px 24px rgba(139, 92, 246, 0.15)',
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.98 }}
      onClick={handleCardClick}
      style={article.isHighImpact ? {
        borderColor: 'rgba(251, 191, 36, 0.4)',
        boxShadow: '0 0 12px rgba(251, 191, 36, 0.2), inset 0 0 0 1px rgba(251, 191, 36, 0.1)'
      } : undefined}
    >
      {article.sentiment && (
        <SentimentBadge $sentiment={article.sentiment}>
          {article.sentiment}
        </SentimentBadge>
      )}

      {((article.chains?.length ?? 0) > 0 || article.tokenless || (article.categories?.length ?? 0) > 0 || (article as any).fundingAmount || (article as any).fundingStage || (article as any).leadInvestor) && (
        <TagRow>
          {(article as any).fundingAmount && (
            <Tag $variant="deal">💰 {(article as any).fundingAmount}</Tag>
          )}
          {(article as any).fundingStage && (
            <Tag $variant="deal">🌱 {(article as any).fundingStage}</Tag>
          )}
          {(article as any).leadInvestor && (
            <Tag $variant="deal">🏆 Led by {(article as any).leadInvestor}</Tag>
          )}
          {(article as any).valuation && (
            <Tag $variant="deal">💎 {(article as any).valuation} Val</Tag>
          )}
          {article.chains?.map((c) => (
            <Tag key={c} $variant="chain">{c}</Tag>
          ))}
          {article.categories?.map((c) => (
            <Tag key={c} $variant="category">{c}</Tag>
          ))}
          {article.tokenless && <Tag $variant="tokenless">Tokenless</Tag>}
        </TagRow>
      )}

      <ArticleHeader>
        {!imageError && article.imageUrl && isValidImageUrl(article.imageUrl) ? (
          <ArticleImage
            src={article.imageUrl}
            alt={article.title}
            onError={() => {
              // Use React state to handle image error
              setImageError(true);
            }}
          />
        ) : (
          <ArticleImagePlaceholder>
            📰
          </ArticleImagePlaceholder>
        )}

        <ArticleContent>
          <ArticleTitle>{article.title}</ArticleTitle>
          {article.summary && (
            <ArticleSummary>{article.summary}</ArticleSummary>
          )}
        </ArticleContent>
      </ArticleHeader>

      <ArticleFooter>
        <SourceInfo>
          <SourceName>{article.source}</SourceName>
          <LiveTimeAgo date={new Date(article.publishedAt)} />
          {article.relatedSources && article.relatedSources.length > 0 && (
            <RelatedSources>
              + {article.relatedSources.length} other sources
            </RelatedSources>
          )}
        </SourceInfo>

        <OpenButton onClick={handleOpenArticle}>
          Read More
          <ExternalLinkIcon />
        </OpenButton>
      </ArticleFooter>
    </CardWrapper>
  );
});

export default NewsCard;