import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { JsonObject, RunStatus, TargetEnvironment } from '@/lib/types';

export interface CreateRunInput {
  userId: string;
  testDefinitionKey: string;
  environment: TargetEnvironment;
  inputJson: JsonObject;
}

export async function getUserRole(userId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.role ?? 'operator';
}

export async function createRun(input: CreateRunInput) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: definition, error: definitionError } = await supabase
    .from('test_definitions')
    .select('id,key,executor_code,enabled')
    .eq('key', input.testDefinitionKey)
    .eq('enabled', true)
    .maybeSingle();

  if (definitionError || !definition) {
    throw new Error('Definicion de prueba inexistente o deshabilitada.');
  }

  const correlationId = `${input.testDefinitionKey}_${Date.now()}`;

  const { data: run, error: runError } = await supabase
    .from('runs')
    .insert({
      user_id: input.userId,
      test_definition_id: definition.id,
      test_definition_key: definition.key,
      environment: input.environment,
      status: 'queued',
      input_json: input.inputJson,
      correlation_id: correlationId
    })
    .select('id,status,test_definition_key,environment,created_at')
    .single();

  if (runError || !run) {
    throw new Error(`No se pudo crear run: ${runError?.message ?? 'unknown'}`);
  }

  await appendRunEvent({
    runId: run.id,
    level: 'info',
    message: 'Ejecucion en cola para iniciar',
    payload: {
      testDefinitionKey: definition.key,
      environment: input.environment
    }
  });

  return run;
}

export async function appendRunEvent({
  runId,
  level,
  message,
  payload,
  stepId
}: {
  runId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  payload?: JsonObject;
  stepId?: string;
}) {
  const supabase = createSupabaseServiceRoleClient();

  const { error } = await supabase.from('run_events').insert({
    run_id: runId,
    step_id: stepId ?? null,
    level,
    message,
    payload_json: payload ?? {}
  });

  if (error) {
    throw new Error(`No se pudo registrar evento: ${error.message}`);
  }
}

export async function updateRunStatus(runId: string, status: RunStatus, outputJson?: JsonObject) {
  const supabase = createSupabaseServiceRoleClient();

  const patch: Record<string, any> = {
    status
  };

  if (status === 'running') {
    patch.started_at = new Date().toISOString();
  }

  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timed_out') {
    patch.ended_at = new Date().toISOString();
  }

  if (outputJson) {
    patch.output_json = outputJson;
  }

  const { error } = await supabase.from('runs').update(patch).eq('id', runId);

  if (error) {
    throw new Error(`No se pudo actualizar run: ${error.message}`);
  }
}

export async function createRunStep({
  runId,
  stepCode,
  stepName,
  sequence,
  status = 'running',
  requestJson
}: {
  runId: string;
  stepCode: string;
  stepName: string;
  sequence: number;
  status?: string;
  requestJson?: JsonObject;
}) {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('run_steps')
    .insert({
      run_id: runId,
      step_code: stepCode,
      step_name: stepName,
      sequence,
      status,
      request_json: requestJson ?? null,
      started_at: new Date().toISOString()
    })
    .select('id,run_id,step_code,step_name,status,sequence,started_at')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo crear step: ${error?.message ?? 'unknown'}`);
  }

  return data;
}

export async function finishRunStep({
  stepId,
  status,
  responseJson,
  errorMessage
}: {
  stepId: string;
  status: 'success' | 'failed' | 'awaiting_external_event';
  responseJson?: JsonObject;
  errorMessage?: string;
}) {
  const supabase = createSupabaseServiceRoleClient();

  const { error } = await supabase
    .from('run_steps')
    .update({
      status,
      response_json: responseJson ?? null,
      error_message: errorMessage ?? null,
      ended_at: new Date().toISOString()
    })
    .eq('id', stepId);

  if (error) {
    throw new Error(`No se pudo cerrar step: ${error.message}`);
  }
}

export async function addRunArtifact({
  runId,
  stepId,
  artifactType,
  storagePath,
  metadata
}: {
  runId: string;
  stepId?: string;
  artifactType: string;
  storagePath: string;
  metadata?: JsonObject;
}) {
  const supabase = createSupabaseServiceRoleClient();

  const { error } = await supabase.from('run_artifacts').insert({
    run_id: runId,
    step_id: stepId ?? null,
    artifact_type: artifactType,
    storage_path: storagePath,
    metadata_json: metadata ?? {}
  });

  if (error) {
    throw new Error(`No se pudo registrar artifacto: ${error.message}`);
  }
}

export async function getRunById(runId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (error || !data) {
    throw new Error(`Run no encontrada: ${error?.message ?? 'unknown'}`);
  }

  return data;
}

export async function getProfileByUserId(userId: string) {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();

  if (error) {
    throw new Error(`No se pudo obtener perfil: ${error.message}`);
  }

  return data;
}

export async function markRunFailed(runId: string, reason: string) {
  await appendRunEvent({
    runId,
    level: 'error',
    message: reason
  });

  await updateRunStatus(runId, 'failed', {
    error: reason
  });
}
