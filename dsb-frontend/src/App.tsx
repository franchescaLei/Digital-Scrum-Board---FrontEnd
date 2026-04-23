import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import AppLayout from "./app/AppLayout";
import ProtectedRoute from "./app/ProtectedRoute";
// Auth pages
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import EmailVerifiedPage from "./pages/EmailVerifiedPage";
import EmailConfirmedPage from "./pages/EmailConfirmedPage";
// App pages
// import BacklogsPage from "./pages/BacklogsPage"; // Deprecated - replaced by BacklogsV2
import BacklogsV2 from "./pages/BacklogsV2";
import BoardsPage from "./pages/BoardsPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import DsbInfoPage from "./pages/DsbInfoPage";
import NotFoundPage from "./pages/NotFoundPage";
import AccountDisabledModal from "./components/common/AccountDisabledModal";
import SessionInvalidatedModal from "./components/common/SessionInvalidatedModal";
import { useState, useCallback, useEffect } from "react";
import React from "react";
import { getSessionInvalidation, subscribeSessionInvalidation, type SessionInvalidationState } from "./state/sessionInvalidationState";

// Context for the disabled modal (internal use only)
type ShowAccountDisabledModal = () => void;
export const AccountDisabledModalContext = React.createContext<ShowAccountDisabledModal>(() => {});

export default function App() {
    const [showDisabledModal, setShowDisabledModal] = useState(false);
    const [sessionState, setSessionState] = useState<SessionInvalidationState>(() => getSessionInvalidation());

    const handleShowDisabledModal = useCallback(() => {
        setShowDisabledModal(true);
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeSessionInvalidation((state) => {
            setSessionState(state);
        });
        return unsubscribe;
    }, []);

    return (
        <ThemeProvider>
            <AuthProvider>
                <AccountDisabledModalContext.Provider value={handleShowDisabledModal}>
                    <BrowserRouter>
                        <Routes>
                            {/* ── Public auth routes ─────────────────── */}
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                            <Route path="/change-password" element={<ChangePasswordPage />} />
                            <Route path="/verify-email" element={<VerifyEmailPage />} />
                            <Route path="/about" element={<DsbInfoPage />} />
                            {/* Email confirmed page - shows when user clicks email link, requires button click to verify */}
                            <Route path="/email-confirmed" element={<EmailConfirmedPage />} />
                            {/* Email successfully verified confirmation page.
                                Shown after /verify-email completes successfully
                                and serves as the final onboarding transition point. */}
                            <Route path="/email-verified" element={<EmailVerifiedPage />} />
                            {/* ── Protected app routes ───────────────── */}
                            <Route
                                element={
                                    <ProtectedRoute>
                                        <AppLayout />
                                    </ProtectedRoute>
                                }
                            >
                                <Route index element={<Navigate to="/backlogsv2" replace />} />
                                <Route path="backlogs" element={<BacklogsV2 />} />
                                <Route path="backlogsv2" element={<BacklogsV2 />} />
                                <Route path="boards" element={<BoardsPage />} />
                                <Route path="profile" element={<ProfilePage />} />
                                {/* Admin sub-routes */}
                                <Route path="admin" element={<AdminPage />} />
                                <Route path="admin/users" element={<AdminPage />} />
                                <Route path="admin/audit" element={<AdminPage />} />
                            </Route>
                            {/* ── Fallback ───────────────────────────── */}
                            <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                        {/* Global blocking modals */}
                        <AccountDisabledModal open={showDisabledModal} />
                        <SessionInvalidatedModal state={sessionState} />
                    </BrowserRouter>
                </AccountDisabledModalContext.Provider>
            </AuthProvider>
        </ThemeProvider>
    );
}