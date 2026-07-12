declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
declare const __API_BASE_URL__: string;

export const extensionConfig = {
  supabaseUrl: __SUPABASE_URL__,
  supabaseAnonKey: __SUPABASE_ANON_KEY__,
  apiBaseUrl: __API_BASE_URL__.replace(/\/$/, ''),
};

export function isConfigured(): boolean {
  return Boolean(extensionConfig.supabaseUrl && extensionConfig.supabaseAnonKey);
}
