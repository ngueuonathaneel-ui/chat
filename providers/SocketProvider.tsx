/**
 * SocketProvider - Contexte global pour Socket.IO
 *
 * Architecture:
 * - Singleton pattern pour éviter multi-connexions
 * - Reconnexion automatique avec backoff
 * - Gestion des événements globaux (presence, notifications)
 */

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/types/socket";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketContextType {
  socket: TypedSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  emit: <K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ) => void;
  on: <K extends keyof ServerToClientEvents>(
    event: K,
    handler: ServerToClientEvents[K],
  ) => () => void;
  once: <K extends keyof ServerToClientEvents>(
    event: K,
    handler: ServerToClientEvents[K],
  ) => void;
  off: <K extends keyof ServerToClientEvents>(
    event: K,
    handler: ServerToClientEvents[K],
  ) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocketContext must be used within SocketProvider");
  }
  return context;
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const emit = useCallback(
    <K extends keyof ClientToServerEvents>(
      event: K,
      ...args: Parameters<ClientToServerEvents[K]>
    ) => {
      if (!socket?.connected) {
        console.warn("[Socket] Emit attempted while disconnected:", event);
        return;
      }
      socket.emit(event, ...args);
    },
    [socket],
  );

  const on = useCallback(
    <K extends keyof ServerToClientEvents>(
      event: K,
      handler: ServerToClientEvents[K],
    ): (() => void) => {
      if (!socket) return () => {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.on(event as any, handler as any);
      return () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.off(event as any, handler as any);
      };
    },
    [socket],
  );

  const once = useCallback(
    <K extends keyof ServerToClientEvents>(
      event: K,
      handler: ServerToClientEvents[K],
    ) => {
      if (!socket) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.once(event as any, handler as any);
    },
    [socket],
  );

  const off = useCallback(
    <K extends keyof ServerToClientEvents>(
      event: K,
      handler: ServerToClientEvents[K],
    ) => {
      if (!socket) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.off(event as any, handler as any);
    },
    [socket],
  );

  useEffect(() => {
    if (status !== "authenticated" || !session?.accessToken) return;

    const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
    const s: TypedSocket = io(url ?? "/", {
      path: "/api/socket",
      transports: ["websocket", "polling"],
      auth: { token: session.accessToken },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    requestAnimationFrame(() => {
      setSocket(s);
      setIsConnecting(true);
    });

    s.on("connect", () => {
      setIsConnected(true);
      setIsConnecting(false);
    });

    s.on("disconnect", (reason) => {
      setIsConnected(false);
      if (reason === "io server disconnect") {
        setTimeout(() => s.connect(), 1000);
      }
    });

    s.on("connect_error", (error) => {
      console.error("[Socket] Connection error:", error.message);
      setIsConnecting(false);
    });

    return () => {
      s.removeAllListeners();
      s.close();
      setSocket(null);
      setIsConnected(false);
    };
  }, [session?.accessToken, status]);

  return (
    <SocketContext.Provider
      value={{ socket, isConnected, isConnecting, emit, on, once, off }}
    >
      {children}
    </SocketContext.Provider>
  );
}
