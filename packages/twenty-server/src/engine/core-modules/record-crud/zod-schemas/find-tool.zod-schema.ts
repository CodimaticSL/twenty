import { jsonSchema } from 'ai';
import { type JSONSchema7Definition } from 'json-schema';
import { FieldMetadataType } from 'twenty-shared/types';

import { type FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { shouldExcludeFieldFromAgentToolSchema } from 'src/engine/metadata-modules/field-metadata/utils/should-exclude-field-from-agent-tool-schema.util';
import { type ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';

const generateFieldFilterJsonSchema = (
  field: FieldMetadataEntity,
): JSONSchema7Definition | null => {
  switch (field.type) {
    case FieldMetadataType.UUID:
      return {
        type: 'object',
        description: `Filter by ${field.name} (UUID field)`,
        properties: {
          eq: {
            type: 'string',
            format: 'uuid',
            description: 'Equals',
          },
          neq: {
            type: 'string',
            format: 'uuid',
            description: 'Not equals',
          },
          in: {
            type: 'array',
            items: {
              type: 'string',
              format: 'uuid',
            },
            description: 'In array of values',
          },
          is: {
            type: 'string',
            enum: ['NULL', 'NOT_NULL'],
            description: 'Is null or not null',
          },
        },
      };

    case FieldMetadataType.TEXT:
    case FieldMetadataType.RICH_TEXT:
    case FieldMetadataType.RICH_TEXT_V2:
      return {
        type: 'object',
        description: `Filter by ${field.name} (text field)`,
        properties: {
          eq: {
            type: 'string',
            description: 'Equals',
          },
          neq: {
            type: 'string',
            description: 'Not equals',
          },
          in: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'In array of values',
          },
          like: {
            type: 'string',
            description: 'Case-sensitive pattern match (use % for wildcards)',
          },
          ilike: {
            type: 'string',
            description: 'Case-insensitive pattern match (use % for wildcards)',
          },
          startsWith: {
            type: 'string',
            description: 'Starts with',
          },
          is: {
            type: 'string',
            enum: ['NULL', 'NOT_NULL'],
            description: 'Is null or not null',
          },
        },
      };

    case FieldMetadataType.NUMBER:
    case FieldMetadataType.NUMERIC:
    case FieldMetadataType.POSITION:
      return {
        type: 'object',
        description: `Filter by ${field.name} (number field)`,
        properties: {
          eq: {
            type: 'number',
            description: 'Equals',
          },
          gt: {
            type: 'number',
            description: 'Greater than',
          },
          gte: {
            type: 'number',
            description: 'Greater than or equal',
          },
          lt: {
            type: 'number',
            description: 'Less than',
          },
          lte: {
            type: 'number',
            description: 'Less than or equal',
          },
          is: {
            type: 'string',
            enum: ['NULL', 'NOT_NULL'],
            description: 'Is null or not null',
          },
        },
      };

    case FieldMetadataType.BOOLEAN:
      return {
        type: 'object',
        description: `Filter by ${field.name} (boolean field)`,
        properties: {
          eq: {
            type: 'boolean',
            description: 'Equals',
          },
          is: {
            type: 'string',
            enum: ['NULL', 'NOT_NULL'],
            description: 'Is null or not null',
          },
        },
      };

    case FieldMetadataType.DATE:
    case FieldMetadataType.DATE_TIME:
      return {
        type: 'object',
        description: `Filter by ${field.name} (date/time field)`,
        properties: {
          eq: {
            type: 'string',
            format: 'date-time',
            description: 'Equals',
          },
          gt: {
            type: 'string',
            format: 'date-time',
            description: 'After',
          },
          gte: {
            type: 'string',
            format: 'date-time',
            description: 'On or after',
          },
          lt: {
            type: 'string',
            format: 'date-time',
            description: 'Before',
          },
          lte: {
            type: 'string',
            format: 'date-time',
            description: 'On or before',
          },
          is: {
            type: 'string',
            enum: ['NULL', 'NOT_NULL'],
            description: 'Is null or not null',
          },
        },
      };

    default:
      return null;
  }
};

const createToolSchema = (
  inputProperties: Record<string, JSONSchema7Definition>,
  inputDescription: string,
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
      },
    },
  });
};

export const generateFindToolInputSchema = (
  objectMetadata: ObjectMetadataEntity,
) => {
  const schemaProperties: Record<string, JSONSchema7Definition> = {
    limit: {
      type: 'number',
      description: 'Maximum number of records to return (default: 100)',
      default: 100,
    },
    offset: {
      type: 'number',
      description: 'Number of records to skip (default: 0)',
      default: 0,
    },
    orderBy: {
      type: 'array',
      description:
        'Sort records by field(s). CRITICAL for "top N", "largest", "smallest" queries. Each item is an object with exactly ONE property: field name as key, sort direction as value. Example: [{"employees": "DescNullsLast"}] sorts employees descending. Use "DescNullsLast" for top/largest, "AscNullsFirst" for bottom/smallest.',
      items: {
        type: 'object',
      },
    },
  };

  objectMetadata.fields.forEach((field: FieldMetadataEntity) => {
    if (shouldExcludeFieldFromAgentToolSchema(field)) {
      return;
    }

    const filterSchema = generateFieldFilterJsonSchema(field);

    if (filterSchema) {
      schemaProperties[field.name] = filterSchema;
    }
  });

  const filterableFields = Object.keys(schemaProperties)
    .filter((key) => !['limit', 'offset', 'orderBy'].includes(key))
    .join(', ');

  const inputDescription = `Search and filter ${objectMetadata.namePlural} records. Use 'limit' to control result count, 'offset' for pagination, and 'orderBy' for sorting. Filter by fields: ${filterableFields}. Leave empty to get first records.`;

  return createToolSchema(schemaProperties, inputDescription);
};
