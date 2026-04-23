import { type ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser } from "../api/authApi";
import { getActiveBoards } from "../api/boardsApi";
import { ApiError } from "../services/apiClient";
import { useAuth } from "../context/AuthContext";
import type { UserProfile } from "../types/auth";
import AccountDisabledModal from "../components/common/AccountDisabledModal";
import { getSessionInvalidation } from "../state/sessionInvalidationState";

type AuthState =
    | { status: "loading" }
    | { status: "authenticated"; user: UserProfile }
    | { status: "unauthenticated" }
    | { status: "requires_password_change" }
    | { status: "requires_email_verification" }
    | { status: "account_disabled" };

interface Props {
    children: ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
    const location = useLocation();
    const { setUser } = useAuth();
    const [auth, setAuth] = useState<AuthState>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                const user = await getCurrentUser();
                if (cancelled) return;

                try {
                    await getActiveBoards();
                    if (!cancelled) {
                        setUser(user);
                        setAuth({ status: "authenticated", user });
                    }
                } catch (probeErr) {
                    if (cancelled) return;

                    if (probeErr instanceof ApiError) {
                        if (probeErr.isAccountDisabled) {
                            setAuth({ status: "account_disabled" });
                            return;
                        }
                        if (probeErr.isPasswordChangeRequired) {
                            setAuth({ status: "requires_password_change" });
                            return;
                        }
                        if (probeErr.isEmailVerificationRequired) {
                            setAuth({ status: "requires_email_verification" });
                            return;
                        }
                        if (probeErr.isUnauthorized) {
                            setAuth({ status: "unauthenticated" });
                            return;
                        }
                        setAuth({ status: "unauthenticated" });
                        return;
                    }
                    setAuth({ status: "unauthenticated" });
                }
            } catch (err) {
                if (cancelled) return;
                if (err instanceof ApiError) {
                    if (err.isAccountDisabled) {
                        setAuth({ status: "account_disabled" });
                        return;
                    }
                    if (err.isUnauthorized) {
                        setAuth({ status: "unauthenticated" });
                        return;
                    }
                }
                setAuth({ status: "unauthenticated" });
            }
        };

        run();
        return () => { cancelled = true; };
    }, [setUser]);

    // Hard session invalidation takes precedence over normal auth routing.
    const invalidation = getSessionInvalidation();
    if (invalidation.active) {
        // Rendering of the actual blocking modal happens at the App root.
        // Here we simply prevent any protected content from rendering.
        return null;
    }

    if (auth.status === "loading") return <FullPageSpinner />;
    if (auth.status === "account_disabled") return <AccountDisabledModal open />;
    if (auth.status === "requires_password_change") return <Navigate to="/change-password" replace />;
    if (auth.status === "requires_email_verification") return <Navigate to="/verify-email" replace />;
    if (auth.status === "unauthenticated") return <Navigate to="/login" replace state={{ from: location }} />;

    return <>{children}</>;
}

function FullPageSpinner() {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100dvh",
                background: "var(--form-bg)",
            }}
            aria-label="Loading"
            role="status"
        >
            <span
                style={{
                    width: 28,
                    height: 28,
                    border: "2.5px solid var(--divider)",
                    borderTopColor: "var(--accent-red)",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "authSpin 0.65s linear infinite",
                }}
            />
        </div>
    );
}