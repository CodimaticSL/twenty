import { jsonSchema } from 'ai';

export const BulkDeleteToolInputSchema = jsonSchema({
  type: 'object',
  properties: {
    loadingMessage: {
      type: 'string',
      description:
        'A clear, human-readable description of the action being performed. Explain what operation you are executing and with what parameters in natural language.',
    },
    input: {
      type: 'object',
      description:
        'Soft delete multiple records at once by providing an array of record IDs. All specified records will be marked as deleted.',
      properties: {
        filter: {
          type: 'object',
          description: 'Filter criteria to select records for bulk delete',
          properties: {
            id: {
              type: 'object',
              description: 'Filter to select records to delete',
              properties: {
                in: {
                  type: 'array',
                  items: {
                    type: 'string',
                    format: 'uuid',
                  },
                  description: 'Array of record IDs to delete',
                },
              },
              required: ['in'],
            },
          },
          required: ['id'],
        },
      },
      required: ['filter'],
    },
  },
});

export type BulkDeleteToolInput = {
  loadingMessage?: string;
  input: {
    filter: {
      id: {
        in: string[];
      };
    };
  };
};
