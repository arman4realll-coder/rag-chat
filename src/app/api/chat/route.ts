import { NextResponse } from 'next/server';

// Concise error messages for users
const ERROR_MESSAGES = {
  notConfigured: "Backend not configured. Please check your settings.",
  workflowInactive: "AI workflow is inactive. Please activate it in n8n.",
  workflowNotFound: "AI workflow not found. Check your webhook URL.",
  emptyResponse: "No response received. The AI may be processing or encountered an issue.",
  timeout: "Request timed out. Please try again.",
  serverError: "Something went wrong. Please try again.",
  invalidRequest: "Invalid request format.",
};

function parseN8NError(status: number, errorText: string): string {
  try {
    const errorData = JSON.parse(errorText);

    // Check for webhook not registered (test mode)
    if (errorData.hint?.includes('Execute workflow')) {
      return ERROR_MESSAGES.workflowInactive;
    }

    // Check for 404 - workflow not found
    if (status === 404) {
      return ERROR_MESSAGES.workflowNotFound;
    }

    // Check for cancelled execution
    if (errorData.message?.includes('cancelled')) {
      return "Request was cancelled. Please try again.";
    }

    // Return the actual message if it's user-friendly
    if (errorData.message && errorData.message.length < 100) {
      return errorData.message;
    }
  } catch {
    // Not JSON, use status-based message
  }

  if (status === 500) return ERROR_MESSAGES.serverError;
  if (status === 404) return ERROR_MESSAGES.workflowNotFound;
  if (status === 408) return ERROR_MESSAGES.timeout;

  return ERROR_MESSAGES.serverError;
}

export async function POST(req: Request) {
  try {
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) {
      return NextResponse.json({ response: ERROR_MESSAGES.notConfigured });
    }

    const contentType = req.headers.get('content-type') || '';
    const sessionId = 'session-' + Date.now();

    console.log(`→ N8N (${contentType.includes('multipart') ? 'audio' : 'text'})`);

    let n8nResponse;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      n8nResponse = await fetch(n8nUrl, {
        method: 'POST',
        body: formData,
      });
    } else {
      let body;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ response: ERROR_MESSAGES.invalidRequest }, { status: 400 });
      }

      const { message, previousHistory } = body;

      n8nResponse = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatInput: message,
          history: previousHistory || [],
          sessionId: sessionId
        }),
      });
    }

    // Handle N8N errors
    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error(`✗ N8N ${n8nResponse.status}:`, errorText.slice(0, 200));
      const userMessage = parseN8NError(n8nResponse.status, errorText);
      return NextResponse.json({ response: userMessage });
    }

    const responseContentType = n8nResponse.headers.get('content-type');

    // Handle Binary Response (Audio)
    if (responseContentType?.includes('audio/') || responseContentType?.includes('application/octet-stream')) {
      const audioBuffer = await n8nResponse.arrayBuffer();
      const n8nText = n8nResponse.headers.get('x-n8n-text');
      const headers: Record<string, string> = { 'Content-Type': responseContentType };
      if (n8nText) headers['X-N8N-Text'] = n8nText;
      return new NextResponse(audioBuffer, { headers });
    }

    // Handle Text/JSON Response
    const responseText = await n8nResponse.text();

    if (!responseText?.trim()) {
      console.warn('✗ Empty response from N8N');
      return NextResponse.json({ response: ERROR_MESSAGES.emptyResponse });
    }

    console.log('✓ N8N responded');

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Raw text response
      return NextResponse.json({ response: responseText });
    }

    const botResponse =
      data.output ||
      data.text ||
      data.response ||
      data.message ||
      data.content ||
      (typeof data === 'string' ? data : JSON.stringify(data));

    const audioUrl = data.audioUrl || data.audio;

    return NextResponse.json({
      response: botResponse,
      audioUrl: audioUrl || undefined
    });

  } catch (error) {
    console.error('✗ Chat API error:', error);
    return NextResponse.json({ response: ERROR_MESSAGES.serverError }, { status: 500 });
  }
}
