import Database from "better-sqlite3";
import { beforeEach, expect, suite, test } from "vitest";

import { Migrator, nullLogger } from "../src/index";
import path from "node:path";
import {
  getTableColumnNames,
  getTableColumns,
  getTables,
} from "./utils/queries";

suite("sqlite", () => {
  let db: InstanceType<typeof Database>;
  let migrator: InstanceType<typeof Migrator>;

  beforeEach(() => {
    db = new Database(":memory:");

    migrator = new Migrator({
      query: (sql: string) => db.prepare(sql).all(),
      exec: (sql: string) => db.exec(sql),
      migrationDir: path.join(__dirname, "base_migrations"),
      logger: nullLogger,
    });
  });

  test("creates migrations table", async () => {
    await migrator.ensureMigrationTable();

    const columns = getTableColumnNames(db, migrator.migrationTable);
    expect(columns).toEqual(["migration", "applied_at"]);
  });

  test("creates migrations table idempotently", async () => {
    await migrator.ensureMigrationTable();
    await migrator.ensureMigrationTable();

    const columns = getTableColumnNames(db, migrator.migrationTable);
    expect(columns).toEqual(["migration", "applied_at"]);
  });

  test("migrates a database", async () => {
    await migrator.migrate();
    const applied = await migrator.appliedMigrations();

    // All three migrations should be applied
    expect(applied.length).toBe(3);

    // The migrations table, `a`, and `b` should be created
    const tables = getTables(db);
    expect(tables).toContain(migrator.migrationTable);
    expect(tables).toContain("a");
    expect(tables).toContain("b");

    // Table `a` should not contain the test column (removed in 003)
    const aColumns = getTableColumns(db, "a").map((col) => col.name);
    expect(aColumns).not.toContain("test");

    // Table `b` should contain the test column
    const bColumns = getTableColumns(db, "b").map((col) => col.name);
    expect(bColumns).toContain("test");
  });

  test("migrations are idempotent", async () => {
    await migrator.migrate();
    await migrator.migrate();

    const applied = await migrator.appliedMigrations();
    expect(applied.length).toBe(3);
  });

  test("rolls back all migrations on error", async () => {
    await migrator.migrate();

    // 005_error.sql should fail, there should only be 3 applied migrations:
    migrator.migrationDir = path.join(__dirname, "rollback_migrations");
    await expect(migrator.migrate()).rejects.toThrowError();

    const applied = await migrator.appliedMigrations();
    expect(applied.length).toBe(3);
  });

  test("it supports async clients", async () => {
    const query: (sql: string) => Promise<unknown[]> = (sql: string) => {
      return new Promise((resolve, reject) => {
        try {
          resolve(db.prepare(sql).all());
        } catch (error) {
          reject(error);
        }
      });
    };
    const exec: (sql: string) => Promise<void> = (sql: string) => {
      return new Promise((resolve, reject) => {
        try {
          db.exec(sql);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    };

    migrator.query = query;
    migrator.exec = exec;

    await migrator.migrate();
    const applied = await migrator.appliedMigrations();

    expect(applied.length).toBe(3);
  });
});
