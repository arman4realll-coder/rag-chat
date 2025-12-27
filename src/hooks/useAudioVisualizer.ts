import { useEffect, useRef, useState } from 'react';

export const useAudioVisualizer = (audioRef: React.RefObject<HTMLAudioElement | null>) => {
    const [loudness, setLoudness] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (!audioRef.current) return;

        const audio = audioRef.current;

        const initAudio = () => {
            // Create context only once user interacts (or audio starts) to avoid Autoplay policy issues
            if (!audioContextRef.current) {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                audioContextRef.current = new AudioContextClass();
            }

            const ctx = audioContextRef.current;
            if (!ctx) return; // Should not happen

            if (!sourceRef.current) {
                try {
                    sourceRef.current = ctx.createMediaElementSource(audio);
                    analyserRef.current = ctx.createAnalyser();
                    analyserRef.current.fftSize = 256;
                    sourceRef.current.connect(analyserRef.current);
                    analyserRef.current.connect(ctx.destination);
                } catch (err) {
                    console.warn("Visualizer setup failed (likely CORS or state):", err);
                    return;
                }
            }
        };

        const update = () => {
            if (!analyserRef.current) return;
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);

            // distinct visualizer logic: average volume
            const sum = dataArray.reduce((acc, val) => acc + val, 0);
            const avg = sum / dataArray.length;
            // Normalize to 0-1, but amplify lower volumes for visibility
            const normalize = Math.min(1, avg / 128);
            setLoudness(normalize);

            rafIdRef.current = requestAnimationFrame(update);
        };

        const handlePlay = () => {
            if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
            }
            initAudio();
            update();
        };

        const handlePause = () => {
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
            setLoudness(0);
        };

        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handlePause);

        return () => {
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
            audio.removeEventListener('ended', handlePause);
            if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        };
    }, [audioRef]);

    return loudness;
};
