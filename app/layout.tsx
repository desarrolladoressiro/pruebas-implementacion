import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SIRO Automation Platform',
  description: 'Plataforma de pruebas post-implementacion para SIRO'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
          (function() {
            try {
              var theme = localStorage.getItem('theme');
              if (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
              if (!theme) theme = 'light';
              document.documentElement.setAttribute('data-theme', theme);
            } catch (e) {}
          })();
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
