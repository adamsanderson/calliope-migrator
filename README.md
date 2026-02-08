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

For clients that differentiate between queries (`SELECT`, `INSERT`, etc) and non returning statements (`CREATE`, `ALTER`, etc), you may need to provide an `execute` option as well.

With a migrator configured, you can simply call it.

```
await migrator.migrate()
```

That's it!

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
