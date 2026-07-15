#!/usr/bin/env node
/**
 * One-shot local setup. Safe to run any number of times.
 *
 * What it does:
 *   1. Creates `.env` from `.env.example` if it is missing.
 *   2. Installs dependencies if `node_modules` is missing.
 *   3. Creates/updates the local SQLite database (`db.sqlite`) to match the schema.
 *
 * Usage:  bun run setup   (or:  npm run setup)
 *
 * The database is a single file, `db.sqlite`, that lives in this repository.
 * It is git-ignored, so it never leaves your machine.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const say = (msg) => console.log(`\n[36m▸[0m ${msg}`);
const ok = (msg) => console.log(`[32m✓[0m ${msg}`);

/** Prefer bun (this repo ships a bun.lock), fall back to npm. */
function pickPackageManager() {
	const hasBun =
		spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;
	return hasBun ? "bun" : "npm";
}

function run(cmd, args) {
	const result = spawnSync(cmd, args, {
		cwd: root,
		stdio: "inherit",
		shell: false,
	});
	if (result.status !== 0) {
		console.error(`\n[31m✗ Command failed:[0m ${cmd} ${args.join(" ")}`);
		process.exit(result.status ?? 1);
	}
}

const pm = pickPackageManager();

// 1. Environment file --------------------------------------------------------
say("Checking environment file (.env)");
const envPath = join(root, ".env");
const envExamplePath = join(root, ".env.example");
if (existsSync(envPath)) {
	ok(".env already exists — leaving it untouched");
} else {
	copyFileSync(envExamplePath, envPath);
	ok("Created .env from .env.example");
}

// 2. Dependencies ------------------------------------------------------------
say("Checking dependencies (node_modules)");
if (existsSync(join(root, "node_modules"))) {
	ok("Dependencies already installed");
} else {
	run(pm, ["install"]);
	ok("Dependencies installed");
}

// 3. Local database ----------------------------------------------------------
say("Creating / updating local SQLite database (db.sqlite)");
// `drizzle-kit push` reads drizzle.config.ts, which points DATABASE_URL at the
// local file. It creates db.sqlite on first run and syncs the schema each time.
run(pm, ["run", "db:push"]);
ok("Database ready → db.sqlite");

console.log(`\n[32mAll set.[0m Start the app with:  [1m${pm} run dev[0m\n`);
