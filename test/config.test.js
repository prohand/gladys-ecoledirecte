import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasCredentials, normalizeConfig } from '../src/config.js';
import { localize, pick } from '../src/i18n.js';
import { addDays, localParts, shortDate } from '../src/dates.js';

test('the defaults apply to an empty config', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(hasCredentials(normalizeConfig()), false);
});

test('values typed in the form are normalized', () => {
  const config = normalizeConfig({
    username: '  jdupont ',
    password: ' secret ',
    refresh_minutes: '5',
    timezone: 'Mars/Olympus',
    language: 'it',
  });
  assert.equal(config.username, 'jdupont');
  assert.equal(config.password, ' secret ', 'a password is never trimmed');
  assert.equal(config.refresh_minutes, 10, 'clamped to the minimum');
  assert.equal(config.timezone, 'Europe/Paris', 'unknown zone -> default');
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ refresh_minutes: 'abc' }).refresh_minutes, 30);
  assert.equal(normalizeConfig({ refresh_minutes: 10_000 }).refresh_minutes, 720);
  assert.equal(normalizeConfig({ timezone: 'America/Martinique' }).timezone, 'America/Martinique');
});

test('pick falls back to English, localize builds every language', () => {
  assert.equal(pick('it', { en: 'Hello', fr: 'Bonjour' }), 'Hello');
  assert.deepEqual(
    localize((language) => language.toUpperCase()),
    { en: 'EN', fr: 'FR', de: 'DE', es: 'ES' },
  );
});

test('dates are computed in the school time zone', () => {
  const instant = new Date('2026-03-29T00:30:00Z');
  assert.deepEqual(localParts(instant, 'Europe/Paris'), {
    date: '2026-03-29',
    time: '01:30',
    dateTime: '2026-03-29 01:30',
  });
  assert.equal(localParts(instant, 'America/Martinique').date, '2026-03-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(shortDate('2026-10-15'), '15/10');
});
