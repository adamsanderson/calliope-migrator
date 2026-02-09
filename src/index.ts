import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type LoggerType = Pick<typeof console, "log" | "warn" | "error">;

/** A function returning an array of objects, ie: `SELECT name FROM migrations` should yield something like: `[{name: '001_base.sql'}]` */
type QueryFnType = (sql: string) => Promise<unknown[]> | unknown[];

/** A function executing SQL, the return type is ignored */
type ExecFnType = (sql: string) => Promise<unknown | void> | unknown | void;

/** A function that breaks a string into multiple SQL statements */
type SplitFnType = (text: string) => string[];

type CalliopeOptions = {
  /** A function returning an array of objects, ie: `SELECT name FROM migrations` should yield something like: `[{name: '001_base.sql'}]` */
  query: QueryFnType;
  /** A function executing SQL, the return type is ignored.  Defaults to `query` option if not defined. */
  exec?: ExecFnType;
  /** Directory relative to the working directory to find migrations in. (Defaults to `migrations`) */
  migrationDir?: string;
  /** Calliope tracks which migrations have been applied in a table within your database.  (Defaults to `__migrations`) */
  migrationTable?: string;
  /** A `console` like object.  Calliope provides a `nullLogger` if you want to silence it.  Defaults to `console`) */
  logger?: LoggerType;
  /** Optional function for splitting statements in migrations. */
  splitStatements?: SplitFnType;
};

const DEFAULT_DIR = "migrations";
const DEFAULT_TABLE = "__migrations";
const DEFAULT_SPLIT = (sql: string) => [sql];

/**
 * Splits statements on a trailing semicolon.
 *
 * Ie:
 * ```sql
 *   CREATE TABLE a(id INTEGER PRIMARY KEY);
 *   CREATE TABLE b(id INTEGER PRIMARY KEY);
 * ```
 *
 * Will yield two statements.  This should be relatively safe.
 */
export const splitOnSemicolon = (sql: string) =>
  sql
    .split(/;\s*$/gm)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * Splits statements on series of dashes.
 *
 * Ie:
 * ```sql
 *   CREATE TABLE a(id INTEGER PRIMARY KEY);
 *   ---
 *   CREATE TABLE b(id INTEGER PRIMARY KEY);
 * ```
 *
 * Will yield two statements.  This should be relatively safe.
 */
export const splitOnDashes = (sql: string) =>
  sql
    .split(/^\s*---+\s*$/gm)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * To silence Calliope, you can use the null logger.
 */
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

  /**
   * Applies all pending migrations.  Failures will rollback the whole batch.
   */
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

  /**
   * Lists all unapplied migrations.
   *
   * This can be used as a dry run or preview of the migrations that Calliope would apply.
   *
   * @returns names of unapplied migrations
   */
  async unappliedMigrations() {
    const applied = new Set(await this.appliedMigrations());
    const migrations = await this.findMigrations();

    return migrations.filter((m) => !applied.has(m));
  }

  async findMigrations() {
    const files = (await readdir(this.migrationDir)).toSorted();
    return files;
  }

  /**
   * Lists all applied migrations.
   *
   * This can be used to compare database environments.
   *
   * @returns names of applied migrations
   */
  async appliedMigrations() {
    const sql = `SELECT migration FROM ${this.migrationTable}`;
    const rows = (await this.query(sql)) as { migration: string }[];

    return rows.map((r) => r.migration);
  }

  async ensureMigrationTable() {
    try {
      // Executes a test query to determine whether the migration table exists.
      // On failure, Calliope will try to create its migration table.
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
