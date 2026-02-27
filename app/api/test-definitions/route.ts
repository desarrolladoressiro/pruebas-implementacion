import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { syncTestDefinitions } from '@/lib/runs/sync-definitions';

export async function GET() {
  try {
    await requireCurrentUser();
    await syncTestDefinitions();

    const supabase = createSupabaseServiceRoleClient();
    const { data, error } = await supabase
      .from('test_definitions')
      .select('*')
      .eq('enabled', true)
      .order('domain', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}
