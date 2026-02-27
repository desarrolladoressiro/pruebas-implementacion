import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { createRun } from '@/lib/runs/repository';
import { listRunsForUser } from '@/lib/runs/queries';

const createRunSchema = z.object({
  testDefinitionKey: z.string().min(1),
  environment: z.enum(['homologacion', 'produccion']),
  inputJson: z.record(z.any()).default({})
});

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
