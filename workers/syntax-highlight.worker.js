// filepath: /home/tai/chatgpt-clone/workers/syntax-highlight.worker.js
import hljs from 'highlight.js/lib/core'; // Import core

// --- Register ONLY the languages you need ---
// Reduces bundle size significantly
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml'; // Includes HTML
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
// Add more language imports from 'highlight.js/lib/languages/...'

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('xml', xml); // HTML uses 'xml'
hljs.registerLanguage('html', xml); // Alias html to xml
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
// Register other imported languages

self.onmessage = (event) => {
  const { code, language } = event.data;

  if (!code || !language) {
    self.postMessage({ highlightedCode: code || '' });
    return;
  }

  try {
    let result;
    // Check if language is supported, otherwise auto-detect
    if (language !== 'text' && hljs.getLanguage(language)) {
      result = hljs.highlight(code, { language: language, ignoreIllegals: true });
    } else {
      // Fallback for 'text' or unsupported languages - render as plain text
      // Or use auto-detection (can be less reliable): result = hljs.highlightAuto(code);
      result = { value: escapeHtml(code) }; // Render plain text safely
    }

    self.postMessage({ highlightedCode: result.value });

  } catch (error) {
    console.error('[Worker] Error during syntax highlighting (highlight.js):', error);
    // Send back original code safely escaped
    self.postMessage({ highlightedCode: escapeHtml(code), error: error.message });
  }
};

// Simple HTML escaping function
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
