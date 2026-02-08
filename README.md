# Calliope

The smallest functional SQL migrator.

Calliope is a tiny migration library.  By design, Calliope does not ship a CLI or database adapters.  Instead, you provide the configuration in code and wrap it in whatever script makes sense for your application.

## Usage

In your script (`scripts/migrate.ts` for instance) you will configure the `query` and `exec` functions to call your preferred SQL library.

For instance:

```
 // Import your database client
import { db } from '../src/db'

migrator = new Migrator({
  query: db.query,
});
```

For clients such as better-sqlite3 that differentiate between queries (`SELECT`, `INSERT`, etc) and non returning statements (`CREATE`, `ALTER`, etc), you may need to provide an `execute` option as well:

```
db = new Database(":memory:");

migrator = new Migrator({
  query: (sql: string) => db.prepare(sql).all(),
  exec: (sql: string) => db.exec(sql),
})
```

With a migrator configured, you can simply call it.

```
await migrator.migrate()
```

Calliope assumes an async database interface, but can be used with a synchronous client as well, though you should make sure you treat the migration as `async`. 

## Configuration

By default, Calliope picks sensible defaults.  In all cases, simply take a look at `src/index.ts` for complete type definitions.

`query`: A function returning an array of objects, ie: `SELECT name FROM migrations` should yield something like: `[{name: '001_base.sql'}]`

`exec`: An optional function executing SQL, the return type is ignored.

`migrationDir`: Directory relative to the working directory to find migrations in. (Defaults to `migrations`)

`migrationTable`: Calliope tracks which migrations have been applied in a table within your database.  (Defaults to `__migrations`)

`logger`: A `console` like object.  Calliope provides a `nullLogger` if you want to silence it.  Defaults to `console`)

`splitStatements`: While many clients support batched operations (`pg`, `better-sqlite3`), some database clients only support one statement per `exec` call.  In this case, you can pass in a splitter function.  Calliope exposes `splitOnSemicolon` (whenever a line ends in a semicolon) and `splitOnDashes` (lines containing only dashes like: `---`) as sensible approaches.

Finally, since Calliope is exposed as a class, you are entirely free to subclass it.  For instance, if you don't like how `ensureMigrationTable` is implemented, simply create your own class extending Migrator:

```
class MuchBetterMigrator extends Migrator {
  override ensureMigrationTable() {
    // … vastly better logic
  }
}
```

This is just fine.

## How It Works

When called, Calliope will test to see if its table exists.  If not, it will create the migrations table.

Next it will get all applied migrations and test them against the unapplied migrations found in the migrations directory.

All pending migrations are wrapped in a single transaction, if it fails they'll all be rolled back.  Otherwise each migration is applied and recorded in the migrations table.

Only the most basic SQL is used to ensure that Calliope can be applied to any reasonably standardized database.

## Assumpions

1. Calliope assumes that once a migration has been applied it is never modified.
2. Calliope applies migrations in lexical order, prefix your migrations either with a timestamp or ordinal id to ensure ordering.
3. Calliope assumes that if migrations are applied out of order that they are independent.  For instance if 01 and 03 are applied and the 02 is merged, Calliope's final ordering may be 01, 03, and then 02.
4. Calliope does not support down migrations.  They're often not used or tested.  Failures will be rolled back.  If you need to back out a migration once it's been applied your best bet is to write the down migration as a new migration.
5. Calliope doesn't care if applied migrations are missing from the directory, so feel free to collapse and snapshot schemas over time.
6. Calliope blindly interpolates your migration table name.  If you call it `1; DROP DATABASE` then get what you deserve.

## But Why?

There are a ton of different database libraries ranging from ORMs, to query builders, or SQL generators, and so forth.  Some have their own migration system, some don't.  In the end, I just wanted to know that I could execute a series of plain SQL files in a simple way.

If your favorite library has a migration tool, go ahead and use it!  If not, Calliope is a tiny helper you can always fall back on.

## Development

- Install dependencies:

```bash
npm install
```

- Run the unit tests:

```bash
npm run test
```

- Build the library:

```bash
npm run build
```
