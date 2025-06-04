/**
 * Utility functions for handling streaming responses from different AI providers
 * 
 * ## Generic Event Structure
 * 
 * All providers emit standardized events that map to our internal reasoning state:
 * - `reasoning_started`: Reasoning/thinking process begins
 * - `reasoning_summary_delta`: Incremental reasoning content (text chunks)
 * - `reasoning_summary_part_done`: End of a reasoning step/part
 * - `reasoning_completed`: All reasoning finished
 * 
 * ## Provider-Specific Event Mappings
 * 
 * ### OpenAI Reasoning Models (/responses endpoint)
 * Uses `currentReasoningOutputIndex` to track reasoning across multiple output items:
 * 
 * ```
 * response.output_item.added (item.type=reasoning) → reasoning_started
 * response.reasoning_summary_text.delta → reasoning_summary_delta
 * response.reasoning_summary_text.done → reasoning_summary_part_done
 * response.output_item.done (reasoning index) → reasoning_completed
 * ```
 * 
 * Example sequence:
 * - `{"type":"response.output_item.added","output_index":0,"item":{"type":"reasoning"}}`
 * - `{"type":"response.reasoning_summary_text.delta","delta":"thinking..."}`
 * - `{"type":"response.reasoning_summary_text.done"}`
 * - `{"type":"response.output_item.done","output_index":0,"item":{"type":"reasoning"}}`
 * 
 * ### Anthropic Extended Thinking
 * Uses `currentThinkingContentIndex` to track thinking content blocks:
 * 
 * ```
 * content_block_start (content_block.type=thinking) → reasoning_started
 * content_block_delta (delta.type=thinking_delta) → reasoning_summary_delta
 * content_block_delta (delta.type=signature_delta) → reasoning_summary_part_done
 * content_block_stop (thinking index) → reasoning_completed
 * ```
 * 
 * Example sequence:
 * - `{"type":"content_block_start","index":0,"content_block":{"type":"thinking"}}`
 * - `{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}`
 * - `{"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"..."}}`
 * - `{"type":"content_block_stop","index":0}`
 * 
 * Key differences:
 * - Anthropic uses index-based content blocks (thinking=0, text=1+)
 * - Signature deltas provide cryptographic verification and signal reasoning step completion
 * - Content blocks can have multiple thinking/text sections in one response
 * 
 * ## Implementation Notes
 * 
 * 1. **Index Tracking**: Both providers require dynamic tracking of reasoning content:
 *    - OpenAI: Track `output_index` when reasoning item is added
 *    - Anthropic: Track `index` when thinking content block starts
 * 
 * 2. **Multiple Reasoning Steps**: Both providers can have multiple reasoning parts:
 *    - Each part ends with a completion signal (reasoning_summary_part_done)
 *    - Final completion signals end of all reasoning (reasoning_completed)
 * 
 * 3. **Error Handling**: Invalid JSON lines are logged but don't stop processing
 * 
 * 4. **Content Separation**: Regular text content is separate from reasoning content:
 *    - OpenAI: Different event types (output_text.delta vs reasoning_summary_text.delta)
 *    - Anthropic: Different content block indexes (text blocks use different index than thinking)
 */

/**
 * Parse an SSE response stream from OpenAI
 * @param {ReadableStream} stream - The SSE stream from the API
 * @param {Function} onChunk - Callback for each text chunk or structured event (chunkOrEvent: string | object) => void
 * @param {Function} onDone - Callback when stream is complete (finalContent: string) => void
 * @param {Function} onError - Callback for error handling (error: Error) => void
 * @param {object} [options={}] - Additional options.
 * @param {boolean} [options.isReasoningModel=false] - Flag to indicate if the model is an o-series model.
 */
export async function handleOpenAIStream(stream, onChunk, onDone, onError, options = {}) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const { isReasoningModel } = options;
  let reasoningStartedEmitted = false;
  let currentReasoningOutputIndex = null; // To track the output_index of the reasoning item

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process buffer for complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix

          if (data.trim() === '[DONE]') { // OpenAI uses [DONE] for /chat/completions, /responses uses specific events
            // For /responses, completion is signaled by response.completed or similar.
            // This [DONE] might not appear or might be ignorable for /responses.
            // We rely on specific terminal events from /responses.
            continue;
          }

          try {
            const json = JSON.parse(data);
            const eventType = json.type;

            // Handle reasoning models with official event patterns
            if (eventType === 'response.output_item.added' && json.item?.type === 'reasoning') {
              // Official reasoning start detection - when reasoning item is added to output
              currentReasoningOutputIndex = json.output_index;
              if (isReasoningModel && !reasoningStartedEmitted) {
                onChunk({ type: 'reasoning_started' });
                reasoningStartedEmitted = true;
              }
            } else if (eventType === 'response.output_text.delta') {
              // Regular text content streaming
              const textDelta = json.delta;
              if (textDelta) {
                onChunk(textDelta); // Send raw text delta for artifact parsing
              }
            } else if (eventType === 'response.reasoning_summary_text.delta') {
              // Official reasoning summary streaming
              const summaryDelta = json.delta;
              if (summaryDelta !== undefined) {
                onChunk({ type: 'reasoning_summary_delta', content: summaryDelta });
              }
            } else if (eventType === 'response.reasoning_summary_text.done') {
              // Official reasoning summary part completion
              onChunk({ type: 'reasoning_summary_part_done' });
            } else if (eventType === 'response.output_item.done' && json.output_index === currentReasoningOutputIndex && json.item?.type === 'reasoning') {
              // Official reasoning item completion
              onChunk({ type: 'reasoning_completed' });
              currentReasoningOutputIndex = null;
            } else if (eventType === 'response.completed') {
              // Official response completion
              // onDone will be called after the loop finishes
            } else if (eventType === 'response.failed' || eventType === 'error' || eventType === 'response.incomplete') {
              // Official error/incomplete events
              const errorMessage = json.message || json.error?.message || 'Stream ended with an error or incomplete status.';
              console.error(`OpenAI Stream Error/Incomplete Event:`, json);
              onError(new Error(errorMessage));
              reader.releaseLock(); // Release lock early on error
              return; // Stop processing on terminal error
            }
            // Add other event type handling here if needed in the future (e.g., tool calls)

          } catch (err) {
            // Ignore empty data lines or lines that are not valid JSON
            if (data.trim() !== '') {
              console.warn('Error parsing OpenAI SSE data line, skipping:', data, err);
            }
          }
        }
      }
    }

    // Process any remaining data
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      if (data.trim() !== '' && data.trim() !== '[DONE]') {
        try {
          const json = JSON.parse(data);
          // Handle any final event that might be in the buffer, similar to loop logic
          if (json.type === 'response.output_text.delta' && json.delta) {
            onChunk(json.delta);
          } else if (json.type === 'response.reasoning_summary_text.delta' && json.delta !== undefined) {
            onChunk({ type: 'openai_reasoning_summary_delta', content: json.delta });
          }
          // Note: 'openai_reasoning_summary_part_ended' and 'openai_reasoning_all_processing_done'
          // are typically not expected in the final buffer fragment but derived from specific event types.
        } catch (err) {
          console.warn('Error parsing final OpenAI SSE buffer, skipping:', data, err);
        }
      }
    }

    onDone();
  } catch (error) {
    console.error('Error reading stream:', error);
    onError(error);
  } finally {
    if (!reader.closed) { // Ensure lock is released if not already done by an early return
      reader.releaseLock();
    }
  }
}

/**
 * Parse an SSE response stream from Anthropic
 * @param {ReadableStream} stream - The SSE stream from the API
 * @param {Function} onChunk - Callback for each text chunk or structured event (chunkOrEvent: string | object) => void
 * @param {Function} onDone - Callback when stream is complete (finalContent: string) => void
 * @param {Function} onError - Callback for error handling (error: Error) => void
 * @param {object} [options={}] - Additional options.
 * @param {boolean} [options.isReasoningModel=false] - Flag to indicate if the model supports extended thinking.
 */
export async function handleAnthropicStream(stream, onChunk, onDone, onError, options = {}) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultContent = '';
  const { isReasoningModel } = options;
  let reasoningStartedEmitted = false;
  let currentThinkingContentIndex = null; // To track the index of the thinking content block

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process buffer for complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix

          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            
            if (json.type === 'content_block_start' && json.content_block?.type === 'thinking') {
              // Thinking block started - track the index and emit reasoning_started event
              currentThinkingContentIndex = json.index;
              if (isReasoningModel && !reasoningStartedEmitted) {
                onChunk({ type: 'reasoning_started' });
                reasoningStartedEmitted = true;
              }
            } else if (json.type === 'content_block_delta') {
              if (json.index === currentThinkingContentIndex && json.delta?.type === 'thinking_delta' && json.delta?.thinking) {
                // This is thinking content - emit as reasoning summary delta
                if (isReasoningModel) {
                  onChunk({ type: 'reasoning_summary_delta', content: json.delta.thinking });
                }
              } else if (json.index === currentThinkingContentIndex && json.delta?.type === 'signature_delta') {
                // Signature delta signals end of reasoning step - emit reasoning_summary_part_done
                if (isReasoningModel) {
                  onChunk({ type: 'reasoning_summary_part_done' });
                }
              } else if (json.delta?.type === 'text_delta' && json.delta?.text) {
                // This is regular text content (not thinking index)
                resultContent += json.delta.text;
                onChunk(json.delta.text);
              }
            } else if (json.type === 'content_block_stop' && json.index === currentThinkingContentIndex) {
              // Thinking block completed
              if (isReasoningModel) {
                onChunk({ type: 'reasoning_completed' });
                currentThinkingContentIndex = null; // Reset after completion
              }
            }
          } catch (err) {
            console.error('Error parsing Anthropic SSE data:', err);
          }
        }
      }
    }

    onDone(resultContent);
  } catch (error) {
    console.error('Error reading stream:', error);
    onError(error);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse an SSE response stream from Google AI (Gemini)
 * @param {ReadableStream} stream - The SSE stream from the API
 * @param {Function} onChunk - Callback for each text chunk (content: string) => void
 * @param {Function} onDone - Callback when stream is complete (finalContent: string) => void
 * @param {Function} onError - Callback for error handling (error: Error) => void
 */
export async function handleGoogleAIStream(stream, onChunk, onDone, onError) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process buffer for complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove 'data: ' prefix

          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const contentDelta = json.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (contentDelta) {
              resultContent += contentDelta;
              onChunk(contentDelta);
            }
          } catch (err) {
            console.error('Error parsing SSE data:', err);
          }
        }
      }
    }

    onDone(resultContent);
  } catch (error) {
    console.error('Error reading stream:', error);
    onError(error);
  } finally {
    reader.releaseLock();
  }
}