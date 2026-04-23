// ─────────────────────────────────────────────
// API CLIENT
// Backend: configurable via import.meta.env.VITE_API_URL or defaults to http://192.168.19.18:7127
// Auth: HttpOnly cookie (DigitalScrumBoardAuth)
// Credentials must always be included
// ─────────────────────────────────────────────

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.19.18:7127';
const BASE_URL = API_BASE_URL;

// ── Typed API error ───────────────────────────
export class ApiError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly retryAfterSeconds?: number;
    /** Raw response data — useful for 409 confirmation payloads with extra fields. */
    readonly data?: Record<string, unknown>;

    constructor(
        message: string,
        status: number,
        code?: string,
        retryAfterSeconds?: number,
        data?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
        this.data = data;
    }

    get isUnauthorized() { return this.status === 401; }
    get isPasswordChangeRequired() { return this.status === 403 && this.code === 'PASSWORD_CHANGE_REQUIRED'; }
    get isEmailVerificationRequired() { return this.status === 403 && this.code === 'EMAIL_VERIFICATION_REQUIRED'; }
    get isAccountDisabled() { return this.status === 403 && this.code === 'ACCOUNT_DISABLED'; }
    get isAccountLocked() { return this.status === 423 && this.code === 'ACCOUNT_LOCKED'; }
    get isAuthRateLimited() { return this.status === 429 && this.code === 'AUTH_RATE_LIMITED'; }
    get isRateLimited() { return this.status === 429; }
}

// ── Core fetch wrapper ────────────────────────
async function request<T>(
    method: string,
    path: string,
    body?: unknown,
): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
        response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            credentials: 'include', // required for HttpOnly cookie auth
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        throw new ApiError('Unable to connect to the server. Please check your connection.', 0);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return undefined as T;
    }

    // Parse body (may not always be JSON)
    let data: Record<string, unknown> = {};
    const contentType = response.headers.get('Content-Type') ?? '';
    // ASP.NET can return `application/problem+json` for validation errors.
    if (contentType.toLowerCase().includes('json')) {
        try {
            data = await response.json();
        } catch {
            // ignore parse error
        }
    }

    if (!response.ok) {
        // Extract retryAfterSeconds from header or body
        let retryAfterSeconds: number | undefined;
        const retryAfterHeader = response.headers.get('Retry-After');
        if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed)) retryAfterSeconds = parsed;
        }
        if (typeof data.retryAfterSeconds === 'number') {
            retryAfterSeconds = data.retryAfterSeconds;
        } else if (typeof data.retryAfterSeconds === 'string') {
            const parsed = parseInt(data.retryAfterSeconds, 10);
            if (!isNaN(parsed)) retryAfterSeconds = parsed;
        }

        const message =
            (typeof data.message === 'string' && data.message) ||
            (typeof data.title === 'string' && data.title) ||
            (typeof data.detail === 'string' && data.detail) ||
            // ASP.NET validation problems often include { errors: { field: [..] } }
            (typeof data.errors === 'object' && data.errors !== null
                ? (() => {
                    const firstKey = Object.keys(data.errors as Record<string, unknown>)[0];
                    const first = (firstKey
                        ? (data.errors as Record<string, unknown>)[firstKey]
                        : undefined) as unknown;
                    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
                    return undefined;
                })()
                : undefined) ||
            `Request failed (${response.status})`;

        const errorCode = typeof data.code === 'string' ? data.code : undefined;
        const errorName = typeof (data as Record<string, unknown>).error === 'string'
            ? (data as Record<string, unknown>).error as string
            : undefined;

        // Global hard session invalidation hook
        if (
            (response.status === 401 || response.status === 403) &&
            (errorCode === 'SESSION_INVALIDATED' || errorName === 'SESSION_INVALIDATED')
        ) {
            try {
                const { setSessionInvalidation } = await import('../state/sessionInvalidationState');
                const reason =
                    typeof (data as Record<string, unknown>).reason === 'string'
                        ? ((data as Record<string, unknown>).reason as string)
                        : 'SESSION_INVALIDATED';
                setSessionInvalidation(reason, message);
            } catch {
                // Ignore failures here; the request will still surface as an ApiError below.
            }
        }

        throw new ApiError(
            message,
            response.status,
            errorCode,
            retryAfterSeconds,
            data,
        );
    }

    return data as T;
}

// ── Public client ─────────────────────────────
const apiClient = {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
};

export default apiClient;