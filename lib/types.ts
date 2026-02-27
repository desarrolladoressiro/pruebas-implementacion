export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type TargetEnvironment = 'homologacion' | 'produccion';

export type RunStatus =
  | 'created'
  | 'queued'
  | 'running'
  | 'waiting_webhook'
  | 'waiting_manual_action'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'manual_wait'
  | 'awaiting_external_event';

export interface TestDefinition {
  id?: string;
  key: string;
  domain: 'api_siro_pagos' | 'api_siro';
  name: string;
  description: string;
  executor_code: string;
  enabled: boolean;
  default_input: JsonObject;
}
