import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import Database from "better-sqlite3";
import pg from "pg";
import { loadBaseConfig, resolveDatabasePath } from "../shared/config.js";

type Parameters = unknown[] | Record<string, unknown>;

export interface RunResult {
  changes: number;
}

export interface DatabaseAdapter {
  readonly dialect: "sqlite" | "postgres";
  exec(sql: string): Promise<void>;
  all<T>(sql: string, params?: Parameters): Promise<T[]>;
  get<T>(sql: string, params?: Parameters): Promise<T | undefined>;
  run(sql: string, params?: Parameters): Promise<RunResult>;
  transaction<T>(callback: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function postgresStatement(sql: string, params: Parameters = []): { text: string; values: unknown[] } {
  if (Array.isArray(params)) {
    let index = 0;
    return {
      text: sql.replace(/\?/g, () => `$${++index}`),
      values: params
    };
  }

  const values: unknown[] = [];
  const indexes = new Map<string, number>();
  const text = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, name: string) => {
    let index = indexes.get(name);
    if (!index) {
      values.push(params[name]);
      index = values.length;
      indexes.set(name, index);
    }
    return `$${index}`;
  });
  return { text, values };
}

function sqliteParameters(params: Parameters = []): unknown[] | Record<string, unknown> {
  if (Array.isArray(params)) return params;
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, value]));
}

function createSqliteAdapter(databaseUrl: string): DatabaseAdapter {
  const databasePath = resolveDatabasePath(databaseUrl);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  return {
    dialect: "sqlite",
    async exec(sql) {
      database.exec(sql);
    },
    async all<T>(sql: string, params: Parameters = []) {
      const statement = database.prepare(sql);
      return (Array.isArray(params) ? statement.all(...params) : statement.all(sqliteParameters(params) as never)) as T[];
    },
    async get<T>(sql: string, params: Parameters = []) {
      const statement = database.prepare(sql);
      return (Array.isArray(params) ? statement.get(...params) : statement.get(sqliteParameters(params) as never)) as T | undefined;
    },
    async run(sql, params = []) {
      const statement = database.prepare(sql);
      const result = Array.isArray(params) ? statement.run(...params) : statement.run(sqliteParameters(params) as never);
      return { changes: result.changes };
    },
    async transaction<T>(callback: () => Promise<T>) {
      database.exec("BEGIN");
      try {
        const result = await callback();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      database.close();
    }
  };
}

function createPostgresAdapter(databaseUrl: string, useSsl: boolean): DatabaseAdapter {
  pg.types.setTypeParser(1114, (value) => value);
  pg.types.setTypeParser(1184, (value) => value);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });
  const transactionStorage = new AsyncLocalStorage<pg.PoolClient>();

  async function query(sql: string, params: Parameters = []) {
    const statement = postgresStatement(sql, params);
    return (transactionStorage.getStore() ?? pool).query(statement.text, statement.values);
  }

  return {
    dialect: "postgres",
    async exec(sql) {
      await (transactionStorage.getStore() ?? pool).query(sql);
    },
    async all<T>(sql: string, params: Parameters = []) {
      return (await query(sql, params)).rows as T[];
    },
    async get<T>(sql: string, params: Parameters = []) {
      return (await query(sql, params)).rows[0] as T | undefined;
    },
    async run(sql, params = []) {
      const result = await query(sql, params);
      return { changes: result.rowCount ?? 0 };
    },
    async transaction<T>(callback: () => Promise<T>) {
      if (transactionStorage.getStore()) return callback();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await transactionStorage.run(client, callback);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}

const config = loadBaseConfig();
const isPostgres = /^postgres(ql)?:\/\//i.test(config.DATABASE_URL);

export const db: DatabaseAdapter = isPostgres
  ? createPostgresAdapter(config.DATABASE_URL, config.DATABASE_SSL === "true" || /sslmode=require/i.test(config.DATABASE_URL))
  : createSqliteAdapter(config.DATABASE_URL);
