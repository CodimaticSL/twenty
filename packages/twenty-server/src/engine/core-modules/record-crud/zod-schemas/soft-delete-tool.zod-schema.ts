import { jsonSchema } from 'ai';

export const SoftDeleteToolInputSchema = jsonSchema({
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
        'Soft delete a record by marking it as deleted without permanently removing it from the database. The record can be recovered later.',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: 'The unique UUID of the record to soft delete',
        },
      },
      required: ['id'],
    },
  },
});

export type SoftDeleteToolInput = {
  loadingMessage?: string;
  input: {
    id: string;
  };
};
