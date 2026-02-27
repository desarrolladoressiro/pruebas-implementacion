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
    <>
      <header className="nav">
        <div className="nav-inner">
          <div className="row">
            <strong>SIRO Automation</strong>
            <span className="badge">{role}</span>
          </div>

          <div className="row">
            <Link href="/">Dashboard</Link>
            <Link href="/profile">Perfil</Link>
            <form action={signOut}>
              <button className="btn btn-secondary" type="submit">
                Cerrar sesion
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container">{children}</main>
    </>
  );
}
