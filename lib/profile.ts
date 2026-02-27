import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export async function getOrCreateProfile(userId: string, email: string | null) {
  const supabase = createSupabaseServiceRoleClient();

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`No se pudo obtener perfil: ${existingError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      email,
      preferred_bank: '007',
      base_cliente: '70000000'
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo crear perfil: ${error?.message ?? 'unknown'}`);
  }

  return data;
}

export async function updateProfile(userId: string, patch: Record<string, any>) {
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo actualizar perfil: ${error?.message ?? 'unknown'}`);
  }

  return data;
}
