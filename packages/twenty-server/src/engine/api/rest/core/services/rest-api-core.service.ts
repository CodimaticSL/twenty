import { BadRequestException, Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { RestApiCreateManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-create-many.handler';
import { RestApiCreateOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-create-one.handler';
import { RestApiDeleteManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-delete-many.handler';
import { RestApiDeleteOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-delete-one.handler';
import { RestApiDestroyManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-destroy-many.handler';
import { RestApiDestroyOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-destroy-one.handler';
import { RestApiFindDuplicatesHandler } from 'src/engine/api/rest/core/handlers/rest-api-find-duplicates.handler';
import { RestApiFindManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-find-many.handler';
import { RestApiFindOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-find-one.handler';
import { RestApiGroupByHandler } from 'src/engine/api/rest/core/handlers/rest-api-group-by.handler';
import { RestApiMergeManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-merge-many.handler';
import { RestApiRestoreManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-restore-many.handler';
import { RestApiRestoreOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-restore-one.handler';
import { RestApiUpdateManyHandler } from 'src/engine/api/rest/core/handlers/rest-api-update-many.handler';
import { RestApiUpdateOneHandler } from 'src/engine/api/rest/core/handlers/rest-api-update-one.handler';
import { parseCorePath } from 'src/engine/api/rest/core/query-builder/utils/path-parsers/parse-core-path.utils';
import { parseSoftDeleteRestRequest } from 'src/engine/api/rest/input-request-parsers/soft-delete-parser-utils/parse-soft-delete-rest-request.util';
import { AuthenticatedRequest } from 'src/engine/api/rest/types/authenticated-request';
import { FeatureFlagKey } from 'src/engine/core-modules/feature-flag/enums/feature-flag-key.enum';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';

@Injectable()
export class RestApiCoreService {
  constructor(
    private readonly restApiCreateOneHandler: RestApiCreateOneHandler,
    private readonly restApiCreateManyHandler: RestApiCreateManyHandler,
    private readonly restApiUpdateOneHandler: RestApiUpdateOneHandler,
    private readonly restApiUpdateManyHandler: RestApiUpdateManyHandler,
    private readonly restApiFindOneHandler: RestApiFindOneHandler,
    private readonly restApiFindManyHandler: RestApiFindManyHandler,
    private readonly restApiFindDuplicatesHandler: RestApiFindDuplicatesHandler,
    private readonly restApiGroupByHandler: RestApiGroupByHandler,
    private readonly restApiDestroyOneHandler: RestApiDestroyOneHandler,
    private readonly restApiDestroyManyHandler: RestApiDestroyManyHandler,
    private readonly restApiDeleteOneHandler: RestApiDeleteOneHandler,
    private readonly restApiDeleteManyHandler: RestApiDeleteManyHandler,
    private readonly restApiRestoreOneHandler: RestApiRestoreOneHandler,
    private readonly restApiRestoreManyHandler: RestApiRestoreManyHandler,
    private readonly restApiMergeManyHandler: RestApiMergeManyHandler,
    private readonly featureFlagService: FeatureFlagService,
  ) {}

  async createOne(request: AuthenticatedRequest) {
    return await this.restApiCreateOneHandler.commonHandle(request);
  }

  async createMany(request: AuthenticatedRequest) {
    return await this.restApiCreateManyHandler.commonHandle(request);
  }

  async findDuplicates(request: AuthenticatedRequest) {
    return await this.restApiFindDuplicatesHandler.commonHandle(request);
  }

  async update(request: AuthenticatedRequest) {
    const { id: recordId } = parseCorePath(request);

    if (isDefined(recordId)) {
      return await this.restApiUpdateOneHandler.commonHandle(request);
    } else {
      return await this.restApiUpdateManyHandler.handle(request);
    }
  }

  async get(request: AuthenticatedRequest) {
    const { id: recordId } = parseCorePath(request);

    if (isDefined(recordId)) {
      return await this.restApiFindOneHandler.commonHandle(request);
    } else {
      return await this.restApiFindManyHandler.commonHandle(request);
    }
  }

  async groupBy(request: AuthenticatedRequest) {
    return await this.restApiGroupByHandler.handle(request);
  }

  async delete(request: AuthenticatedRequest) {
    const { id: recordId } = parseCorePath(request);
    const isSoftDelete = parseSoftDeleteRestRequest(request);

    if (!isSoftDelete && isDefined(recordId))
      return await this.restApiDestroyOneHandler.commonHandle(request);
    if (!isSoftDelete && !isDefined(recordId))
      return await this.restApiDestroyManyHandler.handle(request);

    if (isSoftDelete && isDefined(recordId))
      return await this.restApiDeleteOneHandler.handle(request);
    if (isSoftDelete && !isDefined(recordId))
      return await this.restApiDeleteManyHandler.handle(request);
  }

  async restore(request: AuthenticatedRequest) {
    const { id: recordId } = parseCorePath(request);

    if (isDefined(recordId)) {
      return await this.restApiRestoreOneHandler.handle(request);
    } else {
      return await this.restApiRestoreManyHandler.handle(request);
    }
  }

  async mergeMany(request: AuthenticatedRequest) {
    return await this.restApiMergeManyHandler.handle(request);
  }
}
