import pg from 'pg';

/**
 * Narrow database seam the example tools depend on. Deliberately just
 * `query(sql, params)` so tests can stub it without a live Postgres (CI has
 * none) and the tools never see a full pg.Pool. The real implementation wraps
 * pg.Pool; `PoolDb.fromEnv()` builds one from EXAMPLE_DATABASE_URL.
 */
export interface QueryResult<Row> {
  rows: Row[];
}

export interface Db {
  query<Row>(sql: string, params?: readonly unknown[]): Promise<QueryResult<Row>>;
}

export class PoolDb implements Db {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 5 });
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): PoolDb {
    const url = env['EXAMPLE_DATABASE_URL'];
    if (!url) {
      throw new Error('EXAMPLE_DATABASE_URL is required to run the example tools.');
    }
    return new PoolDb(url);
  }

  async query<Row>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<Row>> {
    const result = await this.pool.query(sql, params as unknown[]);
    return { rows: result.rows as Row[] };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
