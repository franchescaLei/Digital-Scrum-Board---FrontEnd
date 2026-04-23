import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as signalR from "@microsoft/signalr";
import {
    getMyNotifications,
    getUnreadNotificationCount,
    markAllNotificationsRead,
    markNotificationRead,
    NOTIFICATIONS_CHANGED_EVENT,
} from "../api/notificationsApi";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../services/apiClient";
import { getNotificationHubConnection } from "../services/notificationHub";
import type { NotificationListItem } from "../types/notification";
import { parseNotificationBroadcast, playNotificationChime } from "../utils/notificationSound";

const SunIcon = () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <line x1="8" y1="1" x2="8" y2="2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="13.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="1" y1="8" x2="2.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="13.5" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="3.05" y1="3.05" x2="4.11" y2="4.11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="11.89" y1="11.89" x2="12.95" y2="12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12.95" y1="3.05" x2="11.89" y2="4.11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="4.11" y1="11.89" x2="3.05" y2="12.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const MoonIcon = () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
            d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6.002 6.002 0 1 0 7 7Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const BellIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
            d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5v2.25L2 10.5h12l-1.5-2.25V6A4.5 4.5 0 0 0 8 1.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
        />
        <path
            d="M6.5 10.5a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
        />
    </svg>
);

import { formatRelativeTime } from '../utils/dateFormatter';

export default function Header() {
    const [unreadCount, setUnreadCount] = useState(0);
    const [panelOpen, setPanelOpen] = useState(false);
    const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
    const [notifItems, setNotifItems] = useState<NotificationListItem[]>([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifError, setNotifError] = useState<string | null>(null);
    const [markingAll, setMarkingAll] = useState(false);
    const [toasts, setToasts] = useState<Array<{ id: string; title: string; message: string }>>([]);

    const bellRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelOpenRef = useRef(false);
    panelOpenRef.current = panelOpen;

    const { theme, toggleTheme } = useTheme();
    const isDark = theme === "dark";

    const refreshUnreadCount = useCallback(async () => {
        try {
            const result = await getUnreadNotificationCount();
            setUnreadCount(result.unreadCount);
        } catch {
            setUnreadCount(0);
        }
    }, []);

    const loadNotificationsList = useCallback(async () => {
        setNotifLoading(true);
        setNotifError(null);
        try {
            const res = await getMyNotifications({ page: 1, pageSize: 30 });
            setNotifItems(Array.isArray(res.items) ? res.items : []);
            setUnreadCount(typeof res.unreadCount === "number" ? res.unreadCount : 0);
        } catch (e) {
            setNotifError(e instanceof ApiError ? e.message : "Could not load notifications.");
            setNotifItems([]);
        } finally {
            setNotifLoading(false);
        }
    }, []);

    const repositionPanel = useCallback(() => {
        const el = bellRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setPanelPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }, []);

    const toggleNotificationsPanel = useCallback(() => {
        setPanelOpen((prev) => {
            const next = !prev;
            if (next) {
                requestAnimationFrame(() => {
                    const el = bellRef.current;
                    if (el) {
                        const r = el.getBoundingClientRect();
                        setPanelPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
                    }
                });
            }
            return next;
        });
    }, []);

    const toastIdRef = useRef(0);
    const toastTimeoutsRef = useRef<Map<string, number>>(new Map());

    const dismissToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const tid = toastTimeoutsRef.current.get(id);
        if (tid !== undefined) {
            window.clearTimeout(tid);
            toastTimeoutsRef.current.delete(id);
        }
    }, []);

    const pushToast = useCallback(
        (title: string, message: string) => {
            const id = `n-${++toastIdRef.current}`;
            setToasts((prev) => [...prev.slice(-4), { id, title, message }]);
            const tid = window.setTimeout(() => {
                dismissToast(id);
            }, 5200);
            toastTimeoutsRef.current.set(id, tid);
        },
        [dismissToast],
    );

    useEffect(() => {
        return () => {
            toastTimeoutsRef.current.forEach((t) => window.clearTimeout(t));
            toastTimeoutsRef.current.clear();
        };
    }, []);

    useEffect(() => {
        void refreshUnreadCount();
        const onChanged = () => {
            void refreshUnreadCount();
        };
        window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
        return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    }, [refreshUnreadCount]);

    useEffect(() => {
        if (!panelOpen) return;
        void loadNotificationsList();
    }, [panelOpen, loadNotificationsList]);

    useEffect(() => {
        if (!panelOpen) return;
        const onResize = () => repositionPanel();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [panelOpen, repositionPanel]);

    useEffect(() => {
        if (!panelOpen) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (bellRef.current?.contains(t)) return;
            if (panelRef.current?.contains(t)) return;
            setPanelOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [panelOpen]);

    useEffect(() => {
        if (!panelOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPanelOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [panelOpen]);

    useEffect(() => {
        const conn = getNotificationHubConnection();
        if (import.meta.env.DEV) {
            // Helpful diagnostics while we track notification toasts.
            // eslint-disable-next-line no-console
            console.debug("[Header] Subscribing to NotificationReceived / NotificationRead. Hub state:", conn.state);
        }

        const onReceived = (dto: unknown) => {
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.debug("[Header] NotificationReceived payload:", dto);
            }
            const { title, message } = parseNotificationBroadcast(dto);
            pushToast(title, message);
            playNotificationChime();
            void refreshUnreadCount();
            if (panelOpenRef.current) void loadNotificationsList();
        };

        const onReadBroadcast = (dto: Record<string, unknown>) => {
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.debug("[Header] NotificationRead broadcast:", dto);
            }
            const c = dto?.unreadCount ?? dto?.UnreadCount;
            if (typeof c === "number") setUnreadCount(c);
            else void refreshUnreadCount();
        };

        conn.on("NotificationReceived", onReceived);
        conn.on("NotificationRead", onReadBroadcast);

        void (async () => {
            try {
                if (conn.state === signalR.HubConnectionState.Disconnected) {
                    await conn.start();
                }
            } catch {
                /* hub optional when unavailable */
            }
        })();

        return () => {
            conn.off("NotificationReceived", onReceived);
            conn.off("NotificationRead", onReadBroadcast);
        };
    }, [refreshUnreadCount, loadNotificationsList, pushToast]);

    const handleMarkOneRead = async (item: NotificationListItem) => {
        if (item.isRead) return;
        try {
            await markNotificationRead(item.notificationID);
            setNotifItems((prev) =>
                prev.map((n) => (n.notificationID === item.notificationID ? { ...n, isRead: true } : n)),
            );
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch (e) {
            setNotifError(e instanceof ApiError ? e.message : "Could not mark as read.");
        }
    };

    const handleMarkAllRead = async () => {
        setMarkingAll(true);
        setNotifError(null);
        try {
            await markAllNotificationsRead();
            setNotifItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (e) {
            setNotifError(e instanceof ApiError ? e.message : "Could not mark all as read.");
        } finally {
            setMarkingAll(false);
        }
    };

    const notifPanel =
        panelOpen &&
        createPortal(
            <div
                ref={panelRef}
                className="app-notif-panel"
                role="dialog"
                aria-modal="false"
                aria-labelledby="app-notif-panel-title"
                style={{ top: panelPos.top, right: panelPos.right }}
            >
                <div className="app-notif-panel-header">
                    <h2 id="app-notif-panel-title" className="app-notif-panel-title">
                        Notifications
                    </h2>
                    {unreadCount > 0 ? (
                        <button
                            type="button"
                            className="app-notif-panel-action"
                            onClick={() => void handleMarkAllRead()}
                            disabled={markingAll || notifLoading}
                        >
                            {markingAll ? "Marking…" : "Mark all read"}
                        </button>
                    ) : null}
                </div>
                <div className="app-notif-panel-body">
                    {notifLoading && notifItems.length === 0 ? (
                        <div className="app-notif-panel-empty">Loading…</div>
                    ) : null}
                    {notifError ? (
                        <div className="app-notif-panel-error" role="alert">
                            {notifError}
                        </div>
                    ) : null}
                    {!notifLoading && notifItems.length === 0 && !notifError ? (
                        <div className="app-notif-panel-empty">You&apos;re all caught up.</div>
                    ) : null}
                    <ul className="app-notif-list">
                        {notifItems.map((item) => (
                            <li key={item.notificationID}>
                                <button
                                    type="button"
                                    className={`app-notif-item${item.isRead ? "" : " app-notif-item--unread"}`}
                                    onClick={() => {
                                        if (!item.isRead) void handleMarkOneRead(item);
                                    }}
                                    aria-label={`${item.notificationType}. ${item.message}`}
                                >
                                    <span className="app-notif-item-type">{item.notificationType}</span>
                                    <span className="app-notif-item-msg">{item.message}</span>
                                    <span className="app-notif-item-time">{formatRelativeTime(item.createdAt)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>,
            document.body,
        );

    const toastPortal =
        toasts.length > 0
            ? createPortal(
                  <div
                      className="app-notif-toast-stack"
                      role="region"
                      aria-label="Incoming notifications"
                      aria-live="polite"
                  >
                      {toasts.map((t) => (
                          <div key={t.id} className="app-notif-toast" role="status">
                              <button
                                  type="button"
                                  className="app-notif-toast-dismiss"
                                  onClick={() => dismissToast(t.id)}
                                  aria-label="Dismiss notification"
                              >
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                      <path
                                          d="M1 1l10 10M11 1L1 11"
                                          stroke="currentColor"
                                          strokeWidth="1.4"
                                          strokeLinecap="round"
                                      />
                                  </svg>
                              </button>
                              <div className="app-notif-toast-title">{t.title}</div>
                              <p className="app-notif-toast-msg">{t.message}</p>
                          </div>
                      ))}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <header className="app-header">
            <div className="app-header-left">
                <div className="app-header-brand">
                    <img
                        src="/SitesphilLogo.png"
                        alt=""
                        className="app-header-brand-logo-img"
                        width="36"
                        height="36"
                    />
                    <div className="app-header-brand-text">
                        <span className="app-header-brand-name">Digital Scrum Board</span>
                        <span className="app-header-brand-sub">Agile Sprint Management</span>
                    </div>
                </div>
            </div>

            <div className="app-header-right">
                <button
                    ref={bellRef}
                    type="button"
                    className="app-header-icon-btn"
                    aria-label={
                        unreadCount > 0
                            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                            : "Notifications"
                    }
                    aria-expanded={panelOpen}
                    aria-haspopup="dialog"
                    title="Notifications"
                    onClick={toggleNotificationsPanel}
                >
                    <BellIcon />
                    {unreadCount > 0 ? (
                        <span className="app-header-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                    ) : null}
                </button>

                {notifPanel}
                {toastPortal}

                <button
                    type="button"
                    className="app-header-icon-btn"
                    onClick={toggleTheme}
                    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
                    title={isDark ? "Light mode" : "Dark mode"}
                >
                    {isDark ? <SunIcon /> : <MoonIcon />}
                </button>
            </div>
        </header>
    );
}
