import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { TEST_DEFINITIONS } from '@/lib/runs/definitions';

export async function syncTestDefinitions() {
  const supabase = createSupabaseServiceRoleClient();

  const payload = TEST_DEFINITIONS.map((definition) => ({
    key: definition.key,
    domain: definition.domain,
    name: definition.name,
    description: definition.description,
    executor_code: definition.executor_code,
    enabled: definition.enabled,
    default_input: definition.default_input
  }));

  const { error } = await supabase.from('test_definitions').upsert(payload, {
    onConflict: 'key'
  });

  if (error) {
    throw new Error(`No se pudo sincronizar test_definitions: ${error.message}`);
  }
}
