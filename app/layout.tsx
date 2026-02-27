import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SIRO Automation Platform',
  description: 'Plataforma de pruebas post-implementacion para SIRO'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
