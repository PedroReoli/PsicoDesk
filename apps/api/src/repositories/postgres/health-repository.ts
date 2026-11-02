import type { HealthRepository } from '../contracts.js';
import type { DatabaseClient } from './database.js';

export class PostgresHealthRepository implements HealthRepository {
  constructor(private readonly database: DatabaseClient) {}

  async ping(): Promise<boolean> {
    const result = await this.database.query<{ healthy: number }>('SELECT 1 AS healthy');
    return result.rows[0]?.healthy === 1;
  }
}
