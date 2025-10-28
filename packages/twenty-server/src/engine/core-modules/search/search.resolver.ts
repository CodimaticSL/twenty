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
import { User } from 'src/engine/core-modules/user/user.entity';
import { Workspace } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { UserRoleService } from 'src/engine/metadata-modules/user-role/user-role.service';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';

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
    @AuthWorkspace() workspace: Workspace,
    @AuthUser({ allowUndefined: true }) user: User | undefined,
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
    console.log('🔍 SEARCH DEBUG - Iniciando búsqueda con filtro de comercial');
    console.log('🔍 SEARCH DEBUG - User:', user?.firstName, user?.lastName);
    console.log('🔍 SEARCH DEBUG - UserWorkspace ID:', userWorkspaceId);
    console.log(
      '🔍 SEARCH DEBUG - Filter original:',
      JSON.stringify(filter, null, 2),
    );

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

        console.log('🔍 SEARCH DEBUG - Rol de usuario:', userRole);

        // Si es comercial, aplicar filtro de propiedad
        if (userRole && userRole.label === 'Comercial') {
          console.log(
            '🔍 SEARCH DEBUG - Aplicando filtro de comercial a búsqueda',
          );

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
            const firstName = workspaceMember.name?.firstName || '';
            const lastName = workspaceMember.name?.lastName || '';
            const userFullName = `${firstName} ${lastName}`.trim();

            console.log(
              '🔍 SEARCH DEBUG - Nombre completo para filtro:',
              userFullName,
            );
            console.log(
              '🔍 SEARCH DEBUG - WorkspaceMember ID:',
              workspaceMember.id,
            );

            // Crear filtro de comercial para búsqueda
            const commercialFilter: ObjectRecordFilter = {
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

            // Combinar con filtro existente
            if (enhancedFilter) {
              enhancedFilter = {
                and: [enhancedFilter, commercialFilter],
              };
            } else {
              enhancedFilter = commercialFilter;
            }

            console.log(
              '🔍 SEARCH DEBUG - Filtro final aplicado:',
              JSON.stringify(enhancedFilter, null, 2),
            );
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
