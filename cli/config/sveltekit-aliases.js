/**
 * SvelteKit route aliases for Sailor CMS
 * This file is shared between the main CMS project and the CLI
 */

/**
 * Function to inject Sailor CMS configuration into a SvelteKit config
 * @param {string} configContent - The current svelte.config.js content
 * @returns {string} - Updated config content with aliases and remote functions
 */
export function injectSailorConfig(configContent) {
  // Check if Sailor config is already present
  if (configContent.includes('$sailor') && configContent.includes('remoteFunctions')) {
    return configContent; // Already has Sailor config
  }

  const sailorConfig = `    alias: {
      '$sailor': 'src/lib/sailor'
    },
    experimental: {
      remoteFunctions: true
    }`;

  // Find the kit configuration and add Sailor config
  if (configContent.includes('kit: {')) {
    // Insert config after the adapter line
    return configContent.replace(
      /(kit:\s*{[^}]*adapter:\s*adapter\(\)[^}]*)/,
      `$1,\n${sailorConfig}`
    );
  } else {
    // If no kit config, add it
    return configContent.replace(
      /(const config = {)/,
      `$1
  kit: {
    adapter: adapter(),
${sailorConfig}
  },`
    );
  }
}
