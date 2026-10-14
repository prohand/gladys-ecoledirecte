// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the `config_schema` of the manifest. This module
// provides the defaults and normalizes what Gladys sends, so the rest of the
// code never deals with `undefined`, strings typed in a number field or an
// unknown time zone.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  // Minutes between two synchronizations with EcoleDirecte. The school
  // platform is not a real-time service: a grade or a homework appears a few
  // times a day, and a gentle pace keeps the account clear of any rate limit.
  refresh_minutes: 30,
  // The school's time zone: "today", "tomorrow" and the timetable hours are
  // the school's, whatever time zone the Gladys host runs in.
  timezone: 'Europe/Paris',
  // Language of the device and feature names (plain strings in Gladys).
  language: 'fr',
};

export const REFRESH_MINUTES = { MIN: 10, MAX: 720 };

/** True when the runtime knows this IANA time zone. */
export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const refresh = Number(raw.refresh_minutes ?? DEFAULT_CONFIG.refresh_minutes);
  const timezone = String(raw.timezone ?? '').trim();
  const language = String(raw.language ?? '').trim();
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? '').trim(),
    // Never trimmed: a password may legitimately start or end with a space.
    password: String(raw.password ?? ''),
    refresh_minutes: Number.isFinite(refresh)
      ? Math.min(REFRESH_MINUTES.MAX, Math.max(REFRESH_MINUTES.MIN, Math.round(refresh)))
      : DEFAULT_CONFIG.refresh_minutes,
    timezone: timezone && isValidTimeZone(timezone) ? timezone : DEFAULT_CONFIG.timezone,
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
  };
}

/** True when the credentials needed to log in are there. */
export function hasCredentials(config) {
  return Boolean(config.username && config.password);
}
