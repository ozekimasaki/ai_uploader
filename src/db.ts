export type Db = D1Database;

export async function runMigrations(db: Db): Promise<void> {
  // In Workers, use D1 migrations via wrangler typically; here we provide a helper for local/dev
}

export async function queryItemsPaged(db: Db, page: number, pageSize: number, filters: Record<string, string | null>) {
  const offset = (page - 1) * pageSize;
  // Minimal stub: return empty set for now
  return { items: [], total: 0, page, pageSize, offset };
}


