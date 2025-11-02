import { jsonSchema } from 'ai';
import { type JSONSchema7Definition } from 'json-schema';

import { type ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { convertObjectMetadataToSchemaProperties } from 'src/engine/utils/convert-object-metadata-to-schema-properties.util';

const createToolSchema = (
  inputProperties: Record<string, JSONSchema7Definition>,
  inputDescription: string,
  required?: string[],
) => {
  return jsonSchema({
    type: 'object',
    properties: {
      loadingMessage: {
        type: 'string',
        description:
          'A clear, human-readable description of the action being performed. Explain what operation you are executing and with what parameters in natural language.',
      },
      input: {
        type: 'object',
        description: inputDescription,
        properties: inputProperties,
        ...(required && { required }),
      },
    },
  });
};

export const generateUpdateRecordInputSchema = (
  objectMetadata: ObjectMetadataEntity,
) => {
  const schemaProperties = convertObjectMetadataToSchemaProperties({
    item: objectMetadata,
    forResponse: false,
  });

  // Add the id field as required for updates
  const updateProperties: Record<string, JSONSchema7Definition> = {
    id: {
      type: 'string',
      format: 'uuid',
      description:
        'The unique identifier (UUID) of the record to update. This is required to identify which record should be modified.',
    },
    ...schemaProperties,
  };

  const fieldNames = Object.keys(schemaProperties).join(', ');
  const inputDescription = `Update an existing ${objectMetadata.nameSingular} record. Provide the id (required) to identify which record to update, and any fields you want to modify. Available fields to update: ${fieldNames}`;

  return createToolSchema(updateProperties, inputDescription, ['id']);
};
