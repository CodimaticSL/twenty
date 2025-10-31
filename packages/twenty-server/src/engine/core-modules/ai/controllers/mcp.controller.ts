import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { JsonRpc } from 'src/engine/core-modules/ai/dtos/json-rpc';
import { McpService } from 'src/engine/core-modules/ai/services/mcp.service';
import { Workspace } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthApiKey } from 'src/engine/decorators/auth/auth-api-key.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';

@Controller('mcp')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
  async handleMcpCore(
    @Body() body: JsonRpc,
    @AuthWorkspace() workspace: Workspace,
    @AuthApiKey() apiKey: string | undefined,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
    @Headers() headers: Record<string, string>,
  ) {
    // Validación opcional de MCP-Protocol-Version - solo si está presente
    const protocolVersion = headers['mcp-protocol-version'];

    if (protocolVersion && protocolVersion !== '2025-03-26') {
      throw new HttpException(
        `Invalid MCP-Protocol-Version header. Expected: 2025-03-26, got: ${protocolVersion}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Eliminamos completamente la validación del Accept header
    // para máxima compatibilidad con Kilo Code y otros clientes MCP

    try {
      const result = await this.mcpService.handleMCPCoreQuery(
        body,
        {
          workspace,
          userWorkspaceId,
          apiKey,
        },
        headers,
      );

      return result;
    } catch (error) {
      throw error;
    }
  }
}
