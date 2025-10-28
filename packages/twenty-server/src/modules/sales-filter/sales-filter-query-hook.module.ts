import { Module } from '@nestjs/common';

import { SalesFilterFindManyPreQueryHook } from 'src/modules/sales-filter/sales-filter-find-many.pre-query.hook';
import { SalesFilterFindOnePreQueryHook } from 'src/modules/sales-filter/sales-filter-find-one.pre-query.hook';
import { SalesFilterFindManyPostQueryHook } from 'src/modules/sales-filter/sales-filter-find-many.post-query.hook';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { WorkspaceMetadataCacheModule } from 'src/engine/metadata-modules/workspace-metadata-cache/workspace-metadata-cache.module';
import { ApiKeyModule } from 'src/engine/core-modules/api-key/api-key.module';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';

@Module({
  imports: [UserRoleModule, ApiKeyModule, WorkspaceMetadataCacheModule, TwentyORMModule],
  providers: [
    SalesFilterFindManyPreQueryHook,
    SalesFilterFindOnePreQueryHook,
    SalesFilterFindManyPostQueryHook,
  ],
})
export class SalesFilterQueryHookModule {}