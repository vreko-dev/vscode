# RFC: Pioneer Program WebSocket Architecture

**RFC ID**: SNAPBACK-RFC-2025-001
**Status**: Draft → Ready for Implementation
**Author**: Engineering Team
**Created**: 2025-12-17
**Target Implementation**: Phase 1, Week 1

---

## Summary

This RFC proposes a WebSocket-based real-time synchronization layer for the Pioneer Program, enabling instant state updates across all SnapBack surfaces (VS Code Extension, Web Dashboard, MCP Server).

## Motivation

### Current Problem

When a user performs an action that earns points:

1. Extension calls API → Database updated ✓
2. Extension shows stale data until manual refresh ✗
3. Web dashboard shows stale data until page reload ✗
4. User crosses tier threshold → No celebration ✗

**User Experience Impact**: Gamification feels broken. Users don't see immediate feedback for their actions, reducing engagement and trust in the system.

### Desired State

1. User earns points → All connected surfaces update within 100ms
2. User crosses tier threshold → Celebration fires on ALL surfaces simultaneously
3. Leaderboard rankings update in real-time during active periods
4. Referrer sees notification instantly when referral signs up

## Design Overview

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SNAPBACK REAL-TIME LAYER                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│   │ VS Code     │     │ Web Browser │     │ Web Browser │               │
│   │ Extension   │     │ Tab 1       │     │ Tab 2       │               │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘               │
│          │                   │                   │                       │
│          │ wss://            │ wss://            │ wss://                │
│          │                   │                   │                       │
│          └───────────────────┼───────────────────┘                       │
│                              │                                           │
│                              ▼                                           │
│                    ┌─────────────────┐                                   │
│                    │  WebSocket Hub  │◄──── Auth: Better Auth Token      │
│                    │  (api.snapback  │                                   │
│                    │   .dev/ws)      │                                   │
│                    └────────┬────────┘                                   │
│                             │                                            │
│              ┌──────────────┼──────────────┐                             │
│              │              │              │                             │
│              ▼              ▼              ▼                             │
│       ┌──────────┐   ┌──────────┐   ┌──────────┐                        │
│       │  Room:   │   │  Room:   │   │  Room:   │                        │
│       │ user_123 │   │ user_456 │   │ user_789 │                        │
│       └──────────┘   └──────────┘   └──────────┘                        │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                            EVENT SOURCES                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌─────────────────┐                                                    │
│   │ API Procedures  │                                                    │
│   │                 │                                                    │
│   │ • actions/      │──► emit('pioneer:points_updated')                 │
│   │   submit.ts     │──► emit('pioneer:tier_changed')                   │
│   │                 │                                                    │
│   │ • referrals/    │──► emit('pioneer:referral_converted')             │
│   │   apply.ts      │                                                    │
│   │                 │                                                    │
│   └─────────────────┘                                                    │
│                                                                          │
│   ┌─────────────────┐                                                    │
│   │ Cron Jobs       │                                                    │
│   │                 │                                                    │
│   │ • leaderboard   │──► emit('pioneer:leaderboard_update')             │
│   │   recalculate   │    (daily or on significant change)               │
│   │                 │                                                    │
│   └─────────────────┘                                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Connection Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CONNECTION LIFECYCLE                             │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. CLIENT INITIATES CONNECTION                                         │
│  ───────────────────────────────                                        │
│                                                                         │
│  Client ──► wss://api.snapback.dev/ws/pioneer?token=<session_token>    │
│                                                                         │
│  2. SERVER VALIDATES TOKEN                                              │
│  ─────────────────────────────                                          │
│                                                                         │
│  Server:                                                                │
│    │                                                                    │
│    ├─► Decode JWT / Validate session token with Better Auth            │
│    │                                                                    │
│    ├─► If invalid → Close(4001, "Unauthorized")                        │
│    │                                                                    │
│    └─► If valid → Extract userId, join room "user_{userId}"            │
│                                                                         │
│  3. CONNECTION ESTABLISHED                                              │
│  ─────────────────────────────                                          │
│                                                                         │
│  Server ──► Client: { type: "connected", userId: "123", room: "..." }  │
│                                                                         │
│  4. HEARTBEAT (every 30s)                                               │
│  ─────────────────────────                                              │
│                                                                         │
│  Client ──► Server: { type: "ping" }                                   │
│  Server ──► Client: { type: "pong" }                                   │
│                                                                         │
│  5. EVENT BROADCAST                                                     │
│  ──────────────────                                                     │
│                                                                         │
│  API triggers event:                                                    │
│    wsHub.broadcast("user_123", {                                       │
│      type: "pioneer:points_updated",                                    │
│      payload: { points: 450, delta: 100 }                              │
│    });                                                                  │
│                                                                         │
│  All clients in room "user_123" receive the message.                   │
│                                                                         │
│  6. GRACEFUL DISCONNECT                                                 │
│  ──────────────────────                                                 │
│                                                                         │
│  Client ──► Server: Close(1000, "Normal closure")                      │
│  Server removes client from room, cleans up.                           │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

## Technical Specification

### Server Implementation

**Technology**: Native Node.js `ws` library (lightweight, no Socket.IO overhead)

**File**: `apps/api/ws/pioneer-hub.ts`

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { validateBetterAuthToken } from './auth';
import { PioneerWSMessage, PioneerWSEvent } from '@snapback/shared/pioneer/ws-types';

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  isAlive: boolean;
}

class PioneerWebSocketHub {
  private wss: WebSocketServer;
  private rooms: Map<string, Set<AuthenticatedSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({
      server,
      path: '/ws/pioneer',
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();
  }

  private async verifyClient(
    info: { origin: string; req: IncomingMessage },
    callback: (result: boolean, code?: number, message?: string) => void
  ) {
    const url = new URL(info.req.url!, `wss://${info.req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      callback(false, 4001, 'Missing authentication token');
      return;
    }

    try {
      const session = await validateBetterAuthToken(token);
      if (!session) {
        callback(false, 4001, 'Invalid or expired token');
        return;
      }

      // Attach user info to request for use in handleConnection
      (info.req as any).userId = session.userId;
      callback(true);
    } catch (error) {
      callback(false, 4001, 'Authentication failed');
    }
  }

  private handleConnection(ws: AuthenticatedSocket, req: IncomingMessage) {
    const userId = (req as any).userId;
    ws.userId = userId;
    ws.isAlive = true;

    // Join user's room
    const roomId = `user_${userId}`;
    this.joinRoom(ws, roomId);

    // Send connected confirmation
    this.send(ws, {
      type: 'connected',
      payload: { userId, room: roomId, timestamp: Date.now() },
    });

    // Handle incoming messages
    ws.on('message', (data) => this.handleMessage(ws, data));

    // Handle pong (heartbeat response)
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle disconnect
    ws.on('close', () => {
      this.leaveRoom(ws, roomId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
      this.leaveRoom(ws, roomId);
    });
  }

  private handleMessage(ws: AuthenticatedSocket, data: WebSocket.RawData) {
    try {
      const message = JSON.parse(data.toString()) as PioneerWSMessage;

      switch (message.type) {
        case 'ping':
          this.send(ws, { type: 'pong', payload: { timestamp: Date.now() } });
          break;

        case 'subscribe':
          // Future: Allow subscribing to additional rooms (e.g., leaderboard updates)
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  private joinRoom(ws: AuthenticatedSocket, roomId: string) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(ws);
  }

  private leaveRoom(ws: AuthenticatedSocket, roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(ws);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  private send(ws: WebSocket, message: PioneerWSMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast a message to all clients in a room
   */
  public broadcast(roomId: string, event: PioneerWSEvent) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const message: PioneerWSMessage = {
      type: event.type,
      payload: event.payload,
    };

    const data = JSON.stringify(message);
    for (const ws of room) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Broadcast to a specific user (all their connected devices)
   */
  public broadcastToUser(userId: string, event: PioneerWSEvent) {
    this.broadcast(`user_${userId}`, event);
  }

  /**
   * Heartbeat to detect dead connections
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const socket = ws as AuthenticatedSocket;
        if (!socket.isAlive) {
          socket.terminate();
          return;
        }
        socket.isAlive = false;
        socket.ping();
      });
    }, 30000); // 30 seconds
  }

  public shutdown() {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}

// Singleton export
let hubInstance: PioneerWebSocketHub | null = null;

export function initPioneerHub(server: HttpServer): PioneerWebSocketHub {
  if (!hubInstance) {
    hubInstance = new PioneerWebSocketHub(server);
  }
  return hubInstance;
}

export function getPioneerHub(): PioneerWebSocketHub {
  if (!hubInstance) {
    throw new Error('PioneerWebSocketHub not initialized');
  }
  return hubInstance;
}
```

### Shared Type Definitions

**File**: `packages/shared/src/pioneer/ws-types.ts`

```typescript
export type Tier = 'seedling' | 'grower' | 'cultivator' | 'guardian';

// ─────────────────────────────────────────────────────────────────────────
// Server → Client Messages
// ─────────────────────────────────────────────────────────────────────────

export interface ConnectedMessage {
  type: 'connected';
  payload: {
    userId: string;
    room: string;
    timestamp: number;
  };
}

export interface PongMessage {
  type: 'pong';
  payload: {
    timestamp: number;
  };
}

export interface PointsUpdatedMessage {
  type: 'pioneer:points_updated';
  payload: {
    userId: string;
    points: number;
    delta: number;
    actionType: string;
  };
}

export interface TierChangedMessage {
  type: 'pioneer:tier_changed';
  payload: {
    userId: string;
    from: Tier;
    to: Tier;
    points: number;
    benefits: string[];
  };
}

export interface LeaderboardUpdateMessage {
  type: 'pioneer:leaderboard_update';
  payload: {
    yourRank: number;
    previousRank: number;
    topChanges: Array<{
      rank: number;
      display: string;
      points: number;
      change: 'up' | 'down' | 'new';
    }>;
  };
}

export interface ReferralConvertedMessage {
  type: 'pioneer:referral_converted';
  payload: {
    referrerId: string;
    referralUsername: string; // Obfuscated
    pointsEarned: number;
    totalReferrals: number;
  };
}

export type ServerToClientMessage =
  | ConnectedMessage
  | PongMessage
  | PointsUpdatedMessage
  | TierChangedMessage
  | LeaderboardUpdateMessage
  | ReferralConvertedMessage;

// ─────────────────────────────────────────────────────────────────────────
// Client → Server Messages
// ─────────────────────────────────────────────────────────────────────────

export interface PingMessage {
  type: 'ping';
}

export interface SubscribeMessage {
  type: 'subscribe';
  payload: {
    channel: 'leaderboard' | 'global_activity';
  };
}

export interface UnsubscribeMessage {
  type: 'unsubscribe';
  payload: {
    channel: string;
  };
}

export type ClientToServerMessage =
  | PingMessage
  | SubscribeMessage
  | UnsubscribeMessage;

// ─────────────────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────────────────

export type PioneerWSMessage = ServerToClientMessage | ClientToServerMessage;

export type PioneerWSEvent =
  | Omit<PointsUpdatedMessage, 'type'> & { type: 'pioneer:points_updated' }
  | Omit<TierChangedMessage, 'type'> & { type: 'pioneer:tier_changed' }
  | Omit<LeaderboardUpdateMessage, 'type'> & { type: 'pioneer:leaderboard_update' }
  | Omit<ReferralConvertedMessage, 'type'> & { type: 'pioneer:referral_converted' };
```

### Client Implementation: VS Code Extension

**File**: `apps/vscode/src/pioneer/PioneerSocket.ts`

```typescript
import * as vscode from 'vscode';
import { PioneerWSMessage, ServerToClientMessage, Tier } from '@snapback/shared/pioneer/ws-types';
import { celebrateTierUp } from './celebrations';
import { PioneerAuth } from './PioneerAuth';

const WS_URL = 'wss://api.snapback.dev/ws/pioneer';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000]; // Exponential backoff, max 30s

export class PioneerSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isIntentionallyClosed = false;

  private readonly onPointsUpdated = new vscode.EventEmitter<{ points: number; delta: number }>();
  private readonly onTierChanged = new vscode.EventEmitter<{ from: Tier; to: Tier }>();

  public readonly pointsUpdated = this.onPointsUpdated.event;
  public readonly tierChanged = this.onTierChanged.event;

  constructor(
    private readonly auth: PioneerAuth,
    private readonly statusItem: PioneerStatusItem
  ) {}

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    const token = await this.auth.getSessionToken();
    if (!token) {
      console.log('[PioneerSocket] No auth token, skipping connection');
      return;
    }

    this.isIntentionallyClosed = false;

    try {
      this.ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

      this.ws.onopen = () => {
        console.log('[PioneerSocket] Connected');
        this.reconnectAttempt = 0;
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data) as ServerToClientMessage);
      };

      this.ws.onclose = (event) => {
        console.log(`[PioneerSocket] Disconnected: ${event.code} ${event.reason}`);
        this.cleanup();

        if (!this.isIntentionallyClosed && event.code !== 4001) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[PioneerSocket] Error:', error);
      };
    } catch (error) {
      console.error('[PioneerSocket] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  private handleMessage(message: ServerToClientMessage) {
    switch (message.type) {
      case 'connected':
        console.log(`[PioneerSocket] Joined room: ${message.payload.room}`);
        break;

      case 'pong':
        // Heartbeat acknowledged
        break;

      case 'pioneer:points_updated':
        this.onPointsUpdated.fire({
          points: message.payload.points,
          delta: message.payload.delta,
        });
        // Update status bar
        this.statusItem.updatePoints(message.payload.points);
        break;

      case 'pioneer:tier_changed':
        this.onTierChanged.fire({
          from: message.payload.from,
          to: message.payload.to,
        });
        // Trigger celebration
        celebrateTierUp(message.payload.from, message.payload.to, message.payload.benefits);
        // Update status bar
        this.statusItem.updateTier(message.payload.to, message.payload.points);
        break;

      case 'pioneer:referral_converted':
        vscode.window.showInformationMessage(
          `🎁 Your referral ${message.payload.referralUsername} just signed up! +${message.payload.pointsEarned} points`
        );
        break;

      case 'pioneer:leaderboard_update':
        // Could show notification if rank changed significantly
        if (message.payload.yourRank < message.payload.previousRank) {
          vscode.window.showInformationMessage(
            `🏆 You moved up to rank #${message.payload.yourRank}!`
          );
        }
        break;
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000); // Send ping every 25s (server expects within 30s)
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    console.log(`[PioneerSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  disconnect() {
    this.isIntentionallyClosed = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.cleanup();

    if (this.ws) {
      this.ws.close(1000, 'Extension deactivating');
      this.ws = null;
    }
  }

  dispose() {
    this.disconnect();
    this.onPointsUpdated.dispose();
    this.onTierChanged.dispose();
  }
}
```

### Client Implementation: Web (React Hook)

**File**: `apps/web/modules/pioneer/hooks/use-pioneer-socket.ts`

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ServerToClientMessage, Tier } from '@snapback/shared/pioneer/ws-types';
import { celebrateTierUp } from '../components/TierCelebration';
import { toast } from 'sonner';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'wss://api.snapback.dev/ws/pioneer';
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

interface UsePioneerSocketOptions {
  enabled?: boolean;
  onPointsUpdated?: (points: number, delta: number) => void;
  onTierChanged?: (from: Tier, to: Tier) => void;
}

export function usePioneerSocket(token: string | null, options: UsePioneerSocketOptions = {}) {
  const { enabled = true, onPointsUpdated, onTierChanged } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isIntentionallyClosedRef = useRef(false);

  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  const handleMessage = useCallback((message: ServerToClientMessage) => {
    switch (message.type) {
      case 'connected':
        console.log('[PioneerSocket] Connected to room:', message.payload.room);
        break;

      case 'pioneer:points_updated':
        // Invalidate React Query cache to refetch fresh data
        queryClient.invalidateQueries({ queryKey: ['pioneer', 'me'] });
        onPointsUpdated?.(message.payload.points, message.payload.delta);

        toast.success(`+${message.payload.delta} points!`, {
          description: `You now have ${message.payload.points} total points`,
          duration: 3000,
        });
        break;

      case 'pioneer:tier_changed':
        queryClient.invalidateQueries({ queryKey: ['pioneer', 'me'] });
        queryClient.invalidateQueries({ queryKey: ['pioneer', 'leaderboard'] });
        onTierChanged?.(message.payload.from, message.payload.to);

        celebrateTierUp(message.payload.from, message.payload.to, message.payload.benefits);
        break;

      case 'pioneer:referral_converted':
        queryClient.invalidateQueries({ queryKey: ['pioneer', 'referrals'] });
        toast.success(`🎁 Referral bonus!`, {
          description: `${message.payload.referralUsername} signed up. +${message.payload.pointsEarned} points!`,
          duration: 5000,
        });
        break;

      case 'pioneer:leaderboard_update':
        queryClient.invalidateQueries({ queryKey: ['pioneer', 'leaderboard'] });
        if (message.payload.yourRank < message.payload.previousRank) {
          toast.success(`🏆 Rank up!`, {
            description: `You're now #${message.payload.yourRank} on the leaderboard!`,
          });
        }
        break;
    }
  }, [queryClient, onPointsUpdated, onTierChanged]);

  const connect = useCallback(() => {
    if (!token || !enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    isIntentionallyClosedRef.current = false;

    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      console.log('[PioneerSocket] Connected');
      setIsConnected(true);
      reconnectAttemptRef.current = 0;

      // Start ping interval
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerToClientMessage;
        handleMessage(message);
      } catch (error) {
        console.error('[PioneerSocket] Failed to parse message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log(`[PioneerSocket] Disconnected: ${event.code}`);
      setIsConnected(false);
      cleanup();

      if (!isIntentionallyClosedRef.current && event.code !== 4001) {
        scheduleReconnect();
      }
    };

    ws.onerror = (error) => {
      console.error('[PioneerSocket] Error:', error);
    };

    wsRef.current = ws;
  }, [token, enabled, handleMessage]);

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) return;

    const delay = RECONNECT_DELAYS[
      Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)
    ];

    console.log(`[PioneerSocket] Reconnecting in ${delay}ms`);

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectTimeoutRef.current = null;
      reconnectAttemptRef.current++;
      connect();
    }, delay);
  }, [connect]);

  const disconnect = useCallback(() => {
    isIntentionallyClosedRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    cleanup();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }

    setIsConnected(false);
  }, [cleanup]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Reconnect when token changes
  useEffect(() => {
    if (token && enabled) {
      disconnect();
      connect();
    }
  }, [token]);

  return {
    isConnected,
    disconnect,
    reconnect: connect,
  };
}
```

### SSE Fallback Implementation

For environments where WebSocket is blocked (corporate proxies, some cloud providers):

**File**: `apps/api/routes/pioneer-sse.ts`

```typescript
import { Router } from 'express';
import { validateBetterAuthToken } from '../ws/auth';

const router = Router();

// In-memory subscriber map (for single-server deployments)
// For multi-server, use Redis pub/sub
const subscribers = new Map<string, Set<Response>>();

router.get('/api/pioneer/events/sse', async (req, res) => {
  const token = req.query.token as string;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const session = await validateBetterAuthToken(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = session.userId;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  // Add to subscribers
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  subscribers.get(userId)!.add(res);

  // Keep-alive ping every 15 seconds
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
    subscribers.get(userId)?.delete(res);
    if (subscribers.get(userId)?.size === 0) {
      subscribers.delete(userId);
    }
  });
});

// Export function to broadcast via SSE
export function broadcastSSE(userId: string, event: string, data: unknown) {
  const subs = subscribers.get(userId);
  if (!subs) return;

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs) {
    res.write(message);
  }
}

export default router;
```

### Integration with API Procedures

**File**: `apps/api/modules/pioneer/procedures/actions/submit.ts` (modification)

```typescript
import { getPioneerHub } from '../../../ws/pioneer-hub';
import { broadcastSSE } from '../../../routes/pioneer-sse';

// ... existing submit procedure code ...

// After successfully awarding points:
const wsHub = getPioneerHub();

// Broadcast points update
const pointsEvent = {
  type: 'pioneer:points_updated' as const,
  payload: {
    userId: pioneer.userId,
    points: updatedPioneer.totalPoints,
    delta: pointsAwarded,
    actionType: input.actionType,
  },
};
wsHub.broadcastToUser(pioneer.userId, pointsEvent);
broadcastSSE(pioneer.userId, 'pioneer:points_updated', pointsEvent.payload);

// If tier changed, broadcast that too
if (tierChanged) {
  const tierEvent = {
    type: 'pioneer:tier_changed' as const,
    payload: {
      userId: pioneer.userId,
      from: oldTier,
      to: newTier,
      points: updatedPioneer.totalPoints,
      benefits: TIER_BENEFITS[newTier],
    },
  };
  wsHub.broadcastToUser(pioneer.userId, tierEvent);
  broadcastSSE(pioneer.userId, 'pioneer:tier_changed', tierEvent.payload);
}
```

## Security Considerations

### Authentication

1. **Token Validation**: Every WebSocket connection validates the Better Auth session token before accepting
2. **Token in Query Param**: While not ideal, necessary for WebSocket which doesn't support custom headers in browser. Token is:
   - Short-lived (Better Auth default: 7 days, can configure shorter)
   - Transmitted over WSS (TLS encrypted)
   - Not logged by the server
3. **Room Isolation**: Users can only receive events for their own userId room

### Rate Limiting

1. **Connection Rate Limit**: Max 10 connections per IP per minute (prevent DoS)
2. **Message Rate Limit**: Max 60 messages per minute per connection (prevent spam)
3. **Broadcast Rate Limit**: API procedures already have rate limits (10 actions/min)

### Data Exposure

1. **No Sensitive Data in Payloads**: Only points, tiers, obfuscated usernames
2. **No Cross-User Leakage**: Room-based isolation ensures users only see their own data
3. **Obfuscated Referral Names**: `referralUsername` is obfuscated before broadcast

## Scaling Considerations

### Single Server (MVP)

The current implementation uses in-memory rooms, suitable for:
- Up to ~10,000 concurrent connections per server
- Vertical scaling (bigger server)

### Multi-Server (Future)

For horizontal scaling, add Redis pub/sub:

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const subscriber = new Redis(process.env.REDIS_URL);

// Subscribe to user events
subscriber.subscribe('pioneer:events');

subscriber.on('message', (channel, message) => {
  const { userId, event } = JSON.parse(message);
  // Broadcast to local connections for this user
  wsHub.broadcastToUser(userId, event);
});

// When emitting an event, publish to Redis instead of direct broadcast
export function emitPioneerEvent(userId: string, event: PioneerWSEvent) {
  redis.publish('pioneer:events', JSON.stringify({ userId, event }));
}
```

**Migration Path**:
1. MVP: In-memory (this RFC)
2. Scale: Add Redis pub/sub (transparent to clients)
3. Enterprise: Dedicated WebSocket cluster with load balancing

## Testing Strategy

### Unit Tests

```typescript
describe('PioneerWebSocketHub', () => {
  it('rejects connections without token', async () => {
    const ws = new WebSocket('ws://localhost/ws/pioneer');
    await expect(ws).toCloseWith(4001, 'Missing authentication token');
  });

  it('rejects connections with invalid token', async () => {
    const ws = new WebSocket('ws://localhost/ws/pioneer?token=invalid');
    await expect(ws).toCloseWith(4001, 'Invalid or expired token');
  });

  it('accepts connections with valid token', async () => {
    const token = await generateValidToken();
    const ws = new WebSocket(`ws://localhost/ws/pioneer?token=${token}`);
    await expect(ws).toReceiveMessage({ type: 'connected' });
  });

  it('broadcasts to all clients in a room', async () => {
    const token = await generateValidToken({ userId: 'user_123' });
    const ws1 = new WebSocket(`ws://localhost/ws/pioneer?token=${token}`);
    const ws2 = new WebSocket(`ws://localhost/ws/pioneer?token=${token}`);

    await Promise.all([
      expect(ws1).toReceiveMessage({ type: 'connected' }),
      expect(ws2).toReceiveMessage({ type: 'connected' }),
    ]);

    wsHub.broadcastToUser('user_123', {
      type: 'pioneer:points_updated',
      payload: { points: 100, delta: 50 },
    });

    await Promise.all([
      expect(ws1).toReceiveMessage({ type: 'pioneer:points_updated' }),
      expect(ws2).toReceiveMessage({ type: 'pioneer:points_updated' }),
    ]);
  });
});
```

### Integration Tests

```typescript
describe('WebSocket + API Integration', () => {
  it('broadcasts points update when action submitted', async () => {
    // Connect WebSocket
    const ws = await connectAuthenticatedSocket(userId);

    // Submit action via API
    await client.pioneer.actions.submit({ actionType: 'github_starred' });

    // Verify WebSocket received broadcast
    await expect(ws).toReceiveMessage({
      type: 'pioneer:points_updated',
      payload: expect.objectContaining({
        delta: 100, // GitHub star points
      }),
    });
  });

  it('broadcasts tier change with benefits', async () => {
    // Set user to 240 points (10 away from Grower)
    await setUserPoints(userId, 240);

    const ws = await connectAuthenticatedSocket(userId);

    // Submit action that crosses threshold
    await client.pioneer.actions.submit({ actionType: 'tutorial_completed' }); // +50 pts

    await expect(ws).toReceiveMessage({
      type: 'pioneer:tier_changed',
      payload: {
        from: 'seedling',
        to: 'grower',
        benefits: expect.arrayContaining(['Co-change analysis']),
      },
    });
  });
});
```

### Load Tests

```typescript
describe('WebSocket Load Testing', () => {
  it('handles 1000 concurrent connections', async () => {
    const connections = await Promise.all(
      Array.from({ length: 1000 }, () => connectAuthenticatedSocket())
    );

    expect(connections.filter(c => c.readyState === WebSocket.OPEN)).toHaveLength(1000);

    // Broadcast to all
    wsHub.broadcast('global', { type: 'test', payload: {} });

    // All should receive within 100ms
    const start = Date.now();
    await Promise.all(connections.map(ws => expect(ws).toReceiveMessage({ type: 'test' })));
    expect(Date.now() - start).toBeLessThan(100);
  });
});
```

## Rollout Plan

### Phase 1: Server Infrastructure (Day 1-2)
- [ ] Implement `PioneerWebSocketHub`
- [ ] Add token validation with Better Auth
- [ ] Deploy to staging
- [ ] Test with Postman/wscat

### Phase 2: Extension Client (Day 3)
- [ ] Implement `PioneerSocket` class
- [ ] Wire up to status bar updates
- [ ] Wire up celebration triggers
- [ ] Test reconnection logic

### Phase 3: Web Client (Day 4)
- [ ] Implement `usePioneerSocket` hook
- [ ] Wire up React Query invalidation
- [ ] Wire up celebration components
- [ ] Test SSE fallback

### Phase 4: API Integration (Day 5)
- [ ] Modify `actions/submit.ts` to emit events
- [ ] Add events to referral procedures
- [ ] End-to-end testing
- [ ] Production deployment

## Open Questions

1. **Redis for Scaling**: Should we include Redis pub/sub in MVP, or defer to post-launch?
   - **Recommendation**: Defer. In-memory is fine for expected initial load.

2. **Leaderboard Live Updates**: Should leaderboard update in real-time, or on manual refresh?
   - **Recommendation**: Daily batch + manual refresh. Real-time leaderboard could cause UI thrashing.

3. **Mobile App Support**: If we add mobile apps, should they use WebSocket or push notifications?
   - **Recommendation**: Push notifications for mobile (better battery life). Defer to post-launch.

## Appendix: Alternative Approaches Considered

### Socket.IO

**Pros**: Built-in reconnection, fallback to polling, rooms
**Cons**: Large bundle size (~100KB), abstractions hide important details
**Decision**: Use native `ws` for smaller bundle and explicit control

### Server-Sent Events Only

**Pros**: Simpler, no bidirectional complexity
**Cons**: No client-to-server messages, less efficient for high-frequency updates
**Decision**: Use SSE as fallback only, WebSocket as primary

### GraphQL Subscriptions

**Pros**: Unified with existing GraphQL (if we had it)
**Cons**: We use oRPC, not GraphQL. Would add significant complexity.
**Decision**: Not applicable to our stack

---

**RFC Status**: Ready for implementation
**Approved By**: [Pending]
**Implementation Tracking**: PION-004 in Linear
