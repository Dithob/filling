/**
 * Restores POSIX `rmdir` semantics for WXT builds.
 *
 * Why this exists: this sandbox's filesystem layer redefines `fs.rmdir()` so
 * that calling it on a **non-empty** directory silently succeeds and removes
 * the whole tree. Real Node throws `ENOTEMPTY` instead.
 *
 * WXT's `removeEmptyDirs()` (wxt/dist/core/builders/vite/index.mjs) relies on
 * exactly that error to skip directories that still have content:
 *
 *   for (const file of await fs.readdir(dir)) {
 *     if (isDirectory(file)) await removeEmptyDirs(join(dir, file));
 *   }
 *   try { await fs.rmdir(dir); } catch { }   // <-- non-empty dirs must throw
 *
 * With broken semantics it cheerfully deletes `.output/chrome-mv3/assets` even
 * though the CSS bundles live there, and the build then dies with:
 *
 *   ENOENT: no such file or directory, lstat
 *     '.../.output/chrome-mv3/assets/AppProviders-<hash>.css'
 *
 * This shim makes `rmdir` throw `ENOTEMPTY` again, so `removeEmptyDirs()`
 * behaves as designed. On a machine with correct `rmdir` semantics it changes
 * nothing observable — the original implementation is simply delegated to.
 *
 * Loaded via `--require` from scripts/run-wxt.mjs. Safe to delete if your
 * environment implements `rmdir` correctly.
 */
const fs = require('node:fs');

const PATCHED = Symbol.for('fillo.rmdirSemantics.restored');
if (!fs[PATCHED]) {
  fs[PATCHED] = true;

  const notEmptyError = (dir) => {
    const error = new Error(`ENOTEMPTY: directory not empty, rmdir '${dir}'`);
    error.code = 'ENOTEMPTY';
    error.errno = -66;
    error.syscall = 'rmdir';
    error.path = dir;
    return error;
  };

  /** Returns null when the directory is genuinely empty, false when it has content. */
  const probe = (dir) => {
    try {
      return fs.readdirSync(dir).length === 0;
    } catch {
      // Missing or unreadable: let the original call raise the real error.
      return true;
    }
  };

  const originalRmdirSync = fs.rmdirSync;
  fs.rmdirSync = function rmdirSync(dir, options) {
    if (probe(dir)) return originalRmdirSync.call(fs, dir, options);
    throw notEmptyError(dir);
  };

  const originalRmdir = fs.rmdir;
  fs.rmdir = function rmdir(dir, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof options === 'function') {
      cb = options;
      opts = undefined;
    }
    if (probe(dir)) return originalRmdir.call(fs, dir, opts, cb);
    if (typeof cb === 'function') {
      process.nextTick(() => cb(notEmptyError(dir)));
      return undefined;
    }
    throw notEmptyError(dir);
  };

  const patchPromises = (target) => {
    if (!target || typeof target.rmdir !== 'function' || target[PATCHED]) return;
    const original = target.rmdir;
    target.rmdir = async function rmdir(dir, options) {
      if (probe(dir)) return original.call(target, dir, options);
      throw notEmptyError(dir);
    };
    target[PATCHED] = true;
  };

  patchPromises(fs.promises);
  try {
    patchPromises(require('node:fs/promises'));
  } catch {
    // Older runtimes without fs/promises: nothing to patch.
  }
}
