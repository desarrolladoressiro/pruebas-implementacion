import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { getOrCreateProfile } from '@/lib/profile';
import { createRun } from '@/lib/runs/repository';
import { listRunsForUser } from '@/lib/runs/queries';

const createRunSchema = z.object({
  testDefinitionKey: z.string().min(1),
  environment: z.enum(['homologacion', 'produccion']),
  inputJson: z.record(z.any()).default({})
});

function normalizeCanal(canal: unknown) {
  return String(canal ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isDebinOrPmc(canal: string) {
  return new Set(['debin', 'n', 'pmc', 'b', 'pago_mis_cuentas']).has(canal);
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const items = await listRunsForUser(user.id);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = createRunSchema.parse(await request.json());

    if (parsed.testDefinitionKey === 'siro_pagos_crear_intencion') {
      const canal = normalizeCanal(parsed.inputJson?.canal);
      if (isDebinOrPmc(canal)) {
        const profile = await getOrCreateProfile(user.id, user.email ?? null);
        const missing: string[] = [];

        if (!String(profile.dni ?? '').trim()) missing.push('DNI');
        if (!String(profile.cbu ?? '').trim()) missing.push('CBU');
        if (!String(profile.preferred_bank ?? '').trim()) missing.push('Banco preferido');

        if (missing.length > 0) {
          return NextResponse.json(
            {
              error: `Para ejecutar canal ${String(parsed.inputJson?.canal ?? '').toUpperCase()} debes completar en Perfil: ${missing.join(', ')}.`
            },
            { status: 400 }
          );
        }
      }
    }

    const run = await createRun({
      userId: user.id,
      testDefinitionKey: parsed.testDefinitionKey,
      environment: parsed.environment,
      inputJson: parsed.inputJson
    });

    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}
