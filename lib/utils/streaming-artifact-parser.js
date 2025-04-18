import { generateId } from '@/lib/utils';

/**
 * Creates a stateful parser to process streaming text containing artifact tags.
 * Handles tags potentially split across stream chunks.
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
  };

  // Regex for start tag (non-greedy attributes)
  const startTagRegex = /<artifact\s+(.*?type="(\w+)".*?)>/i;
  const endTagRegex = /<\/artifact>/i;
  const attributeRegex = /(\w+)="([^"]*)"/g;

  // Regex to check for potential partial tags at the end of the buffer
  // Matches '<', '</', '<a', '</a', '<ar', '</ar', etc. up to the full tags
  const partialStartTagRegex = /<\s*a?r?t?i?f?a?c?t?\s*[^>]*$/i;
  const partialEndTagRegex = /<\/\s*a?r?t?i?f?a?c?t?\s*[^>]*$/i;


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
                const type = startMatch[2];
                const metadata = { type };
                let attrMatch;
                while ((attrMatch = attributeRegex.exec(attributesString)) !== null) {
                    if (attrMatch[1] !== 'type') metadata[attrMatch[1]] = attrMatch[2];
                }
                attributeRegex.lastIndex = 0; // Reset regex state

                const artifactId = generateArtifactId();
                state.isInsideArtifact = true;
                state.currentArtifactId = artifactId;
                state.currentArtifactMetadata = metadata;

                actions.push({ type: 'artifact_start', id: artifactId, metadata: metadata });

                // Move cursor past the start tag
                cursor = startIndex + tagLength;
                continue; // Continue processing from the new cursor position

            } else {
                // No complete start tag found. Check for partial start tag at the end.
                if (partialStartTagRegex.test(remainingBuffer)) {
                    // Potential partial start tag, leave it in the buffer and stop processing this chunk
                    break;
                } else {
                    // No start tag, emit remaining as text
                    actions.push({ type: 'text', content: remainingBuffer });
                    cursor = state.buffer.length; // Mark buffer as fully processed
                    break; // Stop processing this chunk
                }
            }

        } else { // Inside an artifact
            // Look for the end tag
            const endMatch = remainingBuffer.match(endTagRegex);

            if (endMatch && endMatch.index !== undefined) {
                const endIndex = cursor + endMatch.index;
                const tagLength = endMatch[0].length;

                // 1. Append artifact content before the end tag
                if (endIndex > cursor) {
                    actions.push({ type: 'artifact_content', id: state.currentArtifactId, content: state.buffer.substring(cursor, endIndex) });
                }

                // 2. Process the end tag
                const completedArtifactId = state.currentArtifactId;
                actions.push({ type: 'artifact_end', id: completedArtifactId });

                // Reset state
                state.isInsideArtifact = false;
                state.currentArtifactId = null;
                state.currentArtifactMetadata = null;

                // Move cursor past the end tag
                cursor = endIndex + tagLength;
                continue; // Continue processing from the new cursor position

            } else {
                // No complete end tag found. Check for partial end tag at the end.
                 if (partialEndTagRegex.test(remainingBuffer)) {
                    // Potential partial end tag, leave it in the buffer and stop processing this chunk
                    break;
                 } else {
                    // No end tag, emit remaining as artifact content
                    actions.push({ type: 'artifact_content', id: state.currentArtifactId, content: remainingBuffer });
                    cursor = state.buffer.length; // Mark buffer as fully processed
                    break; // Stop processing this chunk
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