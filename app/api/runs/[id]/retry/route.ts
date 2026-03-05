import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { appendRunEvent } from '@/lib/runs/repository';
import { retryRunForUser } from '@/lib/runs/queries';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    await retryRunForUser(user.id, id);

    await appendRunEvent({
      runId: id,
      level: 'warn',
      message: 'Ejecucion puesta nuevamente en cola'
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}
