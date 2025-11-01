import {
  type CreateRecordExecutionContext,
  type RecordCrudExecutionContext,
} from './execution-context.type';
import { type CreateRecordInput } from './record-crud-input.type';

export type CreateRecordParams = CreateRecordInput &
  Omit<CreateRecordExecutionContext, 'upsert'> & {
    upsert?: never;
    // Preservar campos personalizados de NodiaFlow
    roleId?: string;
    apiKeyName?: string;
  };

export type CreateRecordParamsWithContext = CreateRecordInput &
  RecordCrudExecutionContext;
