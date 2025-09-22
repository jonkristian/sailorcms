/**
 * Enhanced content utilities for handling TipTap JSON, HTML conversion, and content formatting
 * Extends the existing core/utils/content.ts with developer-focused features
 */

import { tiptapJsonToHtml, isTiptapJson } from '../core/content/content';

/**
 * Render content to HTML (handles TipTap JSON and HTML strings)
 *
 * @example
 * ```typescript
 * const html = renderContent(post.content);
 * const html = renderContent(page.content);
 * ```
 */
export function renderContent(content: any): string {
  if (!content) return '';

  // If it's already HTML, return as is
  if (typeof content === 'string') {
    return content;
  }

  // If it's TipTap JSON, convert to HTML
  if (isTiptapJson(content)) {
    return tiptapJsonToHtml(content);
  }

  return '';
}

/**
 * Get excerpt from content
 *
 * @example
 * ```typescript
 * const excerpt = getExcerpt(post.content, 160);
 * const excerpt = getExcerpt(page.content, 300);
 * ```
 */
export function getExcerpt(content: any, length: number = 160, suffix: string = '...'): string {
  if (!content) return '';

  let text: string;

  // Handle different content types
  if (isTiptapJson(content)) {
    text = extractTextFromTiptap(content);
  } else if (typeof content === 'string') {
    text = stripHtmlTags(content);
  } else {
    return '';
  }

  // Clean up and normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  if (text.length <= length) {
    return text;
  }

  // Truncate to desired length
  let excerpt = text.substring(0, length);

  // Don't cut in the middle of a word
  const lastSpace = excerpt.lastIndexOf(' ');
  if (lastSpace > length * 0.8) {
    excerpt = excerpt.substring(0, lastSpace);
  }

  return excerpt + suffix;
}

/**
 * Extract plain text from TipTap JSON content
 */
function extractTextFromTiptap(jsonContent: any): string {
  if (!jsonContent || !isTiptapJson(jsonContent)) {
    return '';
  }

  function nodeToText(node: any): string {
    if (typeof node === 'string') {
      return node;
    }

    if (node.type === 'text') {
      return node.text || '';
    }

    if (node.type === 'paragraph' || node.type === 'heading') {
      const text = node.content?.map(nodeToText).join('') || '';
      return text + ' ';
    }

    if (node.type === 'listItem') {
      const text = node.content?.map(nodeToText).join('') || '';
      return '• ' + text + ' ';
    }

    // For all other nodes, just extract text from content
    return node.content?.map(nodeToText).join('') || '';
  }

  let text = jsonContent.content?.map(nodeToText).join('') || '';

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/**
 * Strip HTML tags from string
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
