import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type FindOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { getObjectMetadataMapItemByNameSingular } from 'src/engine/metadata-modules/utils/get-object-metadata-map-item-by-name-singular.util';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/api-key-role.service';
import { WorkspaceMetadataCacheService } from 'src/engine/metadata-modules/workspace-metadata-cache/services/workspace-metadata-cache.service';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';

// Hook para TODOS los objetos con patrón wildcard
@WorkspaceQueryHook(`*.findOne`)
@Injectable()
export class SalesFilterFindOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly userRoleService: UserRoleService,
    private readonly apiKeyRoleService: ApiKeyRoleService,
    private readonly workspaceMetadataCacheService: WorkspaceMetadataCacheService,
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {}

  async execute(
    authContext: AuthContext,
    objectName: string,
    payload: FindOneResolverArgs,
  ): Promise<FindOneResolverArgs> {
    // Validar que tenemos el workspace y O userWorkspaceId O apiKeyId
    if (
      !authContext.workspace?.id ||
      (!authContext.userWorkspaceId && !authContext.apiKey?.id)
    ) {
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

    // Solo aplicar filtro a roles "Comercial" o similares
    // Ajusta el nombre del rol según tu configuración
    if (userRole && userRole.label === 'Comercial') {
      console.log(
        `🔍 SALES FILTER DEBUG FIND-ONE - Aplicando filtro findOne para rol Comercial`,
      );

      // Crear filtro simple y robusto
      let ownerFilter;

      if (authContext.userWorkspaceId) {
        // Caso 1: Usuario CRM - Buscar el workspaceMember.id correcto
        console.log(
          '🔍 SALES FILTER DEBUG FIND-ONE - Usuario CRM, buscando workspaceMember',
        );

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
          console.log(
            '🔍 SALES FILTER DEBUG FIND-ONE - No se encontró workspaceMember para el usuario',
          );

          return payload;
        }

        console.log(
          '🔍 SALES FILTER DEBUG FIND-ONE - WorkspaceMember encontrado:',
          workspaceMember.id,
        );

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

        console.log(
          '🔍 SALES FILTER DEBUG FIND-ONE - API Key con nombre:',
          apiKeyName,
        );

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

        console.log(
          '🔍 SALES FILTER DEBUG FIND-ONE - Variantes de normalización:',
          uniqueVariants,
        );
      } else {
        console.log(
          '🔍 SALES FILTER DEBUG FIND-ONE - No hay userWorkspaceId ni API Key válida',
        );

        return payload;
      }

      console.log(
        '🔍 SALES FILTER DEBUG FIND-ONE - ownerFilter aplicado:',
        JSON.stringify(ownerFilter, null, 2),
      );

      // Si ya hay filtros, combinarlos con AND
      if (payload.filter) {
        payload.filter = {
          and: [payload.filter, ownerFilter],
        };
      } else {
        payload.filter = ownerFilter;
      }

      console.log(
        `🔍 SALES FILTER DEBUG FIND-ONE - Filtro final findOne aplicado:`,
        JSON.stringify(payload.filter, null, 2),
      );
    }

    return payload;
  }
}
