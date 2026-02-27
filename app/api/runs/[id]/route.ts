import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { getRunDetailForUser } from '@/lib/runs/queries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;

    const result = await getRunDetailForUser(user.id, id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 400 }
    );
  }
}
