/**
 * Utility functions for handling streaming responses from different AI providers
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

            // Emit reasoning_started event once if applicable
            if (isReasoningModel && !reasoningStartedEmitted &&
              (eventType === 'response.created' || eventType === 'response.in_progress' || eventType === 'response.output_item.added')) {
              onChunk({ type: 'openai_reasoning_started' });
              reasoningStartedEmitted = true;
            }
            if (eventType === 'response.output_item.added' && json.item?.type === 'reasoning') {
              currentReasoningOutputIndex = json.output_index; // Store the index of the reasoning item
            }
            if (eventType === 'response.output_text.delta') {
              const textDelta = json.delta; // Assuming delta is the text string
              if (textDelta) {
                onChunk(textDelta); // Send raw text delta for artifact parsing
              }
            } else if (eventType === 'response.reasoning_summary_text.delta') {
              const summaryDelta = json.delta;
              if (summaryDelta !== undefined) {
                onChunk({ type: 'openai_reasoning_summary_delta', content: summaryDelta });
              }
            } else if (eventType === 'response.reasoning_summary_text.done') {
              // A single part/step of the reasoning is done.
              // We don't pass json.text here, as _appendReasoningSummary builds the full text from deltas.
              // We just signal that a part boundary might be needed.
              onChunk({ type: 'openai_reasoning_summary_part_ended' });
            } else if (eventType === 'response.output_item.done' && json.output_index === currentReasoningOutputIndex && json.item?.type === 'reasoning') {
              // All parts for the current reasoning output item are done.
              onChunk({ type: 'openai_reasoning_all_processing_done' });
              currentReasoningOutputIndex = null; // Reset for potential future reasoning items (though unlikely in same response)
            } else if (eventType === 'response.completed') {
              // This is a terminal event for the whole response
              // onDone will be called after the loop finishes
            } else if (eventType === 'response.failed' || eventType === 'error' || eventType === 'response.incomplete') {
              // These are terminal error/incomplete events
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
 * @param {Function} onChunk - Callback for each text chunk (content: string) => void
 * @param {Function} onDone - Callback when stream is complete (finalContent: string) => void
 * @param {Function} onError - Callback for error handling (error: Error) => void
 */
export async function handleAnthropicStream(stream, onChunk, onDone, onError) {
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
            if (json.type === 'content_block_delta' && json.delta?.text) {
              resultContent += json.delta.text;
              onChunk(json.delta.text);
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