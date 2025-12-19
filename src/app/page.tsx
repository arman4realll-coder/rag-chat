'use client';

import { useState, useEffect, useRef } from 'react';

type Message = {
  role: 'user' | 'bot';
  content: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: 'Hello! I am your AI assistant connected to n8n. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          previousHistory: messages // sending history context
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch response');
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'bot', content: data.response }]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: 'bot', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 md:p-6">
      <header className="flex items-center justify-between pb-4 border-b border-[var(--glass-border)] mb-4">
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          rag.chat
        </h1>
        <div className="text-sm text-[var(--secondary)]">Powered by n8n</div>
      </header>

      <main className="flex-1 overflow-y-auto space-y-4 pr-2 pb-4 scroll-smooth">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[80%] p-4 rounded-2xl backdrop-blur-sm ${msg.role === 'user'
                  ? 'bg-[var(--chat-bubble-user)] text-[var(--foreground)] rounded-br-none'
                  : 'bg-[var(--chat-bubble-bot)] border border-[var(--glass-border)] text-[var(--foreground)] rounded-bl-none'
                }`}
              style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
            >
              {msg.content.split('\n').map((line, i) => (
                <p key={i} className="mb-1 last:mb-0 leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-[var(--chat-bubble-bot)] border border-[var(--glass-border)] p-4 rounded-2xl rounded-bl-none flex items-center space-x-1">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="pt-4 border-t border-[var(--glass-border)] mt-auto">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] text-[var(--foreground)] rounded-xl py-4 px-5 pr-14 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all placeholder:text-[var(--secondary)]"
            placeholder="Ask something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2 p-2 bg-[var(--primary)] rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </form>
      </footer>
    </div>
  );
}
