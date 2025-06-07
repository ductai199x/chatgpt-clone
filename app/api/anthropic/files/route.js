import { NextResponse } from 'next/server';
import { getContentType } from '@/lib/constants/file-types';

export async function POST(request) {
  try {
    const body = await request.json();
    const { apiKey, file_id: fileId, action } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    if (!fileId) {
      return NextResponse.json({ error: 'File ID required' }, { status: 400 });
    }

    const baseUrl = 'https://api.anthropic.com/v1';
    const headers = {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'code-execution-2025-05-22,files-api-2025-04-14',
      'Content-Type': 'application/json',
    };

    if (action === 'metadata') {
      // Get file metadata
      const response = await fetch(`${baseUrl}/files/${fileId}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return NextResponse.json({ 
          error: error.error?.message || `Failed to get file metadata: ${response.status}` 
        }, { status: response.status });
      }

      const metadata = await response.json();
      return NextResponse.json(metadata);
    }

    if (action === 'download' || !action) {
      // Download file content
      const response = await fetch(`${baseUrl}/files/${fileId}/content`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'code-execution-2025-05-22,files-api-2025-04-14',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return NextResponse.json({ 
          error: error.error?.message || `Failed to download file: ${response.status}` 
        }, { status: response.status });
      }

      // Get file metadata to determine filename and content type
      const metadataResponse = await fetch(`${baseUrl}/files/${fileId}`, {
        method: 'GET',
        headers,
      });

      let filename = `file_${fileId}`;
      let contentType = 'application/octet-stream';

      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();
        filename = metadata.filename || filename;
        
        // Determine content type from filename
        contentType = getContentType(filename);
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

    return NextResponse.json({ error: 'Invalid action. Use action=metadata or action=download' }, { status: 400 });

  } catch (error) {
    console.error('Anthropic files API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}