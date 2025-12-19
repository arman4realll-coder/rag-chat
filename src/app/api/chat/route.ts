import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { message, previousHistory } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const n8nUrl = process.env.N8N_WEBHOOK_URL;

    if (!n8nUrl) {
      // For demo purposes, if no URL is set, we return a mock response
      // In production, this should error out or be configured
      return NextResponse.json({ 
        response: "N8N_WEBHOOK_URL is not configured. Please set it in your environment variables. Echoing: " + message 
      });
    }

    // Forward the message to n8n
    // Adjust the payload structure based on your n8n workflow input nodes
    const n8nResponse = await fetch(n8nUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        chatInput: message,
        history: previousHistory || [] // Optional: pass history if RAG needs context
      }),
    });

    if (!n8nResponse.ok) {
      throw new Error(`N8N n8nResponse error: ${n8nResponse.statusText}`);
    }

    const data = await n8nResponse.json();
    
    // Expecting n8n to return { output: "text" } or similar. Adjust as needed.
    // If n8n returns just the text string in a property 'output' or 'text'
    const botResponse = data.output || data.text || data.response || JSON.stringify(data);

    return NextResponse.json({ response: botResponse });

  } catch (error) {
    console.error('Error in chat API:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
