# catac — project & setup guide

This file tells the coding agent (and any human) how to get this project running.

## For a brand-new person: "please set this up for me"

If someone asks you to set up, install, or get this project running, run **one command**:

```bash
bun run setup
```

That's it. The `setup` script (`scripts/setup.mjs`) is idempotent — safe to run again
any time — and it does everything automatically:

1. **Creates the `.env` file** from `.env.example` if it doesn't exist yet.
2. **Installs dependencies** (`bun install`) if `node_modules` is missing.
3. **Creates the local database** — a single file `db.sqlite` in this folder — and
   syncs it to the current schema.

When it finishes it prints `All set.` Then start the app:

```bash
bun run dev
```

Open http://localhost:3000.

> If `bun` is not installed, the scripts fall back to `npm` automatically — you can run
> `npm run setup` and `npm run dev` instead. To install bun: https://bun.sh

## The database (important context)

- **What:** a local **SQLite** database. The ORM is **Drizzle** (`drizzle-orm` +
  `@libsql/client`).
- **Where:** a single file, **`db.sqlite`**, living in the repository root. Nothing to
  install, no server to run, no cloud account. Deleting the file resets everything.
- **Config:** `DATABASE_URL="file:./db.sqlite"` in `.env` (schema validated in
  `src/env.js`). The path is picked up by `drizzle.config.ts`.
- **Not committed:** `db.sqlite` (and its `-journal`/`-wal`/`-shm` sidecars) are
  git-ignored — the database stays on the local machine and never goes into git.
- **Schema:** defined in `src/server/db/schema.ts`. Tables are prefixed `catac_`.
- **Connection:** created in `src/server/db/index.ts`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `bun run setup` | One-shot setup (env + deps + database). Safe to re-run. |
| `bun run dev` | Start the app at http://localhost:3000. |
| `bun run db:push` | Apply schema changes in `schema.ts` to `db.sqlite`. |
| `bun run db:studio` | Open Drizzle Studio, a browser UI to view/edit the data. |
| `bun run db:reset` | **Deletes** `db.sqlite` and recreates it empty. Fresh start. |

## If someone changes the database schema

After editing `src/server/db/schema.ts`, apply it to the local database:

```bash
bun run db:push
```

## Troubleshooting

- **"Invalid environment variables" / `DATABASE_URL`** — the `.env` file is missing.
  Run `bun run setup` (it recreates `.env` from `.env.example`).
- **Database looks wrong / corrupted** — run `bun run db:reset` for a clean, empty
  database. (This deletes all local data.)
- **`bun: command not found`** — use the `npm` equivalents (`npm run setup`,
  `npm run dev`), or install bun from https://bun.sh.
