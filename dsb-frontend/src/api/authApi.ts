import apiClient from '../services/apiClient';
import { normalizeUserProfile } from '../utils/userProfile';
import type {
    LoginRequest,
    LoginResponse,
    UserProfile,
    UpdateProfileRequest,
    ForgotPasswordRequest,
    VerifyResetCodeRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
} from '../types/auth';

interface MessageResponse {
    message: string;
}

// ── Session ───────────────────────────────────

/** POST /api/auth/logout — clears auth cookie */
export const logout = (): Promise<void> =>
    apiClient.post<void>('/api/auth/logout');

/** GET /api/auth/me — fetch current user from cookie session */
export const getCurrentUser = async (): Promise<UserProfile> => {
    const raw = await apiClient.get<Record<string, unknown>>('/api/auth/me');
    return normalizeUserProfile(raw);
};

/** POST /api/auth/login — returns login result with flags */
export const login = async (data: LoginRequest): Promise<LoginResponse> => {
    const raw = await apiClient.post<Record<string, unknown>>('/api/auth/login', data);
    const userRaw = raw.user ?? raw.User;
    const user = normalizeUserProfile((userRaw as Record<string, unknown>) ?? {});
    return {
        message: String(raw.message ?? raw.Message ?? ''),
        mustChangePassword: Boolean(raw.mustChangePassword ?? raw.MustChangePassword),
        emailVerified: Boolean(raw.emailVerified ?? raw.EmailVerified),
        user,
    };
};

// ── Password change (forced flow) ─────────────

/** POST /api/auth/change-password */
export const changePassword = (data: ChangePasswordRequest): Promise<MessageResponse> =>
    apiClient.post<MessageResponse>('/api/auth/change-password', data);

/** PATCH /api/auth/profile — update the signed-in user's name fields */
export const updateProfile = async (data: UpdateProfileRequest): Promise<UserProfile> => {
    const raw = await apiClient.patch<Record<string, unknown>>('/api/auth/profile', data);
    return normalizeUserProfile(raw);
};

// ── Email verification ────────────────────────

/** POST /api/auth/resend-verification */
export const resendVerification = (): Promise<MessageResponse> =>
    apiClient.post<MessageResponse>('/api/auth/resend-verification');

/** GET /api/auth/verify-email?token=... */
export const verifyEmail = (token: string): Promise<MessageResponse> =>
    apiClient.get<MessageResponse>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);

/** POST /api/auth/confirm-email — verifies email when user clicks confirm button */
export const confirmEmail = (token: string): Promise<MessageResponse> =>
    apiClient.post<MessageResponse>('/api/auth/confirm-email', { token });

// ── Password reset flow ───────────────────────

/** POST /api/auth/forgot-password */
export const forgotPassword = (data: ForgotPasswordRequest): Promise<MessageResponse> =>
    apiClient.post<MessageResponse>('/api/auth/forgot-password', data);

/** POST /api/auth/verify-reset-code — token is exactly 6 digits */
export const verifyResetCode = (data: VerifyResetCodeRequest): Promise<MessageResponse> =>
    apiClient.post<MessageResponse>('/api/auth/verify-reset-code', data);

/** POST /api/auth/reset-password */
export const resetPassword = (data: ResetPasswordRequest): Promise<MessageResponse> =>
    apiClient.post<MessageResponse>('/api/auth/reset-password', data);