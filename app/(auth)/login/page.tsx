import { redirect } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ThemeToggle } from '@/components/theme-toggle';

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
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, var(--bg) 0%, var(--bg-soft) 100%)',
      padding: '24px',
      position: 'relative'
    }}>
      <div style={{ position: 'absolute', top: '24px', right: '24px' }}>
        <ThemeToggle />
      </div>

      <div className="card animate-enter" style={{
        maxWidth: '480px',
        width: '100%',
        padding: '48px 40px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.02)',
        borderRadius: '24px',
        textAlign: 'center'
      }}>
        {/* Decorative Top Accent */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '6px',
          background: 'linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%)'
        }} />

        {/* Logo/Icon shape */}
        <div style={{
          width: '64px',
          height: '64px',
          background: 'rgba(6, 105, 55, 0.1)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px auto',
          color: 'var(--primary)'
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>

        <h1 style={{ margin: '0 0 12px 0', fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>
          Automatizacion de Pruebas de Implementacion SIRO
        </h1>
        <p className="muted" style={{ margin: '0 0 32px 0', fontSize: '15px', lineHeight: 1.6 }}>
          Accede al panel de control para ejecutar, monitorear y administrar las pruebas automatizadas de SIRO.
        </p>

        {params.error && (
          <div className="badge badge-err" style={{ display: 'block', marginBottom: '24px', padding: '12px', fontSize: '14px', borderRadius: '12px' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>Error de acceso</div>
            <div style={{ fontWeight: 400, opacity: 0.9 }}>{params.error === 'oauth_start_failed' ? 'No se pudo contactar al proveedor.' : params.error}</div>
          </div>
        )}

        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="btn-google"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Ingresar con Google
          </button>
        </form>

        <div style={{ marginTop: '32px', fontSize: '13px', color: '#94a3b8' }}>
          Plataforma de pruebas para QA / Automatización
        </div>
      </div>
    </main>
  );
}
