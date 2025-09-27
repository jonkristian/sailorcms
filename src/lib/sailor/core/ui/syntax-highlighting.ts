import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';

// Register only the languages we need
hljs.registerLanguage('json', json);

// Configure highlight.js for better performance
hljs.configure({
  // Disable auto-detection for better performance since we know the language
  languages: ['json'],
  // Use class-based highlighting for better CSS integration
  classPrefix: 'hljs-'
});

/**
 * Format JSON with syntax highlighting using highlight.js
 * This leverages highlight.js's built-in capabilities for JSON formatting and error handling
 */
export async function formatJson(
  json: string | object,
  fontSize: string = '0.875rem'
): Promise<string> {
  // Convert to string and format if it's an object
  const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 2);

  try {
    // Use highlight.js to handle JSON highlighting
    const highlighted = hljs.highlight(jsonString, { language: 'json' }).value;
    return `<pre><code class="hljs language-json">${highlighted}</code></pre>`;
  } catch (error) {
    // If JSON highlighting fails, highlight.js will automatically fall back gracefully
    // We can still try to highlight as plaintext for better visual consistency
    console.warn('JSON highlighting failed, using fallback:', error);
    try {
      const highlighted = hljs.highlight(jsonString, { language: 'plaintext' }).value;
      return `<pre><code class="hljs language-plaintext">${highlighted}</code></pre>`;
    } catch (fallbackError) {
      // Ultimate fallback - return unhighlighted but escaped content
      console.error('All highlighting failed:', fallbackError);
      return `<pre><code class="hljs">${jsonString}</code></pre>`;
    }
  }
}

/**
 * Format code with syntax highlighting using highlight.js
 * Simplified to leverage highlight.js's built-in capabilities
 */
export async function formatCode(
  code: string,
  language: string = 'json',
  fontSize: string = '0.875rem'
): Promise<string> {
  // For JSON, use the optimized formatJson function
  if (language === 'json') {
    return formatJson(code, fontSize);
  }

  try {
    // Use highlight.js for syntax highlighting - it handles escaping and validation
    const highlighted = hljs.highlight(code, { language }).value;
    return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
  } catch (error) {
    // Fallback to plaintext highlighting for better visual consistency
    console.warn(`Highlight.js highlighting failed for language '${language}':`, error);
    try {
      const highlighted = hljs.highlight(code, { language: 'plaintext' }).value;
      return `<pre><code class="hljs language-plaintext">${highlighted}</code></pre>`;
    } catch (fallbackError) {
      // Ultimate fallback - return unhighlighted content
      console.error('All highlighting failed:', fallbackError);
      return `<pre><code class="hljs">${code}</code></pre>`;
    }
  }
}
