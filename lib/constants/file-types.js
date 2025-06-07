/**
 * File type definitions, icons, and MIME type mappings
 * Centralized configuration for file handling across the application
 */

/**
 * File extension to icon mapping
 * @param {string} filename - The filename to get an icon for
 * @returns {string} Emoji icon for the file type
 */
export function getFileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    // Images
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return '🖼️';
    
    // Data and Documents
    case 'csv':
      return '📊';
    case 'json':
      return '📋';
    case 'txt':
    case 'md':
      return '📄';
    case 'pdf':
      return '📕';
    case 'xlsx':
    case 'xls':
      return '📈';
    case 'doc':
    case 'docx':
      return '📝';
    case 'ppt':
    case 'pptx':
      return '📽️';
    case 'msg':
      return '📧';
    case 'vsd':
      return '📐';
    case 'mpp':
      return '📅';
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return '🗜️';
    
    // Top 20 Programming Languages (2024)
    // 1. Python
    case 'py':
    case 'pyw':
    case 'pyx':
    case 'pxd':
    case 'pxi':
      return '🐍';
    
    // 2. JavaScript & TypeScript  
    case 'js':
    case 'jsx':
    case 'mjs':
      return '🟨'; // Yellow square for JavaScript
    case 'ts':
    case 'tsx':
      return '🔷'; // Blue diamond for TypeScript
    
    // 3. Java
    case 'java':
    case 'jav':
    case 'j':
      return '☕';
    
    // 4. C# 
    case 'cs':
    case 'csx':
      return '🔷'; // Blue diamond for C#
    
    // 5. C/C++
    case 'c':
    case 'h':
      return '⚙️'; // Gear for C
    case 'cpp':
    case 'cxx':
    case 'cc':
    case 'hpp':
      return '⚡'; // Lightning for C++
    
    // 6. PHP
    case 'php':
    case 'php3':
    case 'php4':
    case 'php5':
    case 'phtml':
      return '🐘'; // Elephant for PHP
    
    // 7. Go (Golang)
    case 'go':
      return '🐹'; // Hamster/gopher for Go
    
    // 8. Rust
    case 'rs':
      return '🦀'; // Crab for Rust
    
    // 9. Swift
    case 'swift':
      return '🐦'; // Bird for Swift
    
    // 10. Kotlin
    case 'kt':
    case 'kts':
      return '🅺'; // K letter for Kotlin
    
    // 11. Ruby
    case 'rb':
    case 'rbw':
      return '💎'; // Diamond for Ruby
    
    // 12. R
    case 'r':
      return '📊'; // Chart for R (data science)
    
    // 13. MATLAB
    case 'm':
      return '📐'; // Math/engineering tool
    
    // 14. Scala
    case 'scala':
    case 'sc':
      return '🏗️'; // Building blocks for Scala
    
    // 15. Perl
    case 'pl':
    case 'pm':
    case 'perl':
      return '🐪'; // Camel for Perl
    
    // 16. Dart
    case 'dart':
      return '🎯'; // Dart/target for Dart
    
    // 17. Julia
    case 'jl':
      return '🔬'; // Science/research for Julia
    
    // 18. VBA
    case 'vba':
    case 'bas':
      return '📊'; // Chart for VBA
    
    // 19. Lua
    case 'lua':
      return '🌙'; // Moon for Lua
    
    // Web Technologies
    case 'html':
    case 'htm':
      return '🌐';
    case 'css':
      return '🎨';
    case 'xml':
      return '📄';
    
    // Shell Scripts
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return '🐚'; // Shell
    
    // Configuration Files
    case 'yml':
    case 'yaml':
      return '⚙️';
    case 'toml':
    case 'ini':
    case 'conf':
    case 'config':
      return '🔧';
    
    // Database
    case 'sql':
      return '🗃️';
    
    // Other Popular Languages
    case 'asm':
    case 's':
      return '🔩'; // Assembly
    case 'f':
    case 'f90':
    case 'f95':
      return '🧮'; // Fortran
    case 'pas':
      return '📐'; // Pascal
    case 'ada':
      return '🏛️'; // Ada
    case 'cob':
    case 'cobol':
      return '🏢'; // COBOL
    case 'lisp':
    case 'lsp':
      return '🧠'; // Lisp
    case 'hs':
      return '🎭'; // Haskell
    case 'ml':
      return '🧪'; // ML/OCaml
    case 'elm':
      return '🌳'; // Elm
    case 'ex':
    case 'exs':
      return '💊'; // Elixir
    case 'erl':
      return '📞'; // Erlang
    case 'clj':
    case 'cljs':
      return '🔗'; // Clojure
    
    default:
      return '📎';
  }
}

/**
 * MIME type to file extension mappings for file upload validation
 * Used by react-dropzone to validate file types
 */
export const ACCEPTED_FILE_TYPES = {
  // Images
  'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.svg'],
  
  // Documents and Data
  'text/*': ['.txt', '.md', '.csv'],
  'application/pdf': ['.pdf'],
  'application/json': ['.json'],
  'application/zip': ['.zip', '.rar', '.7z', '.tar', '.gz'],
  'text/csv': ['.csv'],
  
  // Microsoft Office files
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-outlook': ['.msg'],
  'application/vnd.visio': ['.vsd'],
  'application/vnd.ms-project': ['.mpp'],
  
  // Top 20 Programming Languages (2024)
  // Python
  'text/x-python': ['.py', '.pyw', '.pyx', '.pxd', '.pxi'],
  
  // JavaScript & TypeScript
  'text/javascript': ['.js', '.jsx', '.mjs'],
  'application/typescript': ['.ts', '.tsx'],
  
  // Java
  'text/x-java-source': ['.java', '.jav', '.j'],
  
  // C#
  'text/x-csharp': ['.cs', '.csx'],
  
  // C/C++
  'text/x-c': ['.c', '.h'],
  'text/x-c++': ['.cpp', '.cxx', '.cc', '.hpp'],
  
  // PHP
  'application/x-php': ['.php', '.php3', '.php4', '.php5', '.phtml'],
  
  // Go
  'text/x-go': ['.go'],
  
  // Rust
  'text/x-rust': ['.rs'],
  
  // Swift
  'text/x-swift': ['.swift'],
  
  // Kotlin
  'text/x-kotlin': ['.kt', '.kts'],
  
  // Ruby
  'text/x-ruby': ['.rb', '.rbw'],
  
  // R
  'text/x-r': ['.r', '.R'],
  
  // MATLAB
  'text/x-matlab': ['.m'],
  
  // Scala
  'text/x-scala': ['.scala', '.sc'],
  
  // Perl
  'text/x-perl': ['.pl', '.pm', '.perl'],
  
  // Dart
  'application/dart': ['.dart'],
  
  // Julia
  'text/x-julia': ['.jl'],
  
  // VBA
  'text/x-vba': ['.vba', '.bas'],
  
  // Lua
  'text/x-lua': ['.lua'],
  
  // Web Technologies
  'text/html': ['.html', '.htm'],
  'text/css': ['.css'],
  'application/xml': ['.xml'],
  
  // Shell Scripts
  'application/x-sh': ['.sh', '.bash', '.zsh', '.fish'],
  
  // Configuration Files
  'application/x-yaml': ['.yml', '.yaml'],
  'application/toml': ['.toml'],
  'text/plain': ['.ini', '.conf', '.config'],
  
  // Database
  'application/sql': ['.sql'],
  
  // Other Popular Languages
  'text/x-assembly': ['.asm', '.s'],
  'text/x-fortran': ['.f', '.f90', '.f95'],
  'text/x-pascal': ['.pas'],
  'text/x-ada': ['.ada'],
  'text/x-cobol': ['.cob', '.cobol'],
  'text/x-lisp': ['.lisp', '.lsp'],
  'text/x-haskell': ['.hs'],
  'text/x-ocaml': ['.ml'],
  'text/x-elm': ['.elm'],
  'text/x-elixir': ['.ex', '.exs'],
  'text/x-erlang': ['.erl'],
  'text/x-clojure': ['.clj', '.cljs'],
};

/**
 * Get content type from filename for HTTP responses
 * @param {string} filename - The filename to determine content type for
 * @returns {string} MIME type for the file
 */
export function getContentType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'csv': return 'text/csv';
    case 'txt': return 'text/plain';
    case 'json': return 'application/json';
    case 'pdf': return 'application/pdf';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls': return 'application/vnd.ms-excel';
    case 'doc': return 'application/msword';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'ppt': return 'application/vnd.ms-powerpoint';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'zip': return 'application/zip';
    case 'xml': return 'application/xml';
    case 'html':
    case 'htm': return 'text/html';
    case 'css': return 'text/css';
    case 'js': return 'text/javascript';
    default: return 'application/octet-stream';
  }
}