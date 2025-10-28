import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/api-key-role.service';
import { getObjectMetadataMapItemByNameSingular } from 'src/engine/metadata-modules/utils/get-object-metadata-map-item-by-name-singular.util';
import { WorkspaceMetadataCacheService } from 'src/engine/metadata-modules/workspace-metadata-cache/services/workspace-metadata-cache.service';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';

// Hook para TODOS los objetos con patrón wildcard (GraphQL)
@WorkspaceQueryHook(`*.findMany`)
@Injectable()
export class SalesFilterFindManyPreQueryHook
  implements WorkspacePreQueryHookInstance
{
  // Ya no necesitamos lista fija - se aplicará a todos los objetos con campo createdBy
  // private readonly FILTERED_OBJECTS = [
  //   'company',
  //   'person',
  //   'opportunity',
  //   'note',
  //   'task',
  // ];

  constructor(
    private readonly userRoleService: UserRoleService,
    private readonly apiKeyRoleService: ApiKeyRoleService,
    private readonly workspaceMetadataCacheService: WorkspaceMetadataCacheService,
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {}

  /**
   * Detecta si una consulta es de validación de duplicados
   * Las validaciones de duplicados usan filtros OR con campos como domainName
   */
  private isDuplicateValidation(filter: Record<string, unknown>): boolean {
    if (!filter.or || !Array.isArray(filter.or)) {
      return false;
    }

    // Buscar patrones típicos de validación de duplicados
    return filter.or.some((condition: Record<string, unknown>) => {
      // Companies usan domainName, Persons usan emails
      return condition.domainName || condition.emailsPrimaryEmail;
    });
  }

  async execute(
    authContext: AuthContext,
    objectName: string,
    payload: FindManyResolverArgs,
  ): Promise<FindManyResolverArgs> {
    // Validar que tenemos el workspace y O userWorkspaceId O apiKeyId
    if (
      !authContext.workspace?.id ||
      (!authContext.userWorkspaceId && !authContext.apiKey?.id)
    ) {
      return payload;
    }

    // NO afectar validaciones de duplicados
    if (payload.filter?.or && this.isDuplicateValidation(payload.filter)) {
      return payload;
    }

    // Verificar si el objeto tiene el campo createdBy usando los metadatos
    const { objectMetadataMaps } =
      await this.workspaceMetadataCacheService.getExistingOrRecomputeMetadataMaps(
        {
          workspaceId: authContext.workspace.id,
        },
      );

    const objectMetadata = getObjectMetadataMapItemByNameSingular(
      objectMetadataMaps,
      objectName,
    );

    // Solo aplicar filtro a objetos que tengan el campo createdBy
    if (!isDefined(objectMetadata?.fieldIdByName['createdBy'])) {
      return payload;
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
        return payload;
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
      return payload;
    }

    // Solo aplicar filtro a roles "Comercial"
    if (userRole && userRole.label === 'Comercial') {
      // Crear filtro con OR para ambos casos
      let ownerFilter;

      if (authContext.userWorkspaceId) {
        // Caso 1: Usuario CRM - Filtrar por workspaceMemberId y nombre
        // Obtener el workspaceMember usando TwentyORM
        const workspaceMemberRepository =
          await this.twentyORMGlobalManager.getRepositoryForWorkspace(
            authContext.workspace.id,
            'workspaceMember',
          );

        const workspaceMember = await workspaceMemberRepository.findOne({
          where: {
            userId: authContext.user?.id,
          },
        });

        if (!workspaceMember) {
          return payload;
        }

        // Obtener firstName y lastName del workspaceMember
        const firstName = workspaceMember.name?.firstName || '';
        const lastName = workspaceMember.name?.lastName || '';
        const userFullName = `${firstName} ${lastName}`.trim();

        // Filtro OR: por workspaceMemberId (registros CRM) O por nombre (registros API)
        ownerFilter = {
          or: [
            // Opción A: Filtrar por workspaceMemberId (registros desde CRM)
            {
              createdBy: {
                workspaceMemberId: {
                  eq: workspaceMember.id,
                },
              },
            },
            // Opción B: Filtrar por nombre (registros desde API con o sin workspaceMemberId)
            {
              createdBy: {
                name: {
                  eq: userFullName,
                },
              },
            },
          ],
        };
      } else if (authContext.apiKey?.id && authContext.apiKey?.name) {
        // Caso 2: API Key - Filtrar por nombre con normalización
        const apiKeyName = authContext.apiKey.name;

        const uniqueVariants = [
          apiKeyName,
          apiKeyName.normalize('NFC'),
          apiKeyName.normalize('NFD'),
          apiKeyName.normalize('NFKC'),
          apiKeyName.normalize('NFKD'),
        ].filter((variant, index, arr) => arr.indexOf(variant) === index);

        ownerFilter = {
          createdBy: {
            name: {
              in: uniqueVariants,
            },
          },
        };
      } else {
        return payload;
      }

      // Si ya hay filtros, combinarlos con AND
      if (payload.filter) {
        payload.filter = {
          and: [payload.filter, ownerFilter],
        };
      } else {
        payload.filter = ownerFilter;
      }
    }

    return payload;
  }
}
