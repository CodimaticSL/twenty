import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type QueryResultFieldValue } from 'src/engine/api/graphql/workspace-query-runner/factories/query-result-getters/interfaces/query-result-field-value';
import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/api-key-role.service';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';

// Post-hook para TODOS los objetos con patrón wildcard (GraphQL)
@WorkspaceQueryHook({
  key: `*.findMany`,
  type: WorkspaceQueryHookType.POST_HOOK,
})
@Injectable()
export class SalesFilterFindManyPostQueryHook
  implements WorkspacePostQueryHookInstance
{
  constructor(
    private readonly userRoleService: UserRoleService,
    private readonly apiKeyRoleService: ApiKeyRoleService,
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {
    console.log(
      '🚀 SALES FILTER POST-HOOK - Constructor ejecutado - Post-hook cargado en la aplicación',
    );
  }

  async execute(
    authContext: AuthContext,
    objectName: string,
    payload: QueryResultFieldValue,
  ): Promise<void> {
    // LOG GENERAL - Siempre se ejecuta para ver si el hook se llama
    console.log(
      '🔍 SALES FILTER POST-HOOK - Hook ejecutado para objeto:',
      objectName,
    );
    console.log(
      '🔍 SALES FILTER POST-HOOK - User:',
      authContext.user?.firstName,
      authContext.user?.lastName,
    );

    // Validar que tenemos el workspace y O userWorkspaceId O apiKeyId
    if (
      !authContext.workspace?.id ||
      (!authContext.userWorkspaceId && !authContext.apiKey?.id)
    ) {
      console.log(
        '🔍 SALES FILTER POST-HOOK - No hay workspace o userWorkspaceId/apiKeyId',
      );

      return;
    }

    // Obtener el rol del usuario (soporta ambos casos: userWorkspaceId y apiKeyId)
    let userRole = null;

    if (authContext.userWorkspaceId) {
      // Caso 1: Usuario normal
      const roleId = await this.userRoleService.getRoleIdForUserWorkspace({
        userWorkspaceId: authContext.userWorkspaceId,
        workspaceId: authContext.workspace.id,
      });

      if (!roleId) {
        console.log(
          '🔍 SALES FILTER POST-HOOK - No se encontró roleId para userWorkspaceId',
        );

        return;
      }

      const roles = await this.userRoleService.getRolesByUserWorkspaces({
        userWorkspaceIds: [authContext.userWorkspaceId],
        workspaceId: authContext.workspace.id,
      });

      userRole = roles.get(authContext.userWorkspaceId)?.[0];
    } else if (authContext.apiKey?.id) {
      // Caso 2: API Key
      const rolesMap = await this.apiKeyRoleService.getRolesByApiKeys({
        apiKeyIds: [authContext.apiKey.id],
        workspaceId: authContext.workspace.id,
      });

      userRole = rolesMap.get(authContext.apiKey.id);
    }

    if (!userRole) {
      console.log(
        '🔍 SALES FILTER POST-HOOK - No se encontró rol para el usuario/API Key',
      );

      return;
    }

    // Solo aplicar filtro a roles "Comercial" o similares
    if (userRole && userRole.label === 'Comercial') {
      console.log(
        `🔍 SALES FILTER POST-HOOK - Aplicando filtro de relaciones para rol Comercial`,
      );

      // Obtener el nombre del comercial para filtrar
      const commercialName = await this.getCommercialName(authContext);

      if (!commercialName) {
        console.log(
          '🔍 SALES FILTER POST-HOOK - No se pudo obtener el nombre del comercial',
        );

        return;
      }

      console.log(
        '🔍 SALES FILTER POST-HOOK - Filtrando relaciones para comercial:',
        commercialName,
      );

      // Filtrar las relaciones anidadas en el payload
      this.filterNestedRelations(payload, commercialName);
    } else {
      console.log(
        `🔍 SALES FILTER POST-HOOK - No se aplica filtro (rol no es Comercial):`,
        userRole?.label,
      );
    }
  }

  /**
   * Obtiene el nombre del comercial para filtrar
   */
  private async getCommercialName(
    authContext: AuthContext,
  ): Promise<string | null> {
    if (authContext.userWorkspaceId) {
      // Caso 1: Usuario CRM - Obtener el workspaceMember
      const workspaceMemberRepository =
        await this.twentyORMGlobalManager.getRepositoryForWorkspace(
          authContext.workspace!.id,
          'workspaceMember',
        );

      const workspaceMember = await workspaceMemberRepository.findOne({
        where: {
          userId: authContext.user?.id,
        },
      });

      if (!workspaceMember) {
        console.log(
          '🔍 SALES FILTER POST-HOOK - No se encontró workspaceMember para el usuario',
        );

        return null;
      }

      const firstName = workspaceMember.name?.firstName || '';
      const lastName = workspaceMember.name?.lastName || '';

      return `${firstName} ${lastName}`.trim();
    } else if (authContext.apiKey?.id && authContext.apiKey?.name) {
      // Caso 2: API Key
      return authContext.apiKey.name;
    }

    return null;
  }

  /**
   * Filtra recursivamente las relaciones anidadas en un payload
   */
  private filterNestedRelations(
    payload: QueryResultFieldValue,
    commercialName: string,
  ): void {
    // Caso 1: Es un array de registros (findMany normal)
    if (Array.isArray(payload)) {
      payload.forEach((item) =>
        this.filterRecordRelations(item as Record<string, unknown>, commercialName),
      );
    }
    // Caso 2: Es una conexión GraphQL (con edges)
    else if (
      payload &&
      typeof payload === 'object' &&
      'edges' in payload
    ) {
      const connection = payload as {
        edges: Array<{ node: Record<string, unknown> }>;
      };

      if (connection.edges && Array.isArray(connection.edges)) {
        connection.edges.forEach((edge) => {
          if (edge.node) {
            this.filterRecordRelations(edge.node, commercialName);
          }
        });
      }
    }
    // Caso 3: Es un objeto con propiedad records
    else if (
      payload &&
      typeof payload === 'object' &&
      'records' in payload
    ) {
      const recordsContainer = payload as {
        records: Record<string, unknown>[];
      };

      if (recordsContainer.records && Array.isArray(recordsContainer.records)) {
        recordsContainer.records.forEach((item) =>
          this.filterRecordRelations(item, commercialName),
        );
      }
    }
    // Caso 4: Es un registro individual
    else if (payload && typeof payload === 'object' && 'id' in payload) {
      this.filterRecordRelations(payload as Record<string, unknown>, commercialName);
    }
  }

  /**
   * Filtra las relaciones de un registro individual
   */
  private filterRecordRelations(
    record: Record<string, unknown>,
    commercialName: string,
  ): void {
    if (!record || typeof record !== 'object') {
      return;
    }

    // Recorrer todas las propiedades del registro
    for (const [key, value] of Object.entries(record)) {
      // Ignorar propiedades que no son objetos o que son createdBy
      if (!value || typeof value !== 'object' || key === 'createdBy') {
        continue;
      }

      // Si es un array de objetos (relación 1:N)
      if (Array.isArray(value)) {
        const filteredArray = value
          .filter((item) => this.shouldKeepRecord(item, commercialName))
          .map((item) => {
            this.filterRecordRelations(item as Record<string, unknown>, commercialName);
            return item;
          });

        record[key] = filteredArray;
      }
      // Si es un objeto (relación 1:1)
      else if (typeof value === 'object' && 'id' in value) {
        if (this.shouldKeepRecord(value, commercialName)) {
          this.filterRecordRelations(value as Record<string, unknown>, commercialName);
        } else {
          record[key] = null;
        }
      }
    }
  }

  /**
   * Determina si un registro debe mantenerse según el filtro de comercial
   */
  private shouldKeepRecord(
    record: unknown,
    commercialName: string,
  ): boolean {
    if (!record || typeof record !== 'object') {
      return true;
    }

    const recordObj = record as Record<string, unknown>;

    // Si no tiene createdBy, mantener
    if (!recordObj.createdBy) {
      return true;
    }

    const createdBy = recordObj.createdBy as Record<string, unknown>;

    // Caso 1: Tiene workspaceMemberId y coincide con el del usuario actual
    if (createdBy.workspaceMemberId) {
      return createdBy.name === commercialName;
    }

    // Caso 2: Tiene name y coincide con el nombre del comercial
    if (createdBy.name) {
      return createdBy.name === commercialName;
    }

    // Caso 3: No tiene información suficiente, mantener por seguridad
    return true;
  }
}