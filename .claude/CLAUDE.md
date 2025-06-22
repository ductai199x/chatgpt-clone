# Claude Code Instructions & Codebase Guide

This file provides general instructions for conducting investigations, code writing rules, and codebase structure for future Claude Code sessions.

## Investigation Methodology

### 🔍 **Problem Diagnosis Approach**
1. **Systematic elimination**: Test hypotheses one by one with controlled experiments
2. **Multiple measurement tools**: Use both DevTools and Task Manager for memory issues
3. **Minimal reproduction**: Temporarily disable features to isolate root causes
4. **Document failed attempts**: Track what didn't work to avoid repeating efforts
5. **Validate solutions**: Test thoroughly before marking as complete

### 🧪 **Testing Strategy**
- **Memory issues**: Monitor both JavaScript heap (DevTools) and total process memory (Task Manager)
- **Performance issues**: Use browser performance profiling and real user scenarios
- **Functional issues**: Test all user flows and edge cases
- **Cross-provider compatibility**: Verify OpenAI, Anthropic, and Google AI integrations

## Code Writing Rules

### ✅ **Do's**
- **Follow existing patterns**: Match code style, naming conventions, and file organization
- **Use TypeScript properly**: Leverage existing type definitions and create new ones when needed
- **Maintain backward compatibility**: Ensure existing conversations and data still work
- **Handle errors gracefully**: Add proper error handling with user-friendly messages
- **Optimize for memory**: Be mindful of large data structures and memory leaks
- **Comment complex logic**: Explain non-obvious implementations
- **Use existing utilities**: Leverage established helper functions and hooks

### ❌ **Don'ts**
- **Don't break existing functionality**: Always test that current features still work
- **Don't ignore warnings**: Fix TypeScript errors and console warnings
- **Don't hardcode values**: Use constants and configuration where appropriate
- **Don't create memory leaks**: Clean up event listeners, intervals, and blob URLs
- **Don't skip error handling**: Always handle promise rejections and API failures
- **Don't violate React rules**: Follow hooks rules and avoid anti-patterns

### 🏗️ **Architecture Principles**
- **Separation of concerns**: Keep business logic separate from UI components
- **State management**: Use Zustand stores for global state, local state for component-specific data
- **File organization**: Group related functionality, use descriptive file names
- **Performance**: Implement lazy loading, memoization, and efficient re-rendering
- **Scalability**: Design for growth in users, conversations, and file sizes

## Codebase Structure

### 📁 **Root Level**
```
├── app/                          # Next.js app router pages
├── components/                   # React components
├── lib/                         # Core business logic and utilities
├── public/                      # Static assets
├── .claude/                     # Claude documentation (this folder)
└── package.json                 # Dependencies and scripts
```

### 📁 **Components Structure**
```
components/
├── ui/                          # Reusable UI components (shadcn/ui)
│   ├── button.js               # Button component with variants
│   ├── tooltip.js              # Tooltip component
│   └── ...                     # Other UI primitives
├── chat/                       # Chat-specific components
│   ├── chat-interface.js       # Main chat container with message list
│   ├── chat-message.js         # Individual message display with artifacts
│   ├── message-input.js        # Message input with file upload
│   ├── dom-tracked-image.js    # Memory-optimized image component
│   └── generated-files-display.js # Tool-generated files display
├── artifacts/                  # Code artifact components
│   ├── artifact-display.js     # Artifact viewer with syntax highlighting
│   └── ...                     # Artifact-related components
├── sidebar/                    # Sidebar components
│   ├── conversation-list.js    # List of conversations
│   └── ...                     # Sidebar-related components
└── settings/                   # Settings components
    ├── api-settings.js         # API provider configuration
    ├── data-settings.js        # Data export/import
    └── ...                     # Settings-related components
```

### 📁 **Lib Structure**
```
lib/
├── store/                      # Zustand state management
│   ├── chat-store.js          # Main chat state (conversations, messages, streaming)
│   ├── settings-store.js      # App settings (providers, models, preferences)
│   └── ui-store.js            # UI state (sidebar, modals, etc.)
├── utils/                      # Utility functions
│   ├── file-storage.js        # IndexedDB file storage system
│   ├── chat.js                # Chat formatting and message processing
│   ├── memory-profiler.js     # Memory usage tracking utilities
│   ├── streaming-handler.js   # Provider-specific streaming handlers
│   ├── streaming-artifact-parser.js # Artifact parsing from streams
│   ├── blob-converter.js      # Base64 to blob URL conversion
│   ├── file-handler.js        # File validation and processing
│   └── artifact-instruction.js # Artifact creation instructions
├── api/                        # API integration
│   └── api-service.js         # Unified API service for all providers
├── constants/                  # Application constants
│   └── file-types.js          # Accepted file types configuration
├── hooks/                      # Custom React hooks
│   ├── use-local-storage.js   # localStorage hook
│   └── use-media-query.js     # Responsive design hook
└── utils.js                   # General utility functions
```

### 📁 **App Structure (Next.js)**
```
app/
├── page.js                     # Main chat application page
├── layout.js                  # Root layout with providers
├── globals.css                 # Global styles and CSS variables
└── favicon.ico                 # App icon
```

## Key Technical Components

### 🗄️ **State Management (Zustand)**
- **chat-store.js**: Manages conversations, messages, artifacts, streaming state
- **settings-store.js**: API providers, models, user preferences, tools
- **ui-store.js**: UI state like sidebar visibility, modal states

### 🎨 **UI Framework (shadcn/ui + Tailwind)**
- **Consistent design system**: All components use shadcn/ui base components
- **Dark mode support**: CSS variables for theme switching
- **Responsive design**: Mobile-first approach with Tailwind classes

### 🔄 **Streaming Architecture**
- **Provider abstraction**: Unified interface for OpenAI, Anthropic, Google AI
- **Artifact parsing**: Real-time extraction of code artifacts from streams
- **Memory optimization**: Streaming-safe persistence to prevent memory explosions

### 📂 **File Handling System**
- **IndexedDB storage**: Large files stored efficiently outside localStorage
- **File ID references**: Conversation state only contains file IDs, not data
- **Lazy resolution**: Files loaded from IndexedDB only when needed
- **Multi-format support**: Images, PDFs, documents, code files

## Known Quirks & Important Notes

### ⚠️ **Memory Management**
- **Never store large base64 data in Zustand state** - use IndexedDB instead
- **Persistence is disabled during streaming** - prevents memory explosions
- **Blob URLs must be cleaned up** - use cleanup functions in useEffect
- **Monitor total process memory** - Task Manager more accurate than DevTools

### 🔧 **Development Considerations**
- **File imports**: Use `@/` alias for lib imports, relative paths for local files
- **Dynamic imports**: Remove `.js` extension for Next.js compatibility
- **Immer patterns**: Access objects from within draft state, not outside
- **Provider differences**: OpenAI, Anthropic, and Google have different API formats

### 🎯 **Performance Optimizations**
- **React.memo**: Used extensively for chat messages to prevent unnecessary re-renders
- **Blob URL conversion**: Base64 data URLs converted to blob URLs for memory efficiency
- **Component tracking**: Memory profiler tracks component renders and image renders
- **Lazy loading**: Files and images loaded on-demand from IndexedDB

### 🔗 **API Integration**
- **Unified service**: Single API service handles all providers with consistent interface
- **Tool support**: Dynamic tool enabling/disabling per provider
- **Error handling**: Comprehensive error handling with user-friendly messages
- **Streaming safety**: Proper cleanup and error handling for streaming responses

## Memory File Usage

### 📝 **Creating New Memory Files**
1. **Start each investigation** by creating a new memory file as a scratch pad
2. **Use descriptive naming**: `memory-[problem-domain]-[approach].md`
3. **Document as you go**: Track findings, failures, and progress in real-time
4. **Include technical details**: Code snippets, file changes, test results
5. **Update MEMORY.md index**: Add entry with quick recap when complete

### 📚 **Memory File Benefits**
- **Avoid repeating failed approaches**: Learn from previous investigation attempts
- **Maintain context**: Understanding of why specific solutions were chosen
- **Knowledge transfer**: Help future sessions understand design decisions
- **Debugging aid**: Reference for troubleshooting related issues

---

**Remember**: This codebase handles real-time AI conversations with file attachments. Always consider memory usage, streaming performance, and user experience when making changes.