export type PublicConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  maxFileSizeMB: number;
  allowedFileTypes: string; // csv list
  defaultDownloadTtlMinutes: number;
  maxDownloadTtlMinutes: number;
  environment: string;
};

let cachedConfigPromise: Promise<PublicConfig> | null = null;

export function getPublicConfig(): Promise<PublicConfig> {
  if (!cachedConfigPromise) {
    cachedConfigPromise = fetch('/api/public-config', { headers: { accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load public-config');
        return (await res.json()) as PublicConfig;
      });
  }
  return cachedConfigPromise;
}


