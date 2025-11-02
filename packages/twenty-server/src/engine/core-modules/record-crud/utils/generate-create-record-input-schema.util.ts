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

export const generateCreateRecordInputSchema = (
  objectMetadata: ObjectMetadataEntity,
) => {
  const inputDescription = `Provide the data to create a new ${objectMetadata.namePlural} record. Include all required fields and any optional fields you want to set. Available fields: ${Object.keys(convertObjectMetadataToSchemaProperties({ item: objectMetadata, forResponse: false })).join(', ')}`;

  return createToolSchema(
    convertObjectMetadataToSchemaProperties({
      item: objectMetadata,
      forResponse: false,
    }),
    inputDescription,
  );
};
