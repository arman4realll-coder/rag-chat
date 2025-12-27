import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const n8nUrl = process.env.N8N_UPLOAD_WEBHOOK_URL;

        if (!n8nUrl) {
            return NextResponse.json({ error: 'N8N_UPLOAD_WEBHOOK_URL is not configured' }, { status: 500 });
        }

        // Forward the FormData to n8n
        // We create a new FormData to ensure it's compatible with the fetch call
        const n8nFormData = new FormData();
        n8nFormData.append('file', file);

        const n8nResponse = await fetch(n8nUrl, {
            method: 'POST',
            body: n8nFormData,
        });

        if (!n8nResponse.ok) {
            const text = await n8nResponse.text();
            throw new Error(`N8N upload error: ${n8nResponse.statusText} - ${text}`);
        }

        const result = await n8nResponse.text(); // n8n might return text or JSON
        let jsonResult;
        try {
            jsonResult = JSON.parse(result);
        } catch {
            jsonResult = { message: result };
        }

        return NextResponse.json(jsonResult);

    } catch (error) {
        console.error('Error in upload API:', error);
        return NextResponse.json({ error: 'Failed to process upload' }, { status: 500 });
    }
}
