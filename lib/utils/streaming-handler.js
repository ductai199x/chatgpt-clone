/**
 * Utility functions for handling streaming responses from different AI providers
 */

/**
 * Parse an SSE response stream from OpenAI
 * @param {ReadableStream} stream - The SSE stream from the API
 * @param {Function} onChunk - Callback for each text chunk (content: string) => void
 * @param {Function} onDone - Callback when stream is complete (finalContent: string) => void
 * @param {Function} onError - Callback for error handling (error: Error) => void
 */
export async function handleOpenAIStream(stream, onChunk, onDone, onError) {
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
            const contentDelta = json.choices?.[0]?.delta?.content || '';
            
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

    // Process any remaining data
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      if (data && data !== '[DONE]') {
        try {
          const json = JSON.parse(data);
          const contentDelta = json.choices?.[0]?.delta?.content || '';
          
          if (contentDelta) {
            resultContent += contentDelta;
            onChunk(contentDelta);
          }
        } catch (err) {
          console.error('Error parsing final SSE data:', err);
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