# SIRO Automation Platform

Plataforma para ejecutar pruebas post-implementacion sobre SIRO.

Alcance implementado en esta etapa:
- Login con Google (Supabase Auth)
- Perfil operativo por usuario
- Definiciones de pruebas para API SIRO Pagos y API SIRO
- Creacion y seguimiento de runs
- Timeline en tiempo real con Supabase Realtime
- Worker de ejecucion para correr pruebas en GCP VM
- Webhook URL_OK

Fuera de esta etapa:
- Online SIRO (SIRO Web)
- Boton de Pagos Offline

## Stack
- Next.js App Router (frontend + API liviana)
- Supabase (Auth, Postgres, Realtime, Storage)
- Worker Node.js en GCP VM
- Vercel (deploy web)

## Estructura principal
- `app/`: frontend y endpoints HTTP
- `lib/`: auth, supabase, SIRO clients, runs
- `worker/`: proceso de ejecucion de runs
- `supabase/migrations/`: esquema SQL inicial
- `docs/`: guias de instalacion y operacion

## Documentacion de setup
1. `docs/01-supabase-setup.md`
2. `docs/02-gcp-worker-setup.md`
3. `docs/03-github-vercel-setup.md`
4. `docs/04-local-development.md`
5. `docs/05-operacion-api-siro.md`

## Variables de entorno
Copiar `.env.example` a `.env.local` para desarrollo local y completar valores.

## Scripts
- `npm run dev`: frontend local
- `npm run build`: build de Next.js
- `npm run start`: start de app build
- `npm run typecheck`: validacion de tipos
- `npm run worker`: proceso worker
