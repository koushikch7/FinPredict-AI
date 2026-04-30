import { db } from '../db/index.js';

interface ConfigRow {
  key: string;
  value: string;
  category: string;
}

export const configStore = {
  get(key: string): string | undefined {
    const row = db.prepare('SELECT value FROM configurations WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  },
  getAll(): ConfigRow[] {
    return db.prepare('SELECT key, value, category FROM configurations ORDER BY category, key').all() as ConfigRow[];
  },
  set(key: string, value: string, category = 'General') {
    db.prepare(
      `INSERT INTO configurations (key, value, category) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    ).run(key, value, category);
  },
};

export const userSettings = {
  get(userId: number, key: string): string | undefined {
    const row = db
      .prepare('SELECT value FROM user_settings WHERE user_id = ? AND key = ?')
      .get(userId, key) as { value: string } | undefined;
    return row?.value;
  },
  set(userId: number, key: string, value: string) {
    db.prepare(
      `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    ).run(userId, key, value);
  },
  all(userId: number): Record<string, string> {
    const rows = db
      .prepare('SELECT key, value FROM user_settings WHERE user_id = ?')
      .all(userId) as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};
