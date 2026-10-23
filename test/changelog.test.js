// The Release workflow rolls CHANGELOG.md with .github/scripts/changelog-release.mjs
// and pushes the result straight to main: it must stay well-formed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-ecoledirecte';
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const { version: current } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
// The release after the current one, whatever the current one is.
const next = current.replace(/\d+$/, (patch) => String(Number(patch) + 1));
const escape = (version) => version.replaceAll('.', '\\.');

test('the changelog has an Unreleased section comparing with the last release', () => {
  assert.match(changelog, /^## \[Unreleased\]$/m);
  assert.match(
    changelog,
    new RegExp(`^\\[Unreleased\\]: ${REPO}/compare/v${escape(current)}\\.\\.\\.HEAD$`, 'm'),
  );
});

test('the first release moves Unreleased under the version and links its tag', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- EcoleDirecte.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const rolled = rollChangelog(before, '1.0.1', '2026-10-15');
  assert.match(rolled, /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-15\n\n### Added/);
  assert.match(
    rolled,
    new RegExp(`^\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD$`, 'm'),
  );
  assert.match(rolled, new RegExp(`^\\[1\\.0\\.1\\]: ${REPO}/releases/tag/v1\\.0\\.1$`, 'm'));
  // Rolling the same version twice changes nothing.
  assert.equal(rollChangelog(rolled, '1.0.1', '2026-10-15'), rolled);
});

test('the next release of the real changelog compares with the last tag', () => {
  const rolled = rollChangelog(changelog, next, '2026-10-16');
  assert.match(
    rolled,
    new RegExp(`^## \\[Unreleased\\]\\n\\n## \\[${escape(next)}\\] - 2026-10-16$`, 'm'),
  );
  assert.match(
    rolled,
    new RegExp(
      `^\\[${escape(next)}\\]: ${REPO}/compare/v${escape(current)}\\.\\.\\.v${escape(next)}$`,
      'm',
    ),
  );
});

test('an empty Unreleased section still names the release', () => {
  const rolled = rollChangelog(rollChangelog(changelog, next, '2026-10-16'), '9.9.9', '2026-10-17');
  assert.match(
    rolled,
    /## \[9\.9\.9\] - 2026-10-17\n\n- Maintenance release, no functional change\./,
  );
});
