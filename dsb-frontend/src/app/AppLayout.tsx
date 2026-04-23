import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Header from "../components/Header";
import NavMenu from "../components/NavMenu";
import { primeNotificationAudioContext } from "../utils/notificationSound";
import { useAuth } from "../context/AuthContext";
import ReauthModal from "../components/common/ReauthModal";

export default function AppLayout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [showReauthModal, setShowReauthModal] = useState(false);
    const { registerPermissionsChangedCallback } = useAuth();

    useEffect(() => {
        const unlock = () => {
            primeNotificationAudioContext();
            document.removeEventListener("pointerdown", unlock);
        };
        document.addEventListener("pointerdown", unlock, { passive: true });
        return () => document.removeEventListener("pointerdown", unlock);
    }, []);

    // Register the callback that triggers when permissions change
    useEffect(() => {
        registerPermissionsChangedCallback(() => {
            setShowReauthModal(true);
        });
    }, [registerPermissionsChangedCallback]);

    return (
        <div className="app-shell">
            <Header />
            <div className="app-body">
                <NavMenu
                    isCollapsed={sidebarCollapsed}
                    onToggle={() => setSidebarCollapsed(prev => !prev)}
                />
                <main className="app-content">
                    <Outlet />
                </main>
            </div>
            <ReauthModal open={showReauthModal} />
        </div>
    );
}