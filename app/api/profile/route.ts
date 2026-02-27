import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { getOrCreateProfile, updateProfile } from '@/lib/profile';

const profilePatchSchema = z.object({
  dni: z.string().max(20).optional().nullable(),
  cbu: z.string().max(30).optional().nullable(),
  alias: z.string().max(100).optional().nullable(),
  preferred_bank: z.string().max(10).optional().nullable(),
  base_cliente: z.string().max(9).optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const profile = await getOrCreateProfile(user.id, user.email ?? null);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser();
    const patch = profilePatchSchema.parse(await request.json());
    const profile = await updateProfile(user.id, patch);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}
