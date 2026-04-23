export function TooltipIcon({ text }: { text: string }) {
    return (
        <span className="bl-tooltip" title={text} aria-label={text}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.1" />
                <path d="M6.5 5.8v3M6.5 4.2h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
        </span>
    );
}

export function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return (
        <span className="bl-field-error" role="alert">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="6" y1="4" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
            {message}
        </span>
    );
}
