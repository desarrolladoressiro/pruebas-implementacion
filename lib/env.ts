import { z } from 'zod';

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  SIRO_HOMO_USER: z.string().min(1),
  SIRO_HOMO_PASSWORD: z.string().min(1),
  SIRO_PROD_USER: z.string().min(1),
  SIRO_PROD_PASSWORD: z.string().min(1),
  SIRO_CONVENIO_ID: z.string().min(1),
  SIRO_ADMIN_CUIT: z.string().min(1)
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type AppEnv = z.infer<typeof serverSchema>;

let parsedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (parsedEnv) return parsedEnv;

  const isServer = typeof window === 'undefined';

  if (isServer) {
    const result = serverSchema.safeParse(process.env);
    if (!result.success) {
      console.error('❌ Error de validación de variables de entorno (Servidor):', JSON.stringify(result.error.issues, null, 2));
      throw new Error('Variables de entorno del servidor inválidas');
    }
    parsedEnv = result.data;
  } else {
    // En el cliente, Next.js solo inyecta variables NEXT_PUBLIC_ si se referencian explícitamente
    const clientData = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };

    const result = clientSchema.safeParse(clientData);
    if (!result.success) {
      console.error('❌ Error de validación de variables de entorno (Cliente):', JSON.stringify(result.error.issues, null, 2));
      throw new Error('Variables de entorno del cliente inválidas');
    }
    // Casting a AppEnv ya que en el cliente solo usaremos las públicas
    parsedEnv = result.data as AppEnv;
  }

  return parsedEnv;
}
