import { HttpStatus, Injectable } from '@nestjs/common';

import { validationMetadatasToSchemas } from 'class-validator-jsonschema';
import { type Request } from 'express';
import { type JSONSchema7 } from 'json-schema';

import { CreateToolsService } from 'src/engine/api/mcp/services/tools/create.tools.service';
import { DeleteToolsService } from 'src/engine/api/mcp/services/tools/delete.tools.service';
import { GetToolsService } from 'src/engine/api/mcp/services/tools/get.tools.service';
import { UpdateToolsService } from 'src/engine/api/mcp/services/tools/update.tools.service';
import { wrapJsonRpcResponse } from 'src/engine/core-modules/ai/utils/wrap-jsonrpc-response.util';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { MetricsService } from 'src/engine/core-modules/metrics/metrics.service';
import { MetricsKeys } from 'src/engine/core-modules/metrics/types/metrics-keys.type';
import { type Workspace } from 'src/engine/core-modules/workspace/workspace.entity';

@Injectable()
export class MCPMetadataService {
  schemas: Record<string, JSONSchema7>;

  constructor(
    private readonly featureFlagService: FeatureFlagService,
    private readonly createToolsService: CreateToolsService,
    private readonly updateToolsService: UpdateToolsService,
    private readonly deleteToolsService: DeleteToolsService,
    private readonly getToolsService: GetToolsService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    this.schemas = validationMetadatasToSchemas() as Record<
      string,
      JSONSchema7
    >;
  }

  handleInitialize(requestId: string | number) {
    console.log('🔧 MCP Metadata handleInitialize called with ID:', requestId);

    const response = {
      protocolVersion: '2025-03-26',
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        prompts: { listChanged: false },
      },
      serverInfo: {
        name: 'Twenty CRM MCP Metadata Server',
        version: '0.0.1',
      },
      tools: [],
      resources: [],
      prompts: [],
    };

    console.log(
      '🔧 MCP Metadata response before wrap:',
      JSON.stringify(response, null, 2),
    );

    const wrapped = wrapJsonRpcResponse(requestId, {
      result: response,
    });

    console.log(
      '🔧 MCP Metadata final response:',
      JSON.stringify(wrapped, null, 2),
    );

    return wrapped;
  }

  get tools() {
    return [
      ...this.createToolsService.tools,
      ...this.updateToolsService.tools,
      ...this.deleteToolsService.tools,
      ...this.getToolsService.tools,
    ];
  }

  async handleToolCall(
    request: Request,
  ): Promise<Parameters<typeof wrapJsonRpcResponse>[1]> {
    const tool = this.tools.find(
      ({ name }) => name === request.body.params.name,
    );

    if (tool) {
      try {
        const result = await tool.execute(request);

        await this.metricsService.incrementCounter({
          key: MetricsKeys.AIToolExecutionSucceeded,
          attributes: {
            tool: request.body.params.name,
          },
        });

        return { result };
      } catch (err) {
        await this.metricsService.incrementCounter({
          key: MetricsKeys.AIToolExecutionFailed,
          attributes: {
            tool: request.body.params.name,
          },
        });
        throw err;
      }
    }

    return {
      error: {
        code: HttpStatus.NOT_FOUND,
        message: `Tool ${request.body.params.name} not found`,
      },
    };
  }

  async listTools(request: Request) {
    return wrapJsonRpcResponse(request.body.id, {
      result: {
        capabilities: {
          tools: { listChanged: false },
        },
        tools: Object.values(this.tools),
        resources: [],
        prompts: [],
      },
    });
  }

  async handleMCPMetadataQuery(
    request: Request,
    {
      workspace,
    }: { workspace: Workspace; userWorkspaceId?: string; apiKey?: string },
  ): Promise<Record<string, unknown>> {
    try {
      if (request.body.method === 'initialize') {
        return this.handleInitialize(request.body.id);
      }

      if (request.body.method === 'ping') {
        return wrapJsonRpcResponse(request.body.id, {
          result: {},
        });
      }

      if (request.body.method === 'tools/call' && request.body.params) {
        return wrapJsonRpcResponse(
          request.body.id,
          await this.handleToolCall(request),
        );
      }

      if (request.body.method === 'tools/list') {
        return this.listTools(request);
      }

      if (request.body.method === 'prompts/list') {
        return wrapJsonRpcResponse(request.body.id, {
          result: {
            capabilities: {
              prompts: { listChanged: false },
            },
            prompts: [],
          },
        });
      }

      if (request.body.method === 'resources/list') {
        return wrapJsonRpcResponse(request.body.id, {
          result: {
            capabilities: {
              resources: { listChanged: false },
            },
            resources: [],
          },
        });
      }

      return wrapJsonRpcResponse(request.body.id ?? crypto.randomUUID(), {
        result: {},
      });
    } catch (error) {
      return wrapJsonRpcResponse(request.body.id ?? crypto.randomUUID(), {
        error: {
          code: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message:
            error.response?.messages?.join?.('\n') || 'Failed to execute tool',
        },
      });
    }
  }
}
