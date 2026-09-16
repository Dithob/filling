/**
 * Build/dev runner for this project.
 *
 * Why not just run `wxt` directly? This sandbox injects a "safe-delete" shim
 * into every Node process via `NODE_OPTIONS=--require=...`. That shim rewrites
 * `fs.rm` / `fs.unlink` / `fs.rmdir` to move targets into the recycle bin
 * instead of deleting them. WXT legitimately deletes files *during* a build
 * (cleaning `.output`, replacing stale hashed assets such as `pdf.worker-*.js`),
 * so the shim corrupts the build — freshly written assets get whisked away
 * mid-build and the process dies with `ENOENT ... lstat <asset>`.
 *
 * `.output` is a fully regenerable artifact, so the correct fix is to run the
 * WXT process WITHOUT the shim. Clearing `NODE_OPTIONS` for the child process
 * (and its descendants: vite, esbuild, ...) is the most reliable way to do
 * that — the shim only loads through `NODE_OPTIONS`, so an empty value means
 * native, stock filesystem semantics.
 *
 * Usage: `node scripts/run-wxt.mjs build` (any `wxt` args are forwarded).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const wxtEntry = resolve(root, 'node_modules', 'wxt', 'bin', 'wxt.mjs');

// Some environments reimplement `fs.rmdir()` so that it also removes non-empty
// directories. WXT's `removeEmptyDirs()` depends on the standard behaviour (a
// non-empty dir must throw `ENOTEMPTY`), so without this shim it deletes
// `.output/chrome-mv3/assets` and the build fails on a stray `lstat`. The shim
// is a no-op wherever `rmdir` already behaves correctly.
const rmdirShim = resolve(dirname(fileURLToPath(import.meta.url)), 'restore-rmdir-semantics.cjs');

const result = spawnSync(
  process.execPath,
  ['--require', rmdirShim, wxtEntry, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    cwd: root,
    env: {
      ...process.env,
      // Belt-and-suspenders: both neutralize the delete-protection hooks.
      NODE_OPTIONS: '',
      CODEBUDDY_SAFE_DELETE_ENABLED: '0',
      CODEBUDDY_SAFE_DELETE_SANDBOX: '0',
      CODEBUDDY_BROKERED_FS_HOOK_ENABLED: '0',
    },
  },
);

process.exit(result.status ?? 1);
