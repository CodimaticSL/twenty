import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';

import { isDefined } from 'twenty-shared/utils';

import { type ObjectRecordFilter } from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';

import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { SearchArgs } from 'src/engine/core-modules/search/dtos/search-args';
import { SearchResultConnectionDTO } from 'src/engine/core-modules/search/dtos/search-result-connection.dto';
import { SearchApiExceptionFilter } from 'src/engine/core-modules/search/filters/search-api-exception.filter';
import { SearchService } from 'src/engine/core-modules/search/services/search.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { PermissionFlagType } from 'src/engine/metadata-modules/permissions/constants/permission-flag-type.constants';

@Resolver()
@UseFilters(SearchApiExceptionFilter, PreventNestToAutoLogGraphqlErrorsFilter)
@UsePipes(ResolverValidationPipe)
export class SearchResolver {
  constructor(
    private readonly searchService: SearchService,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly userRoleService: UserRoleService,
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {}

  @Query(() => SearchResultConnectionDTO)
  @UseGuards(WorkspaceAuthGuard)
  async search(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser({ allowUndefined: true }) user: UserEntity | undefined,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
    @Args()
    {
      searchInput,
      limit,
      filter,
      includedObjectNameSingulars,
      excludedObjectNameSingulars,
      after,
    }: SearchArgs,
  ) {
    // Aplicar filtro de comercial si corresponde
    let enhancedFilter: ObjectRecordFilter | undefined = filter;

    if (userWorkspaceId && user?.id) {
      // Obtener el rol del usuario
      const roleId = await this.userRoleService.getRoleIdForUserWorkspace({
        userWorkspaceId,
        workspaceId: workspace.id,
      });

      if (roleId) {
        const roles = await this.userRoleService.getRolesByUserWorkspaces({
          userWorkspaceIds: [userWorkspaceId],
          workspaceId: workspace.id,
        });

        const userRole = roles.get(userWorkspaceId)?.[0];

        // Solo aplicar filtro a roles con el permission flag VIEW_ONLY_OWN_OR_ASSIGNED_RECORDS
        const shouldApplySalesFilter =
          userRole?.permissionFlags?.some(
            (permissionFlag) =>
              permissionFlag.flag ===
              PermissionFlagType.VIEW_ONLY_OWN_OR_ASSIGNED_RECORDS,
          ) ?? false;

        if (shouldApplySalesFilter) {
          // Obtener el workspaceMember para el usuario
          const workspaceMemberRepository =
            await this.twentyORMGlobalManager.getRepositoryForWorkspace(
              workspace.id,
              'workspaceMember',
            );

          const workspaceMember = await workspaceMemberRepository.findOne({
            where: {
              userId: user.id,
            },
          });

          if (workspaceMember) {
            // Obtener el nombre completo del usuario para el filtro por nombre
            const firstName = workspaceMember.name?.firstName || '';
            const lastName = workspaceMember.name?.lastName || '';
            const userFullName = `${firstName} ${lastName}`.trim();

            // Aplicar la lógica exacta solicitada:
            // (responsableId != null && responsableId != "" && responsableId = workspaceMember.id)
            // || (responsableId = null && (createdBy.workspaceMemberId = workspaceMember.id || createdBy.name = userFullName))
            const commercialFilter: ObjectRecordFilter = {
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

            // Combinar con filtro existente
            if (enhancedFilter && Object.keys(enhancedFilter).length > 0) {
              enhancedFilter = {
                and: [enhancedFilter, commercialFilter],
              };
            } else {
              enhancedFilter = commercialFilter;
            }
          }
        }
      }
    }

    const objectMetadataMaps =
      await this.workspaceCacheStorageService.getObjectMetadataMapsOrThrow(
        workspace.id,
      );

    const filteredObjectMetadataItems =
      this.searchService.filterObjectMetadataItems({
        objectMetadataItemWithFieldMaps: Object.values(
          objectMetadataMaps.byId,
        ).filter(isDefined),
        includedObjectNameSingulars: includedObjectNameSingulars ?? [],
        excludedObjectNameSingulars: excludedObjectNameSingulars ?? [],
      });

    const allRecordsWithObjectMetadataItems =
      await this.searchService.getAllRecordsWithObjectMetadataItems({
        objectMetadataItemWithFieldMaps: filteredObjectMetadataItems,
        searchInput,
        limit,
        filter: enhancedFilter, // Usar el filtro modificado
        includedObjectNameSingulars,
        excludedObjectNameSingulars,
        after,
      });

    return this.searchService.computeSearchObjectResults({
      recordsWithObjectMetadataItems: allRecordsWithObjectMetadataItems,
      workspaceId: workspace.id,
      limit,
      after,
    });
  }
}
