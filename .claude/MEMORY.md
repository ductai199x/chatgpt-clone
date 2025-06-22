# Memory Index

This file tracks investigation memories and findings from Claude Code sessions.

## Memory Files

### 📝 [memory-streaming-indexeddb-optimization.md](./memory-streaming-indexeddb-optimization.md)
**Date**: June 22, 2025  
**Problem**: Memory explosion during streaming (200MB → 5GB) when images present  
**Status**: ✅ **SOLVED**

**Quick Recap**: ChatGPT clone had severe memory issues during streaming responses with images. Root cause was Zustand persistence middleware serializing massive base64 image data to localStorage on every streaming chunk. Solution implemented IndexedDB file storage with file ID references and streaming-safe persistence (disabled during streaming). Result: 93% memory reduction, stable performance regardless of image count.

**Key Technical Solution**: IndexedDB storage + file IDs in state + streaming-safe persistence
**Files Modified**: 6 core files for complete file handling system overhaul
**Impact**: Production-ready fix with all functionality preserved

---

## Instructions for Future Memory Files

When creating new memory files:

1. **Descriptive naming**: Use format `memory-[problem-domain]-[solution-approach].md`
2. **Structure**: Include problem, investigation, solution, results, lessons learned
3. **Status tracking**: Mark as in-progress, solved, or failed
4. **File references**: List all files modified with brief descriptions
5. **Update this index**: Add entry with quick recap for easy reference

### Template for new memory files:
```markdown
# Memory: [Descriptive Title]

**Session Date**: [Date]
**Problem**: [Brief problem description]
**Status**: [In Progress/Solved/Failed]

## Problem Summary
[Detailed problem description]

## Investigation Process
[What was tried, what failed, what worked]

## Solution Implementation
[Technical solution details]

## Results and Validation
[Testing results, performance metrics]

## Files Modified
[List of changed files]

## Lessons Learned
[Key insights for future reference]
```