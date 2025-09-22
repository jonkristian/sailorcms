import { highlight } from 'sugar-high';
import { mode } from 'mode-watcher';

/**
 * No initialization needed for sugar-high - it's much simpler!
 */
export async function initHighlighter() {
  return true; // Keep the function for compatibility
}

/**
 * Get CSS variables for the current theme
 */
export function getCurrentTheme(): string {
  return mode.current === 'dark' ? 'dark' : 'light';
}

/**
 * Escape HTML entities to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format JSON with syntax highlighting using sugar-high
 */
export async function formatJson(
  json: string | object,
  fontSize: string = '0.875rem'
): Promise<string> {
  try {
    const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    const parsed = JSON.parse(jsonString); // Validate JSON
    const formatted = JSON.stringify(parsed, null, 2);

    // Use sugar-high for highlighting - much lighter than shiki
    const highlighted = highlight(formatted);

    // Wrap with consistent styling - theme handled by CSS :global(.dark) selector
    return `<div class="sugar-high-wrapper" style="font-size: ${fontSize}; line-height: 1.5; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace;"><pre><code>${highlighted}</code></pre></div>`;
  } catch {
    // Return escaped plain text if JSON is invalid
    const jsonString = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    const escapedJson = escapeHtml(jsonString);
    return `<pre style="font-size: ${fontSize}; line-height: 1.5; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace;"><code>${escapedJson}</code></pre>`;
  }
}

/**
 * Format code with syntax highlighting using sugar-high
 */
export async function formatCode(
  code: string,
  language: string = 'json',
  fontSize: string = '0.875rem'
): Promise<string> {
  try {
    // Use sugar-high for highlighting - works for most languages
    const highlighted = highlight(code);

    // Wrap with consistent styling - theme handled by CSS :global(.dark) selector
    return `<div class="sugar-high-wrapper" style="font-size: ${fontSize}; line-height: 1.5; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace;"><pre><code>${highlighted}</code></pre></div>`;
  } catch {
    const escapedCode = escapeHtml(code);
    return `<pre style="font-size: ${fontSize}; line-height: 1.5; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Source Code Pro', monospace;"><code>${escapedCode}</code></pre>`;
  }
}

/**
 * Get the highlighter instance (for advanced usage)
 * Sugar-high doesn't need an instance - just returns true for compatibility
 */
export function getHighlighter() {
  return true;
}

/**
 * Re-highlight code when theme changes
 * With sugar-high, we just call formatCode again since it's lightweight
 */
export async function rehighlightCode(
  code: string,
  language: string = 'json',
  fontSize: string = '0.875rem'
): Promise<string> {
  return formatCode(code, language, fontSize);
}
