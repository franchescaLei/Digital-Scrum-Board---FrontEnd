export type SessionInvalidationReason =
    | 'ROLE_CHANGED'
    | 'TEAM_CHANGED'
    | 'ACCOUNT_DISABLED'
    | 'ACCOUNT_LOCKED'
    | 'SESSION_INVALIDATED'
    | 'UNKNOWN';

export interface SessionInvalidationState {
    active: boolean;
    reason: SessionInvalidationReason;
    message: string;
}

let currentState: SessionInvalidationState = {
    active: false,
    reason: 'UNKNOWN',
    message: '',
};

type Listener = (state: SessionInvalidationState) => void;

const listeners = new Set<Listener>();

export function getSessionInvalidation(): SessionInvalidationState {
    return currentState;
}

export function setSessionInvalidation(
    reason: string,
    message: string,
): void {
    const normalizedReason: SessionInvalidationReason =
        reason === 'ROLE_CHANGED' ||
            reason === 'TEAM_CHANGED' ||
            reason === 'ACCOUNT_DISABLED' ||
            reason === 'ACCOUNT_LOCKED' ||
            reason === 'SESSION_INVALIDATED'
            ? reason
            : 'UNKNOWN';

    currentState = {
        active: true,
        reason: normalizedReason,
        message,
    };

    for (const listener of listeners) {
        listener(currentState);
    }
}

export function clearSessionInvalidation(): void {
    currentState = {
        active: false,
        reason: 'UNKNOWN',
        message: '',
    };

    for (const listener of listeners) {
        listener(currentState);
    }
}

export function subscribeSessionInvalidation(listener: Listener): () => void {
    listeners.add(listener);
    // Immediately sync with current state
    listener(currentState);
    return () => {
        listeners.delete(listener);
    };
}

