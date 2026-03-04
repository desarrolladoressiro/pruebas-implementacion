import { z } from 'zod';

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  GCP_VM_URL: z.string().url().optional(),
  SIRO_HOMO_USER: z.string().min(1),
  SIRO_HOMO_PASSWORD: z.string().min(1),
  SIRO_PROD_USER: z.string().min(1),
  SIRO_PROD_PASSWORD: z.string().min(1),
  SIRO_CONVENIO_ID: z.string().min(1),
  SIRO_ADMIN_CUIT: z.string().min(1),
  PLAYWRIGHT_HEADLESS: z.enum(['true', 'false']).optional().default('true'),
  PLAYWRIGHT_SLOW_MO_MS: z.coerce.number().optional().default(0),
  TEST_PAYER_EMAIL: z.string().email().optional().default('qa@example.com'),
  TEST_PAYER_DNI: z.string().optional().default('30111222'),
  TEST_PAYER_FIRST_NAME: z.string().optional().default('NOMBRE'),
  TEST_PAYER_LAST_NAME: z.string().optional().default('APELLIDO'),
  TEST_PAYER_PHONE: z.string().optional().default('3510000000'),
  TEST_PAYER_ADDRESS: z.string().optional().default('AVENIDA 123'),
  TEST_PAYER_CITY: z.string().optional().default('CORDOBA'),
  TEST_PAYER_PROVINCE: z.string().optional().default('X'),
  TEST_PAYER_ZIP: z.string().optional().default('5000'),
  TEST_CARD_DEBIT_NUMBER: z.string().optional().default('4517721004856075'),
  TEST_CARD_DEBIT_MM: z.string().optional().default('08'),
  TEST_CARD_DEBIT_YY: z.string().optional().default('30'),
  TEST_CARD_DEBIT_CVV: z.string().optional().default('123'),
  TEST_CARD_CREDIT_NUMBER: z.string().optional().default('1213141516171819'),
  TEST_CARD_CREDIT_MM: z.string().optional().default('12'),
  TEST_CARD_CREDIT_YY: z.string().optional().default('30'),
  TEST_CARD_CREDIT_CVV: z.string().optional().default('123'),
  PROD_PAYER_EMAIL: z.string().email().optional(),
  PROD_PAYER_DNI: z.string().optional(),
  PROD_PAYER_FIRST_NAME: z.string().optional(),
  PROD_PAYER_LAST_NAME: z.string().optional(),
  PROD_PAYER_PHONE: z.string().optional(),
  PROD_PAYER_ADDRESS: z.string().optional(),
  PROD_PAYER_CITY: z.string().optional(),
  PROD_PAYER_PROVINCE: z.string().optional(),
  PROD_PAYER_ZIP: z.string().optional(),
  PROD_CARD_DEBIT_NUMBER: z.string().optional(),
  PROD_CARD_DEBIT_MM: z.string().optional(),
  PROD_CARD_DEBIT_YY: z.string().optional(),
  PROD_CARD_DEBIT_CVV: z.string().optional(),
  PROD_CARD_CREDIT_NUMBER: z.string().optional(),
  PROD_CARD_CREDIT_MM: z.string().optional(),
  PROD_CARD_CREDIT_YY: z.string().optional(),
  PROD_CARD_CREDIT_CVV: z.string().optional(),
  TEST_DEBIN_CBU: z.string().optional().default('0000003100000000000000'),
  TEST_DEBIN_ALIAS: z.string().optional().default('qa.alias.demo'),
  TEST_PMC_BANK_CODE: z.string().optional().default('510')
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
