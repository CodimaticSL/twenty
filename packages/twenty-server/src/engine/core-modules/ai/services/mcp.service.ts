import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type ToolSet } from 'ai';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { type JsonRpc } from 'src/engine/core-modules/ai/dtos/json-rpc';
import { McpConnectionManagerService } from 'src/engine/core-modules/ai/services/mcp-connection-manager.service';
import { ToolService } from 'src/engine/core-modules/ai/services/tool.service';
import { wrapJsonRpcResponse } from 'src/engine/core-modules/ai/utils/wrap-jsonrpc-response.util';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { ADMIN_ROLE } from 'src/engine/workspace-manager/workspace-sync-metadata/standard-roles/roles/admin-role';

@Injectable()
export class McpService {
  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly toolService: ToolService,
    private readonly userRoleService: UserRoleService,
    private readonly connectionManager: McpConnectionManagerService,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
  ) {}

  async handleInitialize(
    requestId: string | number,
    roleId: string,
    workspaceId: string,
  ) {
    const toolSet = await this.toolService.listTools(
      { unionOf: [roleId] },
      workspaceId,
    );

    // Validar que toolSet no sea null/undefined antes de procesarlo
    if (!toolSet || typeof toolSet !== 'object') {
      return wrapJsonRpcResponse(requestId, {
        result: {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: false },
            prompts: { listChanged: false },
          },
          serverInfo: {
            name: 'Twenty CRM MCP Server',
            version: '0.0.1',
          },
        },
      });
    }

    Object.entries(toolSet || {})
      .filter(([, def]) => !!def.inputSchema)
      .map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: def.inputSchema,
      }));

    return wrapJsonRpcResponse(requestId, {
      result: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: 'Twenty CRM MCP Server',
          version: '0.0.1',
        },
      },
    });
  }

  async getRoleId(
    workspaceId: string,
    userWorkspaceId?: string,
    apiKey?: string,
  ) {
    if (apiKey) {
      const roles = await this.roleRepository.find({
        where: {
          workspaceId,
          standardId: ADMIN_ROLE.standardId,
        },
      });

      if (roles.length === 0) {
        throw new HttpException('Admin role not found', HttpStatus.FORBIDDEN);
      }

      return roles[0].id;
    }

    if (!userWorkspaceId) {
      throw new HttpException(
        'User workspace ID missing',
        HttpStatus.FORBIDDEN,
      );
    }

    const roleId = await this.userRoleService.getRoleIdForUserWorkspace({
      workspaceId,
      userWorkspaceId,
    });

    if (!roleId) {
      throw new HttpException('Role ID missing', HttpStatus.FORBIDDEN);
    }

    return roleId;
  }

  async handleMCPCoreQuery(
    { id, method, params }: JsonRpc,
    {
      workspace,
      userWorkspaceId,
      apiKey,
    }: { workspace: WorkspaceEntity; userWorkspaceId?: string; apiKey?: string },
    headers?: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    // Obtener o crear conexión para seguimiento
    const roleId = await this.getRoleId(workspace.id, userWorkspaceId, apiKey);
    const connection = this.connectionManager.getOrCreateConnection(
      workspace.id,
      roleId,
      headers || {},
    );

    try {
      // Manejo especial para handshake MCP
      if (method === 'initialize') {
        this.connectionManager.recordInitialize(connection.id);
        const result = await this.handleInitialize(id, roleId, workspace.id);

        // Agregar información de diagnóstico a la respuesta
        if (
          'result' in result &&
          result.result &&
          typeof result.result === 'object'
        ) {
          const resultObj = result.result as Record<string, unknown>;

          resultObj.connectionId = connection.id;

          resultObj.diagnostics = this.connectionManager.getDiagnostics(
            connection.id,
          );
        }

        return result;
      }

      if (method === 'initialized') {
        this.connectionManager.recordInitialized(connection.id);

        return wrapJsonRpcResponse(id, {
          result: {},
        });
      }

      if (method === 'ping') {
        return wrapJsonRpcResponse(id, {
          result: {
            connectionId: connection.id,
            diagnostics: this.connectionManager.getDiagnostics(connection.id),
          },
        });
      }

      // Para métodos que requieren handshake completo
      if (method === 'tools/list') {
        this.connectionManager.recordToolsListRequest(connection.id);
      }

      // Verificar si usar modo compatibilidad
      const useCompatibilityMode =
        this.connectionManager.shouldUseCompatibilityMode(connection.id);

      const toolSet = await this.toolService.listTools(
        { unionOf: [roleId] },
        workspace.id,
      );

      if (method === 'tools/call' && params) {
        return await this.handleToolCall(id, toolSet, params, connection.id);
      }

      if (method === 'tools/list') {
        return await this.handleToolsListing(id, toolSet, connection.id);
      }

      if (method === 'prompts/list') {
        return wrapJsonRpcResponse(id, {
          result: {
            capabilities: {
              prompts: { listChanged: false },
            },
            prompts: [],
            connectionId: connection.id,
            compatibilityMode: useCompatibilityMode,
          },
        });
      }

      if (method === 'resources/list') {
        return wrapJsonRpcResponse(id, {
          result: {
            capabilities: {
              resources: { listChanged: false },
            },
            resources: [],
            connectionId: connection.id,
            compatibilityMode: useCompatibilityMode,
          },
        });
      }

      return wrapJsonRpcResponse(id, {
        result: {
          connectionId: connection.id,
          compatibilityMode: useCompatibilityMode,
        },
      });
    } catch (error) {
      // Registrar error en diagnóstico
      this.connectionManager.recordError(connection.id, method, error.message);

      return wrapJsonRpcResponse(id, {
        error: {
          code: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || 'Failed to execute tool',
          connectionId: connection.id,
        },
      });
    }
  }

  private async handleToolCall(
    id: string | number,
    toolSet: ToolSet,
    params: Record<string, unknown>,
    connectionId: string,
  ) {
    const toolName = params.name as keyof typeof toolSet;
    const tool = toolSet[toolName];

    if (isDefined(tool) && isDefined(tool.execute)) {
      try {
        const result = await tool.execute(params.arguments, {
          toolCallId: id.toString(),
          messages: [],
        });

        return wrapJsonRpcResponse(id, {
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
            isError: false,
            connectionId,
          },
        });
      } catch (error) {
        this.connectionManager.recordError(
          connectionId,
          `tools/call:${toolName}`,
          error.message,
        );

        return wrapJsonRpcResponse(id, {
          result: {
            content: [
              {
                type: 'text',
                text: `Error executing tool ${toolName}: ${error.message}`,
              },
            ],
            isError: true,
            connectionId,
          },
        });
      }
    }

    const errorMessage = `Tool '${params.name}' not found`;

    this.connectionManager.recordError(
      connectionId,
      `tools/call:${params.name}`,
      errorMessage,
    );

    throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
  }

  private handleToolsListing(
    id: string | number,
    toolSet: ToolSet,
    connectionId: string,
  ) {
    try {
      const toolsArray = Object.entries(toolSet)
        .filter(([, def]) => !!def.inputSchema)
        .map(([name, def]) => ({
          name,
          description: def.description,
          inputSchema:
            (def.inputSchema as unknown as { jsonSchema?: unknown })
              .jsonSchema || def.inputSchema,
        }));

      const useCompatibilityMode =
        this.connectionManager.shouldUseCompatibilityMode(connectionId);

      return wrapJsonRpcResponse(id, {
        result: {
          capabilities: {
            tools: { listChanged: false },
          },
          tools: toolsArray,
          resources: [],
          prompts: [],
          connectionId,
          compatibilityMode: useCompatibilityMode,
          diagnostics: this.connectionManager.getDiagnostics(connectionId),
        },
      });
    } catch {
      return wrapJsonRpcResponse(id, {
        error: {
          code: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Failed to list tools',
        },
      });
    }
  }

  // Nuevo método para obtener estadísticas de conexiones
  getConnectionStats() {
    return this.connectionManager.getStats();
  }

  // Nuevo método para obtener diagnóstico de una conexión específica
  getConnectionDiagnostics(connectionId: string) {
    return this.connectionManager.getDiagnostics(connectionId);
  }
}
