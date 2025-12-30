import { useState, useEffect } from 'react';

export const useTypewriter = (text: string, speed: number = 30) => {
    const [displayedText, setDisplayedText] = useState('');

    useEffect(() => {
        setDisplayedText('');
        const characters = Array.from(text); // Split correctly handling emojis/unicode
        let i = 0;

        const timer = setInterval(() => {
            if (i < characters.length) {
                setDisplayedText(characters.slice(0, i + 1).join(''));
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);

        return () => clearInterval(timer);
    }, [text, speed]);

    return displayedText;
};
