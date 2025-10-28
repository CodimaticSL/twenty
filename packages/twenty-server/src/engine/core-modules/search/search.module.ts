import { Module } from '@nestjs/common';

import { FileModule } from 'src/engine/core-modules/file/file.module';
import { SearchResolver } from 'src/engine/core-modules/search/search.resolver';
import { SearchService } from 'src/engine/core-modules/search/services/search.service';
import { WorkspaceCacheStorageModule } from 'src/engine/workspace-cache-storage/workspace-cache-storage.module';
import { UserRoleModule } from 'src/engine/metadata-modules/user-role/user-role.module';
import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';

@Module({
  imports: [
    FileModule,
    WorkspaceCacheStorageModule,
    UserRoleModule,
    TwentyORMModule,
  ],
  providers: [SearchResolver, SearchService],
})
export class SearchModule {}
