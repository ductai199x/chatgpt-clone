import { generateId } from '@/lib/utils';

// --- Configuration ---
// Threshold for emitting buffered artifact content (e.g., 1024 bytes = 1KB)
// Adjust this value based on testing for optimal performance vs. perceived latency
const CONTENT_BUFFER_THRESHOLD = 32;

/**
 * Creates a stateful parser to process streaming text containing artifact tags.
 * Handles tags potentially split across stream chunks.
 * Buffers artifact content to reduce action frequency.
 *
 * @param {object} options - Configuration options.
 * @param {string} [options.initialArtifactId=null] - If resuming an incomplete artifact, provide its ID.
 * @param {function} [options.generateArtifactId=() => generateId('art')] - Function to generate unique artifact IDs.
 * @returns {object} A parser instance with methods to process chunks and get state.
 */
export function createStreamingArtifactParser({
  initialArtifactId = null,
  generateArtifactId = () => generateId('art')
} = {}) {

  let state = {
    isInsideArtifact: !!initialArtifactId,
    currentArtifactId: initialArtifactId,
    currentArtifactMetadata: null,
    buffer: '', // Holds unprocessed text and partial tags
    contentBuffer: '', // Holds buffered content for the current artifact
  };

  /*
  // Regex for start tag (non-greedy attributes)
  const startTagRegex = /<artifact\s+(.*?)>/i;
  const endTagRegex = /<\/artifact>/i;
  const attributeRegex = /(\w+)="([^"]*)"/g;

  // Regex to check for potential partial tags at the end of the buffer
  // Matches '<', '</', '<a', '</a', '<ar', '</ar', etc. up to the full tags
  const partialStartTagRegex = /<\s*a?r?t?i?f?a?c?t?\s*[^>]*$/i;
  const partialEndTagRegex = /<\/\s*a?r?t?i?f?a?c?t?\s*[^>]*$/i;
  */

  // --- Optimized Regex ---
  // Start tag: Use [^>]*? for attributes (slightly more specific than .*?)
  const startTagRegex = /<artifact\s+([^>]*?)>/i;
  // End tag: Simple and efficient
  const endTagRegex = /<\/artifact>/i;
  // Attribute parsing: Standard and efficient
  const attributeRegex = /(\w+)="([^"]*)"/g;
  // --- Removed partial regex ---

  function processChunk(chunk) {
    state.buffer += chunk;
    const actions = [];
    let cursor = 0; // Position in the buffer up to which we have successfully processed

    while (true) {
      const remainingBuffer = state.buffer.substring(cursor);
      if (remainingBuffer.length === 0) break; // Nothing left to process

      if (!state.isInsideArtifact) {
        // Look for the start of an artifact tag
        const startMatch = remainingBuffer.match(startTagRegex);

        if (startMatch && startMatch.index !== undefined) {
          const startIndex = cursor + startMatch.index;
          const tagLength = startMatch[0].length;

          // 1. Append text before the tag
          if (startIndex > cursor) {
            actions.push({ type: 'text', content: state.buffer.substring(cursor, startIndex) });
          }

          // 2. Process the start tag
          const attributesString = startMatch[1];
          const metadata = {};
          let attrMatch;
          while ((attrMatch = attributeRegex.exec(attributesString)) !== null) {
            metadata[attrMatch[1].toLowerCase()] = attrMatch[2]; // Store all attributes, lowercase keys
          }
          attributeRegex.lastIndex = 0; // Reset regex state

          // Ensure type is set, default to 'unknown'
          if (!metadata.type) {
            metadata.type = 'unknown';
          }

          // 3. Generate a new artifact ID if not provided
          const artifactId = metadata.id || generateArtifactId();
          state.isInsideArtifact = true;
          state.currentArtifactId = artifactId;
          state.currentArtifactMetadata = metadata;
          state.contentBuffer = ''; // Reset content buffer for new artifact

          actions.push({ type: 'artifact_start', id: artifactId, metadata: metadata });

          // Move cursor past the start tag
          cursor = startIndex + tagLength;
          continue; // Continue processing from the new cursor position

        } else {
          // --- No start tag found: Check for potential partial tag at the end ---
          const lastOpenBracket = remainingBuffer.lastIndexOf('<');
          let isPartial = false;
          if (lastOpenBracket !== -1) {
            // Check if the text after '<' looks like the start of 'artifact' or '/artifact'
            const potentialTagStart = remainingBuffer.substring(lastOpenBracket).toLowerCase();
            if (potentialTagStart.startsWith('<artifact') || potentialTagStart.startsWith('</artifact') || potentialTagStart === '<' || potentialTagStart === '</') {
              // Check if there's no closing '>' after the last '<'
              if (remainingBuffer.indexOf('>', lastOpenBracket) === -1) {
                isPartial = true;
              }
            }
          }

          if (isPartial) {
            // Potential partial tag found at the end, wait for more data
            break;
          } else {
            // No start tag, no partial tag suspected, emit remaining as text
            actions.push({ type: 'text', content: remainingBuffer });
            cursor = state.buffer.length;
            break;
          }
        }

      } else { // Inside an artifact
        // Look for the end tag
        const endMatch = remainingBuffer.match(endTagRegex);
        if (endMatch && endMatch.index !== undefined) {
          const contentBeforeEnd = remainingBuffer.substring(0, endMatch.index);

          // --- Append content before end tag to buffer ---
          if (contentBeforeEnd.length > 0) {
            state.contentBuffer += contentBeforeEnd;
          }

          // --- Emit any remaining buffered content before ending ---
          if (state.contentBuffer.length > 0) {
            actions.push({ type: 'artifact_content', id: state.currentArtifactId, content: state.contentBuffer });
            state.contentBuffer = ''; // Clear buffer after emitting
          }

          // --- Emit end action ---
          const completedArtifactId = state.currentArtifactId;
          actions.push({ type: 'artifact_end', id: completedArtifactId });

          // --- Reset state ---
          state.isInsideArtifact = false;
          state.currentArtifactId = null;
          state.currentArtifactMetadata = null;

          cursor += endMatch.index + endMatch[0].length;
          continue;
        } else {
          // --- No end tag found: Check for potential partial end tag at the end ---
          const lastOpenBracket = remainingBuffer.lastIndexOf('<');
          let isPartial = false;
          if (lastOpenBracket !== -1) {
            // Check if the text after '<' looks like the start of '/artifact'
            const potentialTagStart = remainingBuffer.substring(lastOpenBracket).toLowerCase();
            if (potentialTagStart.startsWith('</artifact') || potentialTagStart === '</') {
              // Check if there's no closing '>' after the last '<'
              if (remainingBuffer.indexOf('>', lastOpenBracket) === -1) {
                isPartial = true;
              }
            }
          }

          if (isPartial) {
            // Potential partial end tag found at the end, wait for more data
            break;
          } else {
            // --- No end tag, no partial end tag suspected ---
            // Append remaining buffer to content buffer
            state.contentBuffer += remainingBuffer;
            cursor = state.buffer.length; // Mark buffer as processed

            // Emit buffered content if threshold reached (same as before)
            if (state.contentBuffer.length >= CONTENT_BUFFER_THRESHOLD) {
              actions.push({ type: 'artifact_content', id: state.currentArtifactId, content: state.contentBuffer });
              state.contentBuffer = '';
            }
            // Stop processing chunk, wait for more data
            break;
          }
        }
      }
    }

    // Update buffer: keep only the unprocessed part (potential partial tag)
    state.buffer = state.buffer.substring(cursor);

    return actions;
  }

  /**
   * Processes any remaining content in the buffer when the stream ends.
   * Useful to flush out final text or detect incompleteness.
   *
   * @returns {Array<object>} An array of action objects, similar to processChunk.
   */
  function flush() {
    const actions = [];
    // --- Emit any remaining buffered artifact content ---
    if (state.isInsideArtifact && state.contentBuffer.length > 0) {
      actions.push({ type: 'artifact_content', id: state.currentArtifactId, content: state.contentBuffer });
      state.contentBuffer = ''; // Clear buffer
    }
    // --- Handle remaining text in main buffer (if any) ---
    if (state.buffer.length > 0) {
      if (state.isInsideArtifact) {
        // If ended inside an artifact, treat remaining buffer as content
        actions.push({ type: 'artifact_content', id: state.currentArtifactId, content: state.buffer });
      } else {
        // If ended outside, treat remaining buffer as text
        actions.push({ type: 'text', content: state.buffer });
      }
      // Log a warning if buffer isn't empty on flush, might indicate issues
      console.warn("Streaming parser flushed non-empty buffer:", state.buffer);
    }
    state.buffer = ''; // Clear buffer after flushing
    return actions;
  }


  function isIncomplete() {
    // Check state *after* flushing any remaining buffer
    return state.isInsideArtifact;
  }

  function getIncompleteArtifactId() {
    return state.isInsideArtifact ? state.currentArtifactId : null;
  }

  return {
    processChunk,
    flush, // Expose the flush method
    isIncomplete,
    getIncompleteArtifactId,
  };
}