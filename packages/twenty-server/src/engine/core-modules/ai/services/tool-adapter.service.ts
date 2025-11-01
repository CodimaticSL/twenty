import { Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';

import { ToolRegistryService } from 'src/engine/core-modules/tool/services/tool-registry.service';
import { type ToolInput } from 'src/engine/core-modules/tool/types/tool-input.type';
import { type Tool } from 'src/engine/core-modules/tool/types/tool.type';
import { type PermissionFlagType } from 'src/engine/metadata-modules/permissions/constants/permission-flag-type.constants';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

@Injectable()
export class ToolAdapterService {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async getTools(
    rolePermissionConfig?: RolePermissionConfig,
    workspaceId?: string,
  ): Promise<ToolSet> {
    const tools: ToolSet = {};

    for (const toolType of this.toolRegistry.getAllToolTypes()) {
      const tool = this.toolRegistry.getTool(toolType);

      if (!tool.flag) {
        tools[toolType.toLowerCase()] = this.createToolSet(tool);
      } else if (rolePermissionConfig && workspaceId) {
        const hasPermission = await this.permissionsService.hasToolPermission(
          rolePermissionConfig,
          workspaceId,
          tool.flag as PermissionFlagType,
        );

        if (hasPermission) {
          tools[toolType.toLowerCase()] = this.createToolSet(tool);
        }
      }
    }

    return tools;
  }

  private createToolSet(tool: Tool) {
    return {
      description: tool.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: this.addInputTypeRecursively(tool.inputSchema as any),
      execute: async (parameters: { input: ToolInput }) =>
        tool.execute(parameters.input),
    };
  }

  // Add inputType recursively for dual compatibility (MCP + n8n)
  // We use 'any' here because we need to traverse and modify deeply nested
  // schema structures that come from the ai SDK's FlexibleSchema type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private addInputTypeRecursively(schema: any): any {
    try {
      // Handle null, undefined, or non-object cases
      if (
        schema === null ||
        schema === undefined ||
        typeof schema !== 'object'
      ) {
        return schema;
      }

      // Handle arrays - process each item
      if (Array.isArray(schema)) {
        return schema.map((item) => this.addInputTypeRecursively(item));
      }

      // Clone the schema to avoid mutation
      const result = { ...schema };

      // Only add inputType if type exists and is a string/number, and inputType doesn't already exist
      if (
        'type' in result &&
        result.type !== null &&
        result.type !== undefined &&
        (typeof result.type === 'string' || typeof result.type === 'number') &&
        !('inputType' in result)
      ) {
        result.inputType = result.type;
      }

      // Recursively process nested objects with safety checks
      for (const key in result) {
        if (
          Object.prototype.hasOwnProperty.call(result, key) &&
          result[key] !== null &&
          result[key] !== undefined &&
          typeof result[key] === 'object'
        ) {
          try {
            result[key] = this.addInputTypeRecursively(result[key]);
          } catch (error) {
            // Log error but continue processing other properties
            console.warn(`Error processing property ${key}:`, error);
            // Keep original value if processing fails
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Critical error in addInputTypeRecursively:', error);

      return schema; // Return original schema if processing fails
    }
  }
}
