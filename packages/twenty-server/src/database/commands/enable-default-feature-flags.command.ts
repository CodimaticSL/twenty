import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command, Option } from 'nest-commander';
import { Repository } from 'typeorm';

import {
  ActiveOrSuspendedWorkspacesMigrationCommandRunner,
  type RunOnWorkspaceArgs,
} from 'src/database/commands/command-runners/active-or-suspended-workspaces-migration.command-runner';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { DEFAULT_FEATURE_FLAGS } from 'src/engine/workspace-manager/workspace-sync-metadata/constants/default-feature-flags';

@Command({
  name: 'workspace:enable-default-feature-flags',
  description:
    'Enable default feature flags for existing workspaces. This command updates all active and suspended workspaces with the feature flags defined in DEFAULT_FEATURE_FLAGS.',
})
export class EnableDefaultFeatureFlagsCommand extends ActiveOrSuspendedWorkspacesMigrationCommandRunner {
  protected readonly logger = new Logger(EnableDefaultFeatureFlagsCommand.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    protected readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly featureFlagService: FeatureFlagService,
    protected readonly twentyORMGlobalManager: TwentyORMGlobalManager,
  ) {
    super(workspaceRepository, twentyORMGlobalManager);
  }

  async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    const { workspaceId, options } = args;

    this.logger.log(
      `Enabling default feature flags for workspace ${workspaceId}...`,
    );

    if (DEFAULT_FEATURE_FLAGS.length === 0) {
      this.logger.warn(
        `No default feature flags defined. Skipping workspace ${workspaceId}.`,
      );

      return;
    }

    if (options.dryRun) {
      this.logger.log(
        `[DRY RUN] Would enable the following flags for workspace ${workspaceId}:`,
      );
      DEFAULT_FEATURE_FLAGS.forEach((flag) => {
        this.logger.log(`  - ${flag}`);
      });

      return;
    }

    try {
      await this.featureFlagService.enableFeatureFlags(
        DEFAULT_FEATURE_FLAGS,
        workspaceId,
      );

      this.logger.log(
        `Successfully enabled ${DEFAULT_FEATURE_FLAGS.length} feature flags for workspace ${workspaceId}`,
      );
      DEFAULT_FEATURE_FLAGS.forEach((flag) => {
        this.logger.log(`  ✓ ${flag}`);
      });
    } catch (error) {
      this.logger.error(
        `Failed to enable feature flags for workspace ${workspaceId}: ${error.message}`,
      );
      throw error;
    }
  }
}
