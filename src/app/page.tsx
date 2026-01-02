'use client';

import { useState, useEffect, useRef } from 'react';
import { useTypewriter } from '../hooks/useTypewriter';
import { useAudioVisualizer } from '../hooks/useAudioVisualizer';

type Message = {
  role: 'user' | 'bot';
  content: string;
  audioUrl?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: 'Hello! I\'m Credit Buddy, your AI-powered support assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Persistent session ID for Redis chat memory
  const sessionIdRef = useRef<string>('');

  // Initialize sessionId once on mount
  useEffect(() => {
    let storedId = localStorage.getItem('credit_buddy_session');
    if (!storedId) {
      storedId = 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('credit_buddy_session', storedId);
    }
    sessionIdRef.current = storedId;
  }, []);

  const loudness = useAudioVisualizer(audioRef);

  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const lastBotMessage = [...messages].reverse().find(m => m.role === 'bot');

  const displayContent = useTypewriter(lastBotMessage?.content || '', 35);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Play audio using the stable DOM element
  const playAudioImmediately = (audioUrl: string) => {
    if (!audioRef.current) return;

    const audio = audioRef.current;

    // safe pause
    audio.pause();

    audio.src = audioUrl;
    audio.load(); // Ensure new source is loaded

    // Start playing
    audio.play().catch(err => {
      console.warn('Autoplay blocked:', err);
    });
  };

  const processResponse = async (response: Response) => {
    const contentType = response.headers.get('content-type');

    if (contentType && (contentType.includes('audio/') || contentType.includes('application/octet-stream'))) {
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      // PLAY IMMEDIATELY - don't wait for React state update
      playAudioImmediately(audioUrl);

      const headerText = response.headers.get('x-n8n-text') || response.headers.get('x-text-content');
      let textContent = ' Playing audio response...';

      if (headerText) {
        console.log('Received Header Text Length:', headerText.length);
        try {
          textContent = decodeURIComponent(headerText).replace(/\\n/g, '\n');
        } catch (e) {
          console.error('Decoding failed (likely truncated header):', e);
          // Try to salvage partial text or fallback
          textContent = headerText;
        }
      }

      setMessages((prev) => [...prev, { role: 'bot', content: textContent, audioUrl }]);
    } else {
      const data = await response.json();
      const botMessage: Message = { role: 'bot', content: data.response };

      // If JSON response includes audio URL, play it immediately
      if (data.audioUrl) {
        playAudioImmediately(data.audioUrl);
        botMessage.audioUrl = data.audioUrl;
      }

      setMessages((prev) => [...prev, botMessage]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessages((prev) => [...prev, { role: 'user', content: `Uploading ${file.name}...` }]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      await response.json();
      setMessages((prev) => [...prev, { role: 'bot', content: `✓ ${file.name} uploaded! You can now ask questions about it.` }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'bot', content: `Upload failed. Please try again.` }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      // BARGE-IN: Stop any currently playing audio immediately
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        // Do NOT set audioRef.current to null here, as the visualizer hook needs the ref to be stable.
        // Just clearing the source stops the playback and the visualizer should naturally settle.
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setMessages((prev) => [...prev, { role: 'bot', content: 'Microphone access denied. Please check permissions.' }]);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const sendAudio = async (audioBlob: Blob) => {
    setIsLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: 'Voice message' }]);

    const formData = new FormData();
    formData.append('audioData', audioBlob, 'recording.webm');
    formData.append('sessionId', sessionIdRef.current); // Include session for memory

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to send audio');
      await processResponse(response);
    } catch {
      setMessages((prev) => [...prev, { role: 'bot', content: 'Could not process audio. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          previousHistory: messages,
          sessionId: sessionIdRef.current // Include session for memory
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch response');
      await processResponse(response);
    } catch {
      setMessages((prev) => [...prev, { role: 'bot', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const getOrbState = () => {
    if (isRecording) return 'listening';
    if (isLoading || isUploading) return 'processing';
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'bot' && lastMsg.audioUrl && loudness > 0.01) return 'speaking';
    return 'idle';
  };

  const orbState = getOrbState();
  const isSpeaking = orbState === 'speaking';
  const orbScale = 1 + (loudness * 0.5);

  return (
    <div className={`app-container ${isSpeaking ? 'speaking-mode' : ''}`}>
      {/* Header */}
      <header className="app-header">
        <div className="brand-container">
          <div className="brand-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </div>
          <h1 className="brand-title">Credit Buddy</h1>
          <span className="brand-badge">{isSpeaking ? 'SPEAKING' : 'AI'}</span>
        </div>
        <div className="status-indicator">
          <span className="status-dot"></span>
          <span>{isSpeaking ? 'Speaking' : 'Online'}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="chat-main">
        <div className="chat-content">
          {/* The Animated Orb */}
          <div
            className="orb-container"
            onClick={toggleRecording}
            role="button"
            tabIndex={0}
            title={isRecording ? "Stop recording" : "Tap to speak"}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                toggleRecording();
              }
            }}
          >
            {/* Speaking Rings */}
            <div className="speaking-ring"></div>
            <div className="speaking-ring"></div>
            <div className="speaking-ring"></div>

            {/* Audio Visualizer Bars */}
            <div className="audio-visualizer">
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
              <div className="audio-bar"></div>
            </div>

            <div
              className={`orb ${orbState}`}
              style={{
                transform: `scale(${isSpeaking ? orbScale : (orbState === 'idle' ? 0.85 : 1)})`
              }}
            />
            <div className={`orb-ring ${orbState !== 'idle' ? 'active' : ''}`} />

            {(orbState === 'listening' || isSpeaking) && (
              <>
                <div className="ripple" />
                <div className="ripple" />
                <div className="ripple" />
              </>
            )}
          </div>

          {/* Conversation Display */}
          <div className="conversation-display">
            {orbState === 'listening' ? (
              <div className="last-user-msg">Listening...</div>
            ) : (
              <>
                {lastUserMessage && !isSpeaking && (
                  <div className="last-user-msg">{lastUserMessage.content}</div>
                )}
                {lastBotMessage && !isLoading && !isUploading && (
                  <div className="current-bot-msg">
                    {messages[messages.length - 1] === lastBotMessage ? displayContent : lastBotMessage.content}
                  </div>
                )}
                {(isLoading || isUploading) && (
                  <div className="thinking-indicator">
                    <div className="thinking-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span>Thinking...</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div ref={messagesEndRef} />

          {/* Persistent Audio Element for robust playback logic */}
          <audio
            ref={audioRef}
            className="hidden"
            crossOrigin="anonymous"
          />
        </div>
      </main>

      {/* Input Area */}
      <footer className="input-area">
        <form onSubmit={handleSubmit} className="input-container">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.csv,.txt,.doc,.docx"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="action-btn"
            aria-label="Upload file"
            disabled={isUploading || isLoading || isRecording}
            title="Upload document"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="20" height="20">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 5.818l-1.597 1.597m-2.651 4.159l-1.597-1.597" />
            </svg>
          </button>

          <input
            type="text"
            className="chat-input"
            placeholder={isRecording ? "Listening..." : "Ask me anything..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || isRecording}
          />


          {!isRecording && input.trim() && (
            <button
              type="submit"
              disabled={isLoading}
              className="action-btn primary"
              aria-label="Send message"
              title="Send"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="18" height="18">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          )}
        </form>

        <div className="input-hint">
          <span className="hint-item">
            <kbd>⏎</kbd> to send
          </span>
          <span className="hint-item">
            or use voice
          </span>
        </div>
      </footer>
    </div>
  );
}
