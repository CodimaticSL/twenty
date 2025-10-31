import { Controller, Get, UseGuards } from '@nestjs/common';

import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';

/**
 * Controlador público para endpoints MCP que no requieren autenticación
 * Incluye health checks y endpoints de diagnóstico
 */
@Controller('mcp')
@UseGuards(PublicEndpointGuard)
export class McpPublicController {
  /**
   * Endpoint de health check público para MCP
   * No requiere autenticación para monitoreo y diagnóstico
   */
  @Get('health')
  async healthCheck() {
    return {
      status: 'healthy',
      service: 'MCP Core',
      protocol: 'MCP',
      version: '2025-03-26',
      timestamp: new Date().toISOString(),
      endpoints: {
        core: '/mcp',
        stream: '/mcp/stream',
        metadata: '/mcp/metadata',
        metadataStream: '/mcp/metadata/stream',
        health: '/mcp/health',
      },
    };
  }
}