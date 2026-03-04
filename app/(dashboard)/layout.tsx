import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/runs/repository';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const role = await getUserRole(user.id);

  async function signOut() {
    'use server';

    const current = await createSupabaseServerClient();
    await current.auth.signOut();
    redirect('/login');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <header className="nav">
        <div className="nav-inner">
          <div className="row">
            <strong style={{ fontSize: '1.25rem', color: 'var(--primary)', letterSpacing: '-0.5px' }}>Automatizacion de Pruebas de Implementacion SIRO</strong>
            <span className="badge" style={{ background: '#e2e8f0', color: '#475569' }}>{role}</span>
          </div>

          <div className="row" style={{ gap: '24px' }}>
            <Link href="/" className="muted">Dashboard</Link>
            <Link href="/profile" className="muted">Perfil</Link>
            <form action={signOut} style={{ margin: 0 }}>
              <button className="btn btn-secondary" type="submit" style={{ padding: '6px 14px', fontSize: '13px' }}>
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <main style={{ flex: 1, overflow: 'hidden' }}>{children}</main>
    </div>
  );
}
