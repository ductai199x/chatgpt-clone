/**
 * Utility functions for handling streaming responses from different AI providers
 * 
 * ## Architecture Overview
 * 
 * These handlers parse provider-specific SSE streams and emit standardized events
 * that are consumed by the chat store's onChunk callback. This abstraction allows
 * the UI layer to handle all providers uniformly.
 * 
 * ## Standardized Event Types
 * 
 * All provider handlers emit these common event types:
 * 
 * ### Message Events
 * - `message_started`: New message content begins
 * - `message_delta`: Incremental message content (with content field)
 * - `message_done`: Message content completed
 * 
 * ### Reasoning Events (for reasoning-capable models)
 * - `reasoning_started`: Thinking/reasoning process begins
 * - `reasoning_delta`: Incremental reasoning content (with content field)
 * - `reasoning_done`: Reasoning step completed
 * 
 * ### Tool Use Events (for tool-enabled providers)
 * - `tool_use_start`: Tool invocation begins (with tool object)
 * - `tool_input_delta`: Incremental tool input JSON (with delta field)
 * - `tool_result`: Tool execution result (with tool_use_id, tool_name, content)
 * 
 * ## Provider Implementation Details
 * 
 * ### OpenAI (/responses endpoint)
 * - Maps response.output_text.delta → message_delta
 * - Maps response.reasoning_summary_text.delta → reasoning_delta
 * - Tracks content by output_index and content_index
 * 
 * ### Anthropic (Messages API with extensions)
 * - Maps text_delta → message_delta
 * - Maps thinking_delta → reasoning_delta  
 * - Maps citations_delta → formatted citation links
 * - Maps server_tool_use events → tool_use_start/tool_input_delta
 * - Maps tool result events → tool_result
 * - Tracks content by index-based content blocks
 * 
 * ### Google AI (Gemini)
 * - Maps candidates[0].content.parts[0].text → message_delta
 * - TODO: Add reasoning and tool use support for Gemini models
 * 
 * ## Chat Store Integration
 * 
 * The chat store's _handleApiResponse processes these events via onChunk:
 * - message_* events → update message content and artifact parsing
 * - reasoning_* events → update reasoning array with thinking steps
 * - tool_* events → update reasoning array with tool use steps
 * 
 * ## Error Handling
 * 
 * - Invalid JSON lines are logged but don't stop processing
 * - Provider-specific errors are mapped to standardized error callbacks
 * - Stream readers are properly released in finally blocks
 */


/**
 * Parse an SSE response stream from OpenAI
 * @param {ReadableStream} stream - The SSE stream from the API
 * @param {Function} onChunk - Callback for each text chunk or structured event (chunkOrEvent: string | object) => void
 * @param {Function} onDone - Callback when stream is complete (finalContent: string) => void
 * @param {Function} onError - Callback for error handling (error: Error) => void
 */
export async function handleOpenAIStream(stream, onChunk, onDone, onError) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentContentIndex = null;
  let currentContentType = null;

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

            // Handle normal text response
            if (eventType === 'response.output_item.added' && json.item?.type === 'message') {
              currentContentType = 'text';
            } else if (eventType === 'response.content_part.added' && currentContentType === 'text') {
              onChunk({ type: 'message_started' });
              currentContentIndex = json.content_index;
            }
            else if (eventType === 'response.output_text.delta' && currentContentType === 'text' && json.content_index === currentContentIndex) {
              // Regular text content streaming
              onChunk({ type: 'message_delta', content: json.delta });
            } else if (eventType === 'response.output_text.done' && currentContentType === 'text' && json.content_index === currentContentIndex) {
              // Regular text content completion
              onChunk({ type: 'message_done' });
            } else if (eventType === 'response.content_part.done' && currentContentType === 'text') {
              currentContentIndex = null;
            } else if (eventType === 'response.output_item.done' && currentContentType === 'text') {
              currentContentType = null;
            }

            // Handle reasoning content
            else if (eventType === 'response.output_item.added' && json.item?.type === 'reasoning') {
              currentContentType = 'reasoning';
            } else if (eventType === 'response.reasoning_summary_part.added' && currentContentType === 'reasoning') {
              onChunk({ type: 'reasoning_started' });
              currentContentIndex = json.summary_index;
            } else if (eventType === 'response.reasoning_summary_text.delta' && currentContentType === 'reasoning' && json.summary_index === currentContentIndex) {
              onChunk({ type: 'reasoning_delta', content: json.delta });
            } else if (eventType === 'response.reasoning_summary_text.done' && currentContentType === 'reasoning' && json.summary_index === currentContentIndex) {
              onChunk({ type: 'reasoning_done' });
            } else if (eventType === 'response.reasoning_summary_part.done' && currentContentType === 'reasoning') {
              currentContentIndex = null;
            } else if (eventType === 'response.output_item.done' && currentContentType === 'reasoning') {
              currentContentType = null; // Reset after reasoning item completion
            }

            // Handle other event types
            else if (eventType === 'response.completed') {
              // onDone will be called after the loop finishes
            } else if (eventType === 'response.failed' || eventType === 'error' || eventType === 'response.incomplete') {
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
          const eventType = json.type;
          // Handle any final event that might be in the buffer, similar to loop logic
          if (eventType === 'response.output_text.delta' && json.delta) {
            onChunk({ type: 'message_delta', content: json.delta });
          } else if (eventType === 'response.reasoning_summary_text.delta' && json.delta !== undefined) {
            onChunk({ type: 'reasoning_delta', content: json.delta });
          }
          // Note: 'reasoning_done' are typically not expected in the final buffer fragment but derived from specific event types.
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
 */
export async function handleAnthropicStream(stream, onChunk, onDone, onError) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultContent = '';
  let currentContentIndex = null;
  let currentContentType = null;

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
            const eventType = json.type;
            // console.log(eventType, currentContentIndex, currentContentType, json);

            // Handle normal text content
            if (eventType === 'content_block_start' && json.content_block?.type === 'text') {
              currentContentIndex = json.index;
              currentContentType = 'text';
              onChunk({ type: 'message_started' });
            } else if (eventType === 'content_block_delta' && json.index === currentContentIndex && currentContentType === 'text') {
              if (json.delta.type === 'text_delta') {
                resultContent += json.delta.text;
                onChunk({ type: 'message_delta', content: json.delta.text });
              }
              else if (json.delta.type === 'citations_delta') {
                const citation = json.delta.citation;
                if (citation && citation.type === 'web_search_result_location') {
                  const url = citation.url;
                  const text_delta = `[ 🔗 ](${url})`;
                  onChunk({ type: 'message_delta', content: text_delta });
                }
              }
            } else if (eventType === 'content_block_stop' && json.index === currentContentIndex && currentContentType === 'text') {
              onChunk({ type: 'message_done' });
              currentContentIndex = null;
              currentContentType = null;
            }

            // Handle reasoning content
            else if (eventType === 'content_block_start' && json.content_block?.type === 'thinking') {
              onChunk({ type: 'reasoning_started' });
              currentContentIndex = json.index;
              currentContentType = 'thinking';
            } else if (eventType === 'content_block_delta' && currentContentType === 'thinking' && json.index === currentContentIndex) {
              if (json.delta.type === 'thinking_delta') {
                onChunk({ type: 'reasoning_delta', content: json.delta.thinking });
              }
            } else if (eventType === 'content_block_stop' && currentContentType === 'thinking' && json.index === currentContentIndex) {
              onChunk({ type: 'reasoning_done' });
              currentContentIndex = null;
              currentContentType = null;
            }

            // Handle tool use
            else if (eventType === 'content_block_start' && json.content_block?.type === 'server_tool_use') {
              onChunk({
                type: 'tool_use_start',
                tool: {
                  id: json.content_block.id,
                  name: json.content_block.name,
                  input: '',
                }
              });
              currentContentIndex = json.index;
              currentContentType = 'tool_use';
            } else if (eventType === 'content_block_delta' && json.delta?.type === 'input_json_delta' && currentContentType === 'tool_use' && json.index === currentContentIndex) {
              onChunk({
                type: 'tool_input_delta',
                delta: json.delta.partial_json || ''
              });
            } else if (eventType === 'content_block_stop' && currentContentType === 'tool_use' && json.index === currentContentIndex) {
              currentContentIndex = null;
              currentContentType = null;
            } else if (eventType === 'content_block_start' && json.content_block?.type === 'web_search_tool_result') {
              onChunk({
                type: 'tool_result',
                tool_use_id: json.content_block.tool_use_id,
                tool_name: 'web_search',
                content: json.content_block.content
              });
            } else if (eventType === 'content_block_start' && json.content_block?.type === 'code_execution_tool_result') {
              onChunk({
                type: 'tool_result',
                tool_use_id: json.content_block.tool_use_id,
                tool_name: 'code_execution',
                content: json.content_block.content
              });
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