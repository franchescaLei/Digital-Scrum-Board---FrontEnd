/* eslint-disable react-refresh/only-export-components */
import * as signalR from "@microsoft/signalr";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { getNotificationHubConnection } from "../services/notificationHub";
import { setSessionInvalidation } from "../state/sessionInvalidationState";
import type { UserProfile } from "../types/auth";
import { normalizeUserProfile } from "../utils/userProfile";

interface AuthContextValue {
    user: UserProfile | null;
    setUser: (user: UserProfile | null) => void;
    clearUser: () => void;
    /** Register a callback that will be called when permissions change. */
    registerPermissionsChangedCallback: (cb: () => void) => void;
}

const AuthContext = createContext<AuthContextValue>({
    user: null,
    setUser: () => { },
    clearUser: () => { },
    registerPermissionsChangedCallback: () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUserState] = useState<UserProfile | null>(null);
    const [permissionsCb, setPermissionsCb] = useState<(() => void) | null>(null);

    const setUser = useCallback((u: UserProfile | null) => {
        setUserState(u);
    }, []);

    const clearUser = useCallback(() => {
        setUserState(null);
    }, []);

    const registerPermissionsChangedCallback = useCallback((cb: () => void) => {
        setPermissionsCb(() => cb);
    }, []);

    useEffect(() => {
        if (!user) return;
        const userId = user.userID;
        const conn = getNotificationHubConnection();

        const onProfileChanged = (payload: unknown) => {
            if (payload === null || typeof payload !== "object") return;
            const raw = payload as Record<string, unknown>;
            const id = Number(raw.userID ?? raw.UserID);
            if (!Number.isFinite(id) || id !== userId) return;
            setUserState(normalizeUserProfile(raw));
        };

        const onPermissionsChanged = () => {
            // Trigger the registered callback (e.g., show re-auth modal)
            permissionsCb?.();
        };

        const onSessionInvalidated = (payload: unknown) => {
            const raw = (payload ?? {}) as Record<string, unknown>;
            const reason = typeof raw.reason === "string" ? raw.reason : "SESSION_INVALIDATED";
            const message = typeof raw.message === "string"
                ? raw.message
                : "Your session has been invalidated. You will be logged out.";

            // Mark global invalidation state so all route guards and UI can react consistently.
            setSessionInvalidation(reason, message);

            // Best-effort: stop the hub connection once invalidated.
            void conn.stop().catch(() => { /* ignore */ });
        };

        conn.on("UserProfileChanged", onProfileChanged);
        conn.on("UserPermissionsChanged", onPermissionsChanged);
        conn.on("UserSessionInvalidated", onSessionInvalidated);
        void (async () => {
            try {
                if (conn.state === signalR.HubConnectionState.Disconnected) {
                    await conn.start();
                }
            } catch {
                /* Hub is optional when the API is unavailable. */
            }
        })();

        return () => {
            conn.off("UserProfileChanged", onProfileChanged);
            conn.off("UserPermissionsChanged", onPermissionsChanged);
            conn.off("UserSessionInvalidated", onSessionInvalidated);
        };
    }, [user, permissionsCb]);

    return (
        <AuthContext.Provider value={{ user, setUser, clearUser, registerPermissionsChangedCallback }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    return useContext(AuthContext);
}