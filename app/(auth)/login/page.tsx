import { redirect } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams;

  async function signInWithGoogle() {
    'use server';

    const supabase = await createSupabaseServerClient();
    const env = getEnv();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${env.APP_BASE_URL}/api/auth/callback`
      }
    });

    if (error || !data.url) {
      redirect('/login?error=oauth_start_failed');
    }

    redirect(data.url);
  }

  return (
    <main className="container" style={{ maxWidth: 560, paddingTop: 60 }}>
      <section className="card grid" style={{ gap: 18 }}>
        <h1 style={{ margin: 0 }}>SIRO Automation Platform</h1>
        <p className="muted" style={{ margin: 0 }}>
          Inicia sesion con Google para ejecutar y monitorear pruebas de API SIRO y API SIRO Pagos.
        </p>

        {params.error ? (
          <div className="badge badge-err">Error de login: {params.error}</div>
        ) : null}

        <form action={signInWithGoogle}>
          <button className="btn" type="submit">
            Ingresar con Google
          </button>
        </form>
      </section>
    </main>
  );
}
