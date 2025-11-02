import { jsonSchema } from 'ai';

export const FindOneToolInputSchema = jsonSchema({
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
        'Retrieve a single record by its unique identifier (UUID). Provide the exact record ID to fetch.',
      properties: {
        id: {
          type: 'string',
          format: 'uuid',
          description: 'The unique UUID of the record to retrieve',
        },
      },
      required: ['id'],
    },
  },
});

export type FindOneToolInput = {
  loadingMessage?: string;
  input: {
    id: string;
  };
};
