import { expect, test, suite } from "vitest";
import { splitOnDashes, splitOnSemicolon } from "../src";

suite("splitting by semicolons", () => {
  test("split by semicolon matches end of line", () => {
    const sql = `
      CREATE TABLE a(id INTEGER PRIMARY KEY);
      CREATE TABLE b(id INTEGER PRIMARY KEY);
    `;

    const statements = splitOnSemicolon(sql);
    expect(statements).toHaveLength(2);
    expect(statements).toEqual([
      `CREATE TABLE a(id INTEGER PRIMARY KEY)`,
      `CREATE TABLE b(id INTEGER PRIMARY KEY)`,
    ]);
  });

  test("split by semicolon ignores semicolons in middle of line", () => {
    const sql = `
      CREATE TABLE ; OKAY!
    `;

    const statements = splitOnSemicolon(sql);
    expect(statements).toHaveLength(1);
    expect(statements).toEqual([`CREATE TABLE ; OKAY!`]);
  });
});

suite("splitting by dashes", () => {
  test("splits by three dashes", () => {
    const sql = `
      CREATE TABLE a(id INTEGER PRIMARY KEY);
      ---
      CREATE TABLE b(id INTEGER PRIMARY KEY);
    `;

    const statements = splitOnDashes(sql);
    expect(statements).toHaveLength(2);
    expect(statements).toEqual([
      `CREATE TABLE a(id INTEGER PRIMARY KEY);`,
      `CREATE TABLE b(id INTEGER PRIMARY KEY);`,
    ]);
  });

  test("splits by more than three dashes", () => {
    const sql = `
      CREATE TABLE a(id INTEGER PRIMARY KEY);
      ------
      CREATE TABLE b(id INTEGER PRIMARY KEY);
    `;

    const statements = splitOnDashes(sql);
    expect(statements).toHaveLength(2);
    expect(statements).toEqual([
      `CREATE TABLE a(id INTEGER PRIMARY KEY);`,
      `CREATE TABLE b(id INTEGER PRIMARY KEY);`,
    ]);
  });

  test("ignores plain comments", () => {
    const sql = `
      CREATE TABLE a(id INTEGER PRIMARY KEY);
      -- Okay something here
      CREATE TABLE b(id INTEGER PRIMARY KEY);
    `;

    const statements = splitOnDashes(sql);
    expect(statements).toHaveLength(1);
  });

  test("ignores leading and trailing dashes with content", () => {
    const sql = `
      CREATE TABLE a(id INTEGER PRIMARY KEY);
      --- Okay something here
      Or here ---
      CREATE TABLE b(id INTEGER PRIMARY KEY);
    `;

    const statements = splitOnDashes(sql);
    expect(statements).toHaveLength(1);
  });
});
