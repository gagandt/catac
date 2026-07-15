#!/usr/bin/env node
/**
 * Wipes the local SQLite database and recreates it empty from the schema.
 * Use when you want a clean slate.  All local data is deleted.
 *
 * Usage:  bun run db:reset   (or:  npm run db:reset)
 */

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hasBun =
	spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;
const pm = hasBun ? "bun" : "npm";

// db.sqlite plus the possible write-ahead-log sidecar files.
for (const f of [
	"db.sqlite",
	"db.sqlite-journal",
	"db.sqlite-wal",
	"db.sqlite-shm",
]) {
	const p = join(root, f);
	if (existsSync(p)) {
		rmSync(p);
		console.log(`[31m✗ removed[0m ${f}`);
	}
}

const result = spawnSync(pm, ["run", "db:push"], {
	cwd: root,
	stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("\n[32m✓ Fresh database ready → db.sqlite[0m\n");
