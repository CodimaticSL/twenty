import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'class-validator';
import { canObjectBeManagedByWorkflow } from 'twenty-shared/workflow';

import {
  RecordCrudException,
  RecordCrudExceptionCode,
} from 'src/engine/core-modules/record-crud/exceptions/record-crud.exception';
import { type CreateRecordParams } from 'src/engine/core-modules/record-crud/types/create-record-params.type';
import { getSelectedColumnsFromRestrictedFields } from 'src/engine/core-modules/record-crud/utils/get-selected-columns-from-restricted-fields.util';
import { RecordPositionService } from 'src/engine/core-modules/record-position/services/record-position.service';
import { RecordInputTransformerService } from 'src/engine/core-modules/record-transformer/services/record-input-transformer.service';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { FieldActorSource } from 'src/engine/metadata-modules/field-metadata/composite-types/actor.composite-type';
import { TwentyORMGlobalManager } from 'src/engine/twenty-orm/twenty-orm-global.manager';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';

@Injectable()
// eslint-disable-next-line @nx/workspace-inject-workspace-repository
export class CreateRecordService {
  private readonly logger = new Logger(CreateRecordService.name);

  constructor(
    private readonly twentyORMGlobalManager: TwentyORMGlobalManager,
    private readonly recordPositionService: RecordPositionService,
    private readonly recordInputTransformerService: RecordInputTransformerService,
    private readonly workflowCommonWorkspaceService: WorkflowCommonWorkspaceService,
  ) {}

  async execute(params: CreateRecordParams): Promise<ToolOutput> {
    const {
      objectName,
      objectRecord,
      workspaceId,
      roleId,
      apiKeyName,
      rolePermissionConfig,
    } = params;

    if (!workspaceId) {
      return {
        success: false,
        message: 'Failed to create record: Workspace ID is required',
        error: 'Workspace ID not found',
      };
    }

    try {
      const repository =
        await this.twentyORMGlobalManager.getRepositoryForWorkspace(
          workspaceId,
          objectName,
          rolePermissionConfig,
        );

      const { objectMetadataItemWithFieldsMaps } =
        await this.workflowCommonWorkspaceService.getObjectMetadataItemWithFieldsMaps(
          objectName,
          workspaceId,
        );

      // Solo validar para workflows (sin roleId), no para agents/API (con roleId)
      if (
        !roleId &&
        !canObjectBeManagedByWorkflow({
          nameSingular: objectMetadataItemWithFieldsMaps.nameSingular,
          isSystem: objectMetadataItemWithFieldsMaps.isSystem,
        })
      ) {
        throw new RecordCrudException(
          'Failed to create: Object cannot be created by workflow',
          RecordCrudExceptionCode.INVALID_REQUEST,
        );
      }

      // Solo agregar position si el objeto tiene ese campo
      const hasPositionField = isDefined(
        objectMetadataItemWithFieldsMaps.fieldIdByName.position,
      );

      const position = hasPositionField
        ? await this.recordPositionService.buildRecordPosition({
            value: 'first',
            objectMetadata: objectMetadataItemWithFieldsMaps,
            workspaceId,
          })
        : undefined;

      // Solo agregar createdBy si el objeto tiene ese campo
      const hasCreatedByField = isDefined(
        objectMetadataItemWithFieldsMaps.fieldIdByName.createdBy,
      );

      // Mapear campos con sufijo 'Id' a nombres de relación
      // Ej: taskId -> task, companyId -> company
      const mappedObjectRecord = Object.fromEntries(
        Object.entries(objectRecord).map(([key, value]) => {
          // Si el campo termina en 'Id' y no existe en el metadata
          if (
            key.endsWith('Id') &&
            !isDefined(objectMetadataItemWithFieldsMaps.fieldIdByName[key])
          ) {
            // Intentar con el nombre sin 'Id'
            const fieldNameWithoutId = key.slice(0, -2);

            if (
              isDefined(
                objectMetadataItemWithFieldsMaps.fieldIdByName[
                  fieldNameWithoutId
                ],
              )
            ) {
              return [fieldNameWithoutId, { id: value }];
            }
          }

          return [key, value];
        }),
      );

      const validObjectRecord = Object.fromEntries(
        Object.entries(mappedObjectRecord).filter(([key]) =>
          isDefined(objectMetadataItemWithFieldsMaps.fieldIdByName[key]),
        ),
      );

      const transformedObjectRecord =
        await this.recordInputTransformerService.process({
          recordInput: validObjectRecord,
          objectMetadataMapItem: objectMetadataItemWithFieldsMaps,
        });

      const restrictedFields =
        repository.objectRecordsPermissions?.[
          objectMetadataItemWithFieldsMaps.id
        ]?.restrictedFields;

      const selectedColumns = getSelectedColumnsFromRestrictedFields(
        restrictedFields,
        objectMetadataItemWithFieldsMaps,
      );

      const recordToInsert = {
        ...transformedObjectRecord,
        ...(hasPositionField && position !== undefined ? { position } : {}),
        ...(hasCreatedByField
          ? {
              createdBy: params.createdBy ?? {
                source: roleId
                  ? FieldActorSource.API
                  : FieldActorSource.WORKFLOW,
                name: roleId ? apiKeyName || 'API' : 'Workflow',
              },
            }
          : {}),
      };

      const insertResult = await repository.insert(
        recordToInsert,
        undefined,
        selectedColumns,
      );

      const [createdRecord] = insertResult.generatedMaps;

      this.logger.log(`Record created successfully in ${objectName}`);

      return {
        success: true,
        message: `Record created successfully in ${objectName}`,
        result: createdRecord,
      };
    } catch (error) {
      if (error instanceof RecordCrudException) {
        return {
          success: false,
          message: `Failed to create record in ${objectName}`,
          error: error.message,
        };
      }

      this.logger.error(`Failed to create record: ${error}`);

      return {
        success: false,
        message: `Failed to create record in ${objectName}`,
        error:
          error instanceof Error ? error.message : 'Failed to create record',
      };
    }
  }
}
