// The Release workflow rolls CHANGELOG.md with .github/scripts/changelog-release.mjs
// and pushes the result straight to main: it must stay well-formed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-ecoledirect';
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

test('the changelog has an Unreleased section and no hand-written version', () => {
  assert.match(changelog, /^## \[Unreleased\]$/m);
  assert.match(changelog, new RegExp(`^\\[Unreleased\\]: ${REPO}/commits/main$`, 'm'));
});

test('the first release moves Unreleased under the version and links its tag', () => {
  const rolled = rollChangelog(changelog, '1.0.1', '2026-10-15');
  assert.match(rolled, /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-15\n\n### Added/);
  assert.match(
    rolled,
    new RegExp(`^\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD$`, 'm'),
  );
  assert.match(rolled, new RegExp(`^\\[1\\.0\\.1\\]: ${REPO}/releases/tag/v1\\.0\\.1$`, 'm'));
  // Rolling the same version twice changes nothing.
  assert.equal(rollChangelog(rolled, '1.0.1', '2026-10-15'), rolled);
});

test('an empty Unreleased section still names the release', () => {
  const rolled = rollChangelog(
    rollChangelog(changelog, '1.0.1', '2026-10-15'),
    '1.0.2',
    '2026-10-16',
  );
  assert.match(
    rolled,
    /## \[1\.0\.2\] - 2026-10-16\n\n- Maintenance release, no functional change\./,
  );
  assert.match(
    rolled,
    new RegExp(`^\\[1\\.0\\.2\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.v1\\.0\\.2$`, 'm'),
  );
});
