import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type FindManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type AuthContext } from 'src/engine/core-modules/auth/types/auth-context.type';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { ApiKeyRoleService } from 'src/engine/core-modules/api-key/api-key-role.service';
import { PermissionFlagType } from 'src/engine/metadata-modules/permissions/constants/permission-flag-type.constants';
import { getObjectMetadataMapItemByNameSingular } from 'src/engine/metadata-modules/utils/get-object-metadata-map-item-by-name-singular.util';
import { WorkspaceMetadataCacheService } from 'src/engine/metadata-modules/workspace-metadata-cache/services/workspace-metadata-cache.service';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';

// Hook para TODOS los objetos con patrón wildcard (GraphQL)
@WorkspaceQueryHook({
  key: `*.findMany`,
  type: WorkspaceQueryHookType.PRE_HOOK,
})
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
  ) {
    console.log('🔍 SalesFilterFindManyPreQueryHook constructor executed');
  }

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

    // Verificar si el objeto tiene los campos relevantes para el filtrado
    const hasCreatedBy = isDefined(objectMetadata?.fieldIdByName['createdBy']);
    const hasResponsable = isDefined(
      objectMetadata?.fieldIdByName['responsable'],
    );

    // Análisis de campos para filtrado - sin logs

    // Solo aplicar filtro a objetos que tengan createdBy o responsable
    if (!hasCreatedBy && !hasResponsable) {
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

    // Solo aplicar filtro a roles con el permission flag VIEW_ONLY_OWN_OR_ASSIGNED_RECORDS
    const shouldApplySalesFilter =
      userRole?.permissionFlags?.some(
        (permissionFlag) =>
          permissionFlag.flag ===
          PermissionFlagType.VIEW_ONLY_OWN_OR_ASSIGNED_RECORDS,
      ) ?? false;

    if (shouldApplySalesFilter) {
      // Obtener información del usuario actual
      let workspaceMember = null;
      let userFullName = null;

      if (authContext.userWorkspaceId) {
        // Caso 1: Usuario CRM - Obtener el workspaceMember
        const workspaceMemberRepository =
          await this.twentyORMGlobalManager.getRepositoryForWorkspace(
            authContext.workspace.id,
            'workspaceMember',
          );

        workspaceMember = await workspaceMemberRepository.findOne({
          where: {
            userId: authContext.user?.id,
          },
        });

        if (!workspaceMember) {
          return payload;
        }

        const firstName = workspaceMember.name?.firstName || '';
        const lastName = workspaceMember.name?.lastName || '';

        userFullName = `${firstName} ${lastName}`.trim();
      } else if (authContext.apiKey?.id && authContext.apiKey?.name) {
        // Caso 2: API Key
        userFullName = authContext.apiKey.name;
      } else {
        return payload;
      }

      // Crear filtro combinado según la lógica de prioridad
      const combinedFilter = this.buildCombinedFilter(
        hasCreatedBy,
        hasResponsable,
        workspaceMember,
        userFullName,
        authContext,
      );

      if (!combinedFilter) {
        return payload;
      }

      // Si ya hay filtros, combinarlos con AND
      if (payload.filter && Object.keys(payload.filter).length > 0) {
        payload.filter = {
          and: [payload.filter, combinedFilter],
        };
      } else {
        payload.filter = combinedFilter;
      }
    }

    return payload;
  }

  /**
   * Construye el filtro combinado con lógica de fallback:
   * - Si existe createdBy y responsable: filtrar por responsable OR createdBy (fallback)
   * - Si solo existe createdBy: filtrar por createdBy
   * - Si no existe createdBy pero sí responsable: filtrar por responsable
   */
  private buildCombinedFilter(
    hasCreatedBy: boolean,
    hasResponsable: boolean,
    workspaceMember: Record<string, unknown> | null,
    userFullName: string,
    authContext: AuthContext,
  ): Record<string, unknown> | null {
    // Construyendo filtro combinado con fallback - sin logs

    // Caso 1: Ambos campos existen -> responsable con fallback a createdBy
    if (hasCreatedBy && hasResponsable) {
      return this.buildFallbackFilter(
        workspaceMember,
        userFullName,
        authContext,
      );
    }

    // Caso 2: Solo existe createdBy -> filtrar por createdBy
    if (hasCreatedBy && !hasResponsable) {
      return this.buildCreatedByFilter(
        workspaceMember,
        userFullName,
        authContext,
      );
    }

    // Caso 3: No existe createdBy pero sí responsable -> filtrar por responsable
    if (!hasCreatedBy && hasResponsable) {
      return this.buildResponsableFilter(
        workspaceMember,
        userFullName,
        authContext,
      );
    }

    // Caso 4: Ninguno de los dos existe (no debería llegar aquí por la validación previa)
    return null;
  }

  /**
   * Construye filtro con la lógica exacta solicitada:
   * (responsableId != null && responsableId != "" && responsableId = workspaceMember.id)
   * || (responsableId = null && (createdBy.workspaceMemberId = workspaceMember.id || createdBy.name = userFullName))
   */
  private buildFallbackFilter(
    workspaceMember: Record<string, unknown> | null,
    userFullName: string,
    authContext: AuthContext,
  ): Record<string, unknown> {
    if (authContext.userWorkspaceId && workspaceMember) {
      // Usuario CRM - implementar la lógica exacta solicitada
      return {
        or: [
          // Condición 1: responsableId != null && responsableId != "" && responsableId = workspaceMember.id
          {
            and: [
              {
                responsableId: {
                  is: 'NOT_NULL',
                },
              },
              {
                responsableId: {
                  is: 'NOT_EMPTY',
                },
              },
              {
                responsableId: {
                  eq: workspaceMember.id,
                },
              },
            ],
          },
          // Condición 2: responsableId = null && (createdBy.workspaceMemberId = workspaceMember.id || createdBy.name = userFullName)
          {
            and: [
              {
                responsableId: {
                  is: 'NULL',
                },
              },
              {
                or: [
                  {
                    createdBy: {
                      workspaceMemberId: {
                        eq: workspaceMember.id,
                      },
                    },
                  },
                  {
                    createdBy: {
                      name: {
                        eq: userFullName,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      };
    } else if (authContext.apiKey?.id && authContext.apiKey?.name) {
      // API Key - fallback más complejo, por ahora solo por nombre en createdBy
      return this.buildCreatedByFilter(
        workspaceMember,
        userFullName,
        authContext,
      );
    }

    return {} as Record<string, unknown>;
  }

  /**
   * Construye filtro para el campo responsable
   */
  private buildResponsableFilter(
    workspaceMember: Record<string, unknown> | null,
    userFullName: string,
    authContext: AuthContext,
  ): Record<string, unknown> {
    if (authContext.userWorkspaceId && workspaceMember) {
      // Usuario CRM - filtrar por ID directo de la relación usando operador 'eq'
      return {
        responsableId: {
          eq: workspaceMember.id,
        },
      };
    } else if (authContext.apiKey?.id && authContext.apiKey?.name) {
      // API Key - para relaciones directas, necesitamos buscar por nombre del workspaceMember
      // Esto es más complejo ya que no podemos filtrar directamente por nombre en relaciones
      // Por ahora, retornamos un filtro vacío para API Keys con relaciones
      return {} as Record<string, unknown>;
    }

    return {} as Record<string, unknown>;
  }

  /**
   * Construye filtro para el campo createdBy (lógica existente)
   */
  private buildCreatedByFilter(
    workspaceMember: Record<string, unknown> | null,
    userFullName: string,
    authContext: AuthContext,
  ): Record<string, unknown> {
    if (authContext.userWorkspaceId && workspaceMember) {
      // Usuario CRM - filtro OR: workspaceMemberId o nombre
      return {
        or: [
          {
            createdBy: {
              workspaceMemberId: {
                eq: workspaceMember.id,
              },
            },
          },
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
      // API Key - filtrar por nombre con normalización
      const apiKeyName = authContext.apiKey.name;

      const uniqueVariants = [
        apiKeyName,
        apiKeyName.normalize('NFC'),
        apiKeyName.normalize('NFD'),
        apiKeyName.normalize('NFKC'),
        apiKeyName.normalize('NFKD'),
      ].filter((variant, index, arr) => arr.indexOf(variant) === index);

      return {
        createdBy: {
          name: {
            in: uniqueVariants,
          },
        },
      };
    }

    return {} as Record<string, unknown>;
  }
}
