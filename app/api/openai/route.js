export async function POST(request) {
  try {
    const body = await request.json();
    const { apiKey, endpoint, ...requestData } = body;
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const apiEndpoint = endpoint || 'chat/completions';
    const url = `https://api.openai.com/v1/${apiEndpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(
        JSON.stringify({ error: errorData.error.message }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle streaming response
    if (requestData.stream) {
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    
    // Handle non-streaming response
    const data = await response.json();
    return new Response(
      JSON.stringify(data),
      { status: response.status, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in OpenAI API route:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}