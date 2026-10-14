// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data.
//
// The container rootfs is read-only and /data is the one writable volume. Two
// things live there:
//   - the "cn"/"cv" pair EcoleDirecte hands out once the security question
//     (double authentication) is answered. They are reusable: keeping them
//     spares the user the question at every restart. They are tied to the
//     username they were obtained for.
//   - the ids already seen (grades, homework, absences, messages, cancelled
//     lessons), so a restart does not fire the "new grade" trigger for every
//     grade of the year.
//
// A store that cannot write (local development, no /data) keeps working in
// memory: it logs once and carries on.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'store' });

export const DEFAULT_DATA_DIR = '/data';
const FILE_NAME = 'ecoledirecte.json';

/**
 * Create the store.
 * @param {{ dir?: string | null }} [options] `dir: null` keeps everything in memory (tests)
 */
export function createStore({ dir = process.env.ECOLEDIRECTE_DATA_DIR || DEFAULT_DATA_DIR } = {}) {
  const path = dir ? join(dir, FILE_NAME) : null;
  let data = { doubleAuth: null, seen: {} };
  let warned = false;

  if (path) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8'));
      data = { doubleAuth: parsed.doubleAuth ?? null, seen: parsed.seen ?? {} };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Cannot read ${path}, starting from scratch: ${err.message}`);
      }
    }
  }

  function save() {
    if (!path) {
      return;
    }
    try {
      mkdirSync(dir, { recursive: true });
      // Write then rename: a crash mid-write never leaves a truncated file.
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
      renameSync(tmp, path);
    } catch (err) {
      if (!warned) {
        warned = true;
        logger.warn(`Cannot write ${path}, state kept in memory only: ${err.message}`);
      }
    }
  }

  return {
    /** The saved double-authentication pair for this username, or null. */
    getDoubleAuth(username) {
      const saved = data.doubleAuth;
      return saved && saved.username === username && saved.cn && saved.cv
        ? { cn: saved.cn, cv: saved.cv }
        : null;
    },
    setDoubleAuth(username, { cn, cv }) {
      data.doubleAuth = { username, cn, cv };
      save();
    },
    clearDoubleAuth() {
      if (data.doubleAuth) {
        data.doubleAuth = null;
        save();
      }
    },
    /** The ids already seen under a key, or null when nothing was ever seen. */
    getSeen(key) {
      return Array.isArray(data.seen[key]) ? data.seen[key] : null;
    },
    /** Remember the ids seen under a key (bounded: the newest are kept). */
    setSeen(key, ids, max = 3000) {
      data.seen[key] = ids.slice(-max);
    },
    save,
  };
}
