// In-memory D1 fake backed by real SQLite (node:sqlite), so the real
// migration SQL and queries are exercised. Implements only what the app uses.
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

type Value = string | number | null;

class FakeStatement {
    constructor(
        private readonly db: DatabaseSync,
        readonly sql: string,
        private readonly params: Value[] = [],
    ) {}

    bind(...params: Value[]) {
        return new FakeStatement(this.db, this.sql, params);
    }

    all<T>() {
        const rows = this.db.prepare(this.sql).all(...this.params) as T[];
        return Promise.resolve({ results: rows, success: true, meta: {} });
    }

    run() {
        if (/\bRETURNING\b/i.test(this.sql)) return this.all();
        this.db.prepare(this.sql).run(...this.params);
        return Promise.resolve({ results: [], success: true, meta: {} });
    }

    async first<T>() {
        const { results } = await this.all<T>();
        return results[0] ?? null;
    }
}

export class FakeD1 {
    readonly sqlite = new DatabaseSync(':memory:');
    failNextWith: Error | null = null;

    constructor() {
        const migration = readFileSync(
            new URL('../../migrations/0001_init.sql', import.meta.url),
            'utf8',
        );
        this.sqlite.exec(migration);
    }

    prepare(sql: string) {
        return new FakeStatement(this.sqlite, sql);
    }

    async batch(statements: FakeStatement[]) {
        this.sqlite.exec('BEGIN');
        try {
            const out = [];
            for (const s of statements) out.push(await s.run());
            this.sqlite.exec('COMMIT');
            return out;
        } catch (err) {
            this.sqlite.exec('ROLLBACK');
            throw err;
        }
    }

    rows<T = Record<string, unknown>>(sql: string): T[] {
        return this.sqlite.prepare(sql).all() as T[];
    }

    asD1(): D1Database {
        return this as unknown as D1Database;
    }
}
