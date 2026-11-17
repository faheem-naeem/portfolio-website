// Hand-made in-memory D1 fake backed by Node's built-in SQLite, so the real
// migration and the real SQL run in tests (no Cloudflare runtime needed).
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

type Value = string | number | null;

class FakeStatement {
    constructor(
        readonly db: DatabaseSync,
        readonly sql: string,
        readonly params: Value[] = [],
    ) {}
    bind(...params: Value[]) {
        return new FakeStatement(this.db, this.sql, params);
    }
    async all() {
        return this.exec();
    }
    async run() {
        return this.exec();
    }
    async first(col?: string) {
        const row = this.exec().results[0] as
            | Record<string, unknown>
            | undefined;
        if (!row) return null;
        return col ? row[col] : row;
    }
    exec() {
        const stmt = this.db.prepare(this.sql);
        if (/^\s*(select|with)/i.test(this.sql)) {
            return {
                success: true,
                results: stmt.all(...this.params),
                meta: {},
            };
        }
        const info = stmt.run(...this.params);
        return {
            success: true,
            results: [],
            meta: { changes: Number(info.changes) },
        };
    }
}

export interface FakeD1 {
    db: DatabaseSync;
    binding: D1Database;
    queries: string[];
}

export function createFakeD1(): FakeD1 {
    const db = new DatabaseSync(':memory:');
    const migration = readFileSync(
        fileURLToPath(new URL('../migrations/0001_init.sql', import.meta.url)),
        'utf8',
    );
    db.exec(migration);
    const queries: string[] = [];
    const binding = {
        prepare(sql: string) {
            queries.push(sql);
            return new FakeStatement(db, sql);
        },
        async batch(stmts: FakeStatement[]) {
            db.exec('BEGIN');
            try {
                const out = stmts.map((s) => s.exec());
                db.exec('COMMIT');
                return out;
            } catch (err) {
                db.exec('ROLLBACK');
                throw err;
            }
        },
        async exec(sql: string) {
            db.exec(sql);
            return { count: 1, duration: 0 };
        },
    };
    return { db, binding: binding as unknown as D1Database, queries };
}
