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
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return NextResponse.json({ 
          error: error.error?.message || `Failed to list container files: ${response.status}` 
        }, { status: response.status });
      }

      const data = await response.json();
      
      // Filter for assistant-generated files (not user-uploaded)
      const generatedFiles = data.data?.filter(file => file.source === 'assistant') || [];
      
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