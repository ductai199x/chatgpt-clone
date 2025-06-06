import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { apiKey, container_id: containerId, file_id: fileId, action } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    if (!containerId) {
      return NextResponse.json({ error: 'Container ID required' }, { status: 400 });
    }

    const baseUrl = 'https://api.openai.com/v1';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (action === 'list' || !fileId) {
      // List container files
      const requestUrl = `${baseUrl}/containers/${containerId}/files`;
      
      // Enhanced debug logging - log exact request details
      console.log(`[OpenAI Files API] Making request to: ${requestUrl}`);
      console.log(`[OpenAI Files API] API Key (first 20 chars): ${apiKey?.substring(0, 20)}...`);
      console.log(`[OpenAI Files API] API Key (last 10 chars): ...${apiKey?.substring(apiKey.length - 10)}`);
      console.log(`[OpenAI Files API] Request headers:`, JSON.stringify(headers, null, 2));
      console.log(`[OpenAI Files API] Request method: GET`);
      console.log(`[OpenAI Files API] Container ID: ${containerId}`);
      
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers,
      });

      console.log(`[OpenAI Files API] Response status: ${response.status}`);
      console.log(`[OpenAI Files API] Response headers:`, JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.log(`[OpenAI Files API] Error response body:`, JSON.stringify(error, null, 2));
        return NextResponse.json({ 
          error: error.error?.message || `Failed to list container files: ${response.status}` 
        }, { status: response.status });
      }

      const data = await response.json();
      
      // Debug logging
      console.log(`[OpenAI Files API] Container ${containerId} - Total files: ${data.data?.length || 0}`);
      console.log(`[OpenAI Files API] Raw response:`, JSON.stringify(data, null, 2));
      
      // Filter for assistant-generated files (not user-uploaded)
      const generatedFiles = data.data?.filter(file => file.source === 'assistant') || [];
      
      console.log(`[OpenAI Files API] Filtered assistant files: ${generatedFiles.length}`);
      
      return NextResponse.json({
        container_id: containerId,
        generated_files: generatedFiles,
        total_files: data.data?.length || 0
      });
    }

    if (action === 'download' && fileId) {
      // Download specific file content
      const response = await fetch(`${baseUrl}/containers/${containerId}/files/${fileId}/content`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return NextResponse.json({ 
          error: error.error?.message || `Failed to download file: ${response.status}` 
        }, { status: response.status });
      }

      // Get file metadata first to determine filename and content type
      const metadataResponse = await fetch(`${baseUrl}/containers/${containerId}/files/${fileId}`, {
        method: 'GET',
        headers,
      });

      let filename = `file_${fileId}`;
      let contentType = 'application/octet-stream';

      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();
        const path = metadata.path || '';
        filename = path.split('/').pop() || filename;
        
        // Try to determine content type from file extension
        if (filename.endsWith('.png')) contentType = 'image/png';
        else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (filename.endsWith('.csv')) contentType = 'text/csv';
        else if (filename.endsWith('.txt')) contentType = 'text/plain';
        else if (filename.endsWith('.json')) contentType = 'application/json';
        else if (filename.endsWith('.pdf')) contentType = 'application/pdf';
      }

      // Stream the file content
      const fileContent = await response.arrayBuffer();
      
      return new NextResponse(fileContent, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': fileContent.byteLength.toString(),
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use action=list or action=download with file_id' }, { status: 400 });

  } catch (error) {
    console.error('OpenAI container files API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}