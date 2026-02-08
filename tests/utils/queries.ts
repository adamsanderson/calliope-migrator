import Database from "better-sqlite3";

export function getTables(db: InstanceType<typeof Database>): string[] {
  return db
    .prepare<never[], { name: string }>(
      `SELECT name FROM sqlite_schema WHERE type='table';`,
    )
    .all()
    .map((row) => row.name);
}

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: boolean;
};

export function getTableColumns(
  db: InstanceType<typeof Database>,
  tableName: string,
): TableInfoRow[] {
  return db
    .prepare<never[], TableInfoRow>(`PRAGMA table_info('${tableName}');`)
    .all();
}

export function getTableColumnNames(
  db: InstanceType<typeof Database>,
  tableName: string,
): string[] {
  return getTableColumns(db, tableName).map((col) => col.name);
}
