import * as signalR from "@microsoft/signalr";

const API_BASE = import.meta.env.VITE_API_URL || 'http://192.168.19.18:7127';
const BOARD_HUB_URL = `${API_BASE}/hubs/boards`;

let boardConnection: signalR.HubConnection | null = null;

export function getBoardHubConnection(): signalR.HubConnection {
  if (boardConnection) {
    return boardConnection;
  }

  boardConnection = new signalR.HubConnectionBuilder()
    .withUrl(BOARD_HUB_URL, {
      withCredentials: true
    })
    .withAutomaticReconnect()
    .build();

  return boardConnection;
}

/**
 * Ensures the board hub connection is started. Safe to call from multiple components;
 * subsequent calls are no-ops if the connection is already connecting or connected.
 */
export async function ensureBoardHubStarted(): Promise<void> {
  const conn = getBoardHubConnection();

  if (
    conn.state === signalR.HubConnectionState.Connected ||
    conn.state === signalR.HubConnectionState.Connecting ||
    conn.state === signalR.HubConnectionState.Reconnecting
  ) {
    return;
  }

  await conn.start();
}