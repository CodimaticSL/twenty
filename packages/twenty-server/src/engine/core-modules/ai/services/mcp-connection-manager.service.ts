import { Injectable } from '@nestjs/common';

export interface McpConnectionState {
  id: string;
  workspaceId: string;
  roleId: string;
  protocolVersion: string;
  isInitialized: boolean;
  isHandshakeCompleted: boolean;
  lastActivity: Date;
  clientInfo: {
    userAgent?: string;
    authorization?: string;
    ip?: string;
  };
  diagnostics: {
    initializeReceived?: Date;
    initializedReceived?: Date;
    toolsListRequested?: Date;
    handshakeCompleted?: Date;
    compatibilityMode?: boolean;
    errors: Array<{
      timestamp: Date;
      method: string;
      error: string;
    }>;
  };
}

@Injectable()
export class McpConnectionManagerService {
  private connections = new Map<string, McpConnectionState>();
  private readonly CONNECTION_TIMEOUT = 30 * 60 * 1000; // 30 minutos
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutos

  constructor() {
    // Iniciar limpieza periódica de conexiones expiradas
    setInterval(() => this.cleanupExpiredConnections(), this.CLEANUP_INTERVAL);
  }

  generateConnectionId(
    workspaceId: string,
    headers: Record<string, string>,
  ): string {
    // Generar ID único basado en workspace y headers del cliente
    const userAgent = headers['user-agent'] || 'unknown';
    const auth = headers['authorization'] || 'no-auth';
    const timestamp = Date.now();

    return `${workspaceId}-${Buffer.from(`${userAgent}-${auth}`)
      .toString('base64')
      .slice(0, 8)}-${timestamp}`;
  }

  getOrCreateConnection(
    workspaceId: string,
    roleId: string,
    headers: Record<string, string>,
  ): McpConnectionState {
    const connectionId = this.generateConnectionId(workspaceId, headers);

    let connection = this.connections.get(connectionId);

    if (!connection) {
      connection = {
        id: connectionId,
        workspaceId,
        roleId,
        protocolVersion: headers['mcp-protocol-version'] || '2025-03-26',
        isInitialized: false,
        isHandshakeCompleted: false,
        lastActivity: new Date(),
        clientInfo: {
          userAgent: headers['user-agent'],
          authorization: headers['authorization'],
        },
        diagnostics: {
          errors: [],
        },
      };

      this.connections.set(connectionId, connection);
      console.log(
        `MCP Connection Manager: New connection created - ${connectionId}`,
      );
    } else {
      connection.lastActivity = new Date();
    }

    return connection;
  }

  recordInitialize(connectionId: string): void {
    const connection = this.connections.get(connectionId);

    if (connection) {
      connection.isInitialized = true;
      connection.diagnostics.initializeReceived = new Date();
      console.log(
        `MCP Connection Manager: Initialize received - ${connectionId}`,
      );

      // Auto-completar handshake para clientes como Kilo Code
      this.scheduleAutoHandshakeCompletion(connectionId);
    }
  }

  recordInitialized(connectionId: string): void {
    const connection = this.connections.get(connectionId);

    if (connection) {
      connection.isHandshakeCompleted = true;
      connection.diagnostics.initializedReceived = new Date();
      connection.diagnostics.handshakeCompleted = new Date();
      console.log(
        `MCP Connection Manager: Handshake completed - ${connectionId}`,
      );
    }
  }

  recordToolsListRequest(connectionId: string): void {
    const connection = this.connections.get(connectionId);

    if (connection) {
      connection.diagnostics.toolsListRequested = new Date();

      // Si el handshake no está completado, activar modo compatibilidad
      if (!connection.isHandshakeCompleted) {
        connection.diagnostics.compatibilityMode = true;
        console.log(
          `MCP Connection Manager: Compatibility mode activated - ${connectionId}`,
        );
      }
    }
  }

  recordError(connectionId: string, method: string, error: string): void {
    const connection = this.connections.get(connectionId);

    if (connection) {
      connection.diagnostics.errors.push({
        timestamp: new Date(),
        method,
        error,
      });

      // Mantener solo los últimos 10 errores
      if (connection.diagnostics.errors.length > 10) {
        connection.diagnostics.errors =
          connection.diagnostics.errors.slice(-10);
      }
    }
  }

  getConnection(connectionId: string): McpConnectionState | undefined {
    return this.connections.get(connectionId);
  }

  isHandshakeCompleted(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);

    return connection?.isHandshakeCompleted || false;
  }

  shouldUseCompatibilityMode(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);

    return connection?.diagnostics.compatibilityMode || false;
  }

  getDiagnostics(connectionId: string):
    | {
        connectionId: string;
        workspaceId: string;
        protocolVersion: string;
        isInitialized: boolean;
        isHandshakeCompleted: boolean;
        lastActivity: Date;
        clientInfo: {
          userAgent?: string;
          authorization?: string;
        };
        diagnostics: {
          initializeReceived?: Date;
          initializedReceived?: Date;
          toolsListRequested?: Date;
          handshakeCompleted?: Date;
          compatibilityMode?: boolean;
          handshakeDuration: number | null;
          errorCount: number;
          recentErrors: Array<{
            timestamp: Date;
            method: string;
            error: string;
          }>;
        };
      }
    | { error: string } {
    const connection = this.connections.get(connectionId);

    if (!connection) {
      return { error: 'Connection not found' };
    }

    return {
      connectionId: connection.id,
      workspaceId: connection.workspaceId,
      protocolVersion: connection.protocolVersion,
      isInitialized: connection.isInitialized,
      isHandshakeCompleted: connection.isHandshakeCompleted,
      lastActivity: connection.lastActivity,
      clientInfo: connection.clientInfo,
      diagnostics: {
        ...connection.diagnostics,
        handshakeDuration:
          connection.diagnostics.handshakeCompleted &&
          connection.diagnostics.initializeReceived
            ? connection.diagnostics.handshakeCompleted.getTime() -
              connection.diagnostics.initializeReceived.getTime()
            : null,
        errorCount: connection.diagnostics.errors.length,
        recentErrors: connection.diagnostics.errors.slice(-3),
      },
    };
  }

  private scheduleAutoHandshakeCompletion(connectionId: string): void {
    // Esperar 2 segundos y luego auto-completar el handshake si no se recibió initialized
    setTimeout(() => {
      const connection = this.connections.get(connectionId);

      if (
        connection &&
        connection.isInitialized &&
        !connection.isHandshakeCompleted
      ) {
        console.log(
          `MCP Connection Manager: Auto-completing handshake for ${connectionId}`,
        );
        this.recordInitialized(connectionId);
      }
    }, 2000);
  }

  private cleanupExpiredConnections(): void {
    const now = Date.now();
    const expiredConnections: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      if (now - connection.lastActivity.getTime() > this.CONNECTION_TIMEOUT) {
        expiredConnections.push(connectionId);
      }
    }

    if (expiredConnections.length > 0) {
      console.log(
        `MCP Connection Manager: Cleaning up ${expiredConnections.length} expired connections`,
      );
      expiredConnections.forEach((id) => this.connections.delete(id));
    }
  }

  // Método para obtener estadísticas generales
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    handshakeCompleted: number;
    compatibilityModeActive: number;
    protocolVersions: string[];
    averageErrors: number;
  } {
    const connections = Array.from(this.connections.values());
    const now = Date.now();

    return {
      totalConnections: connections.length,
      activeConnections: connections.filter(
        (c) => now - c.lastActivity.getTime() < 5 * 60 * 1000,
      ).length,
      handshakeCompleted: connections.filter((c) => c.isHandshakeCompleted)
        .length,
      compatibilityModeActive: connections.filter(
        (c) => c.diagnostics.compatibilityMode,
      ).length,
      protocolVersions: [...new Set(connections.map((c) => c.protocolVersion))],
      averageErrors:
        connections.length > 0
          ? connections.reduce(
              (sum, c) => sum + c.diagnostics.errors.length,
              0,
            ) / connections.length
          : 0,
    };
  }
}
