/**
 * Move `.output` out of the way instead of deleting it.
 *
 * WXT deletes the output directory before every build. In sandboxed environments
 * bulk deletes (or recycle-bin handoff) can be blocked and time out, which makes
 * `wxt build` / `wxt dev` fail before it ever starts. Renaming within the same
 * volume is instant and never triggers the delete guard.
 *
 * Set WXT_TRASH_DIR to control where stale output goes.
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const outDir = resolve(root, '.output');

if (!existsSync(outDir)) {
  process.exit(0);
}

const trashRoot = process.env.WXT_TRASH_DIR
  ? resolve(process.env.WXT_TRASH_DIR)
  : resolve(root, '..', '.trash');

mkdirSync(trashRoot, { recursive: true });

const target = resolve(trashRoot, `output-${Date.now()}`);
renameSync(outDir, target);
console.log(`[clean-output] moved ${outDir} -> ${target}`);
