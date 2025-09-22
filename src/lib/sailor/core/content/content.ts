/**
 * Content utilities for handling TipTap JSON and HTML conversion
 */

/**
 * Convert TipTap JSON content to HTML for rendering
 */
export function tiptapJsonToHtml(jsonContent: any): string {
  if (!jsonContent || typeof jsonContent !== 'object') {
    return '';
  }

  // If it's already HTML, return as is
  if (typeof jsonContent === 'string') {
    return jsonContent;
  }

  // Simple conversion from TipTap JSON to HTML
  // This is a basic implementation - you might want to use a more robust solution
  function nodeToHtml(node: any): string {
    if (typeof node === 'string') {
      return node;
    }

    if (node.type === 'doc') {
      return node.content?.map(nodeToHtml).join('') || '';
    }

    if (node.type === 'paragraph') {
      const content = node.content?.map(nodeToHtml).join('') || '';
      return `<p>${content}</p>`;
    }

    if (node.type === 'heading') {
      const level = node.attrs?.level || 1;
      const content = node.content?.map(nodeToHtml).join('') || '';
      return `<h${level}>${content}</h${level}>`;
    }

    if (node.type === 'bulletList') {
      const content = node.content?.map(nodeToHtml).join('') || '';
      return `<ul>${content}</ul>`;
    }

    if (node.type === 'orderedList') {
      const content = node.content?.map(nodeToHtml).join('') || '';
      return `<ol>${content}</ol>`;
    }

    if (node.type === 'listItem') {
      const content = node.content?.map(nodeToHtml).join('') || '';
      return `<li>${content}</li>`;
    }

    if (node.type === 'blockquote') {
      const content = node.content?.map(nodeToHtml).join('') || '';
      return `<blockquote>${content}</blockquote>`;
    }

    if (node.type === 'codeBlock') {
      const content = node.content?.map(nodeToHtml).join('') || '';
      return `<pre><code>${content}</code></pre>`;
    }

    if (node.type === 'text') {
      let text = node.text || '';

      // Apply marks
      if (node.marks) {
        for (const mark of node.marks) {
          if (mark.type === 'bold') {
            text = `<strong>${text}</strong>`;
          } else if (mark.type === 'italic') {
            text = `<em>${text}</em>`;
          } else if (mark.type === 'underline') {
            text = `<u>${text}</u>`;
          } else if (mark.type === 'strike') {
            text = `<s>${text}</s>`;
          } else if (mark.type === 'code') {
            text = `<code>${text}</code>`;
          } else if (mark.type === 'link') {
            const href = mark.attrs?.href || '#';
            text = `<a href="${href}">${text}</a>`;
          }
        }
      }

      return text;
    }

    // Default: just render content
    return node.content?.map(nodeToHtml).join('') || '';
  }

  return nodeToHtml(jsonContent);
}

/**
 * Check if content is TipTap JSON format
 */
export function isTiptapJson(content: any): boolean {
  return (
    content &&
    typeof content === 'object' &&
    content.type === 'doc' &&
    Array.isArray(content.content)
  );
}

/**
 * Format HTML with proper indentation and line breaks for readability
 */
export function formatHTML(html: string): string {
  if (!html) return '';

  // Simple HTML formatting - add line breaks and indentation
  return html
    .replace(/></g, '>\n<') // Add line breaks between tags
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';

      // Calculate indentation based on tag type
      let indent = 0;
      if (trimmed.startsWith('</')) {
        // Closing tag - reduce indent
        indent = Math.max(0, (trimmed.match(/<\//g) || []).length - 1);
      } else if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
        // Opening tag - increase indent
        indent = (trimmed.match(/</g) || []).length - 1;
      }

      return '  '.repeat(indent) + trimmed;
    })
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Clean up formatted HTML by removing line breaks and indentation
 */
export function cleanFormattedHTML(formattedHTML: string): string {
  return formattedHTML
    .replace(/\n\s*/g, '') // Remove line breaks and indentation
    .replace(/>\s+</g, '><') // Remove spaces between tags
    .trim();
}

/**
 * Convert HTML back to TipTap JSON format
 * This creates a basic JSON structure that TipTap can understand
 */
export function htmlToTiptapJson(html: string): any {
  if (!html) {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: []
        }
      ]
    };
  }

  // Simple conversion - this is a basic implementation
  // For more complex HTML, you might want to use a proper HTML parser
  const content = [];

  // Split by block elements and process each one
  const blockRegex = /<(h[1-6]|p|ul|ol|blockquote|pre|div)[^>]*>(.*?)<\/\1>/gs;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const [fullMatch, tag, innerContent] = match;

    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        const level = parseInt(tag.charAt(1));
        content.push({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: innerContent.replace(/<[^>]*>/g, '') }]
        });
        break;

      case 'p':
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: innerContent.replace(/<[^>]*>/g, '') }]
        });
        break;

      case 'ul':
        content.push({
          type: 'bulletList',
          content: parseListItems(innerContent, 'bulletList')
        });
        break;

      case 'ol':
        content.push({
          type: 'orderedList',
          content: parseListItems(innerContent, 'orderedList')
        });
        break;

      case 'blockquote':
        content.push({
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: innerContent.replace(/<[^>]*>/g, '') }]
            }
          ]
        });
        break;

      default:
        content.push({
          type: 'paragraph',
          content: [{ type: 'text', text: innerContent.replace(/<[^>]*>/g, '') }]
        });
    }
  }

  // If no block elements found, treat as paragraph
  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: html.replace(/<[^>]*>/g, '') }]
    });
  }

  return {
    type: 'doc',
    content
  };
}

/**
 * Parse list items from HTML
 */
function parseListItems(html: string, listType: 'bulletList' | 'orderedList'): any[] {
  const items = [];
  const itemRegex = /<li[^>]*>(.*?)<\/li>/gs;
  let match;

  while ((match = itemRegex.exec(html)) !== null) {
    const [, innerContent] = match;
    items.push({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: innerContent.replace(/<[^>]*>/g, '') }]
        }
      ]
    });
  }

  return items;
}
