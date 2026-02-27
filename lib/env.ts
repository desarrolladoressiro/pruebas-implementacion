import { z } from 'zod';

const envSchema = z.object({
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

export type AppEnv = z.infer<typeof envSchema>;

let parsedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!parsedEnv) {
    parsedEnv = envSchema.parse(process.env);
  }

  return parsedEnv;
}
