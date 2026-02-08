import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type LoggerType = Pick<typeof console, "log" | "warn" | "error">;
type QueryFnType = (sql: string) => Promise<unknown[]>;
type ExecFnType = (sql: string) => Promise<void> | Promise<unknown[]>;
type SplitFnType = (text: string) => string[];

type CalliopeOptions = {
  query: QueryFnType;
  exec?: ExecFnType;
  migrationDir?: string;
  migrationTable?: string;
  logger?: LoggerType;
  splitStatements?: SplitFnType;
};

const DEFAULT_DIR = "migrations";
const DEFAULT_TABLE = "__migrations";
const DEFAULT_SPLIT = (sql: string) => [sql];

export const splitOnSemicolon = (sql: string) => sql.split(/;\s*$/gm);
export const splitOnDashes = (sql: string) => sql.split(/^\s*---+\s*$/gm);
export const nullLogger: LoggerType = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

export class Migrator {
  query: QueryFnType;
  exec: ExecFnType;
  migrationDir: string;
  migrationTable: string;
  logger: LoggerType;
  splitStatements: SplitFnType;

  constructor(options: CalliopeOptions) {
    this.query = options.query;
    this.exec = options.exec || options.query;
    this.migrationDir = options.migrationDir ?? DEFAULT_DIR;
    this.migrationTable = options.migrationTable ?? DEFAULT_TABLE;
    this.logger = options.logger || console;
    this.splitStatements = options.splitStatements || DEFAULT_SPLIT;
  }

  async migrate(): Promise<void> {
    await this.ensureMigrationTable();

    const unapplied = await this.unappliedMigrations();
    if (unapplied.length === 0) {
      return;
    }

    await this.exec("BEGIN");
    try {
      for (const migration of unapplied) {
        await this.applyMigration(migration);
      }
      await this.exec("COMMIT");
    } catch (error) {
      this.logger.error("Rolling back");
      await this.exec("ROLLBACK");
      throw error;
    }
  }

  async applyMigration(migration: string) {
    this.logger.log("Applying", migration);
    try {
      const sql = await this.readMigration(migration);
      const statements = this.splitStatements(sql);
      for (const statement of statements) {
        this.logger.log(statement);
        await this.exec(statement);
      }
      await this.recordMigration(migration);
      this.logger.log("Applied", migration);
    } catch (error) {
      this.logger.error("Could not apply migration", migration);
      this.logger.error(error);
      throw error;
    }
  }

  async readMigration(migration: string) {
    return (await readFile(join(this.migrationDir, migration))).toString();
  }

  async recordMigration(migration: string) {
    const now = Date.now();

    const sql = `
      INSERT INTO ${this.migrationTable} (migration, applied_at)
      VALUES ('${migration}', ${now})
    `;

    await this.exec(sql);
  }

  async unappliedMigrations() {
    const applied = new Set(await this.appliedMigrations());
    const migrations = await this.findMigrations();

    return migrations.filter((m) => !applied.has(m));
  }

  async findMigrations() {
    const files = (await readdir(this.migrationDir)).toSorted();
    return files;
  }

  async appliedMigrations() {
    const sql = `SELECT migration FROM ${this.migrationTable}`;
    const rows = (await this.query(sql)) as { migration: string }[];

    return rows.map((r) => r.migration);
  }

  async ensureMigrationTable() {
    try {
      const sql = `SELECT * FROM ${this.migrationTable} LIMIT 1`;
      await this.query(sql);
    } catch (error) {
      await this.createMigrationTable();
    }
  }

  async createMigrationTable() {
    this.logger.log("Creating migration table", this.migrationTable);
    try {
      const sql = `
        CREATE TABLE ${this.migrationTable}(
          migration VARCHAR(255) PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )
      `;

      await this.exec(sql);
    } catch (error) {
      this.logger.error("Could not create migration table", {
        migrationTable: this.migrationTable,
        error,
      });
    }
  }
}
