import * as signalR from "@microsoft/signalr";

const API_BASE = import.meta.env.VITE_API_URL || 'http://192.168.19.18:7127';
const NOTIFICATION_HUB_URL = `${API_BASE}/hubs/notifications`;

let notificationConnection: signalR.HubConnection | null = null;
let startPromise: Promise<void> | null = null;

export function getNotificationHubConnection(): signalR.HubConnection {
  if (notificationConnection) {
    return notificationConnection;
  }

  notificationConnection = new signalR.HubConnectionBuilder()
    .withUrl(NOTIFICATION_HUB_URL, {
      withCredentials: true
    })
    .withAutomaticReconnect()
    .build();

  return notificationConnection;
}

export async function startNotificationHub(): Promise<void> {
  if (startPromise) return startPromise;

  const conn = getNotificationHubConnection();
  // Make this safe under concurrent callers (multiple pages/components).
  // SignalR throws if you call start() while Connecting/Reconnecting.
  if (
    conn.state === signalR.HubConnectionState.Connected ||
    conn.state === signalR.HubConnectionState.Connecting ||
    conn.state === signalR.HubConnectionState.Reconnecting
  ) {
    return Promise.resolve();
  }

  startPromise = conn.start()
    .catch((err) => {
      console.error('NotificationHub start failed:', err);
      startPromise = null;
      throw err;
    });

  return startPromise;
}
