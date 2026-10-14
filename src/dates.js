// -----------------------------------------------------------------------------
// Dates, in the school's time zone.
//
// EcoleDirecte writes every date as local wall-clock text ("2026-10-14",
// "2026-10-14 08:00"), with no zone. The container runs in UTC, so "today",
// "tomorrow" and "the next lesson" are computed in the zone the user chose,
// and compared as text: "YYYY-MM-DD HH:mm" sorts like time.
// -----------------------------------------------------------------------------

/**
 * Local date and time of an instant in a time zone.
 * @param {Date} date
 * @param {string} timeZone IANA zone, e.g. Europe/Paris
 * @returns {{ date: string, time: string, dateTime: string }}
 */
export function localParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}:${parts.minute}`;
  return { date: day, time, dateTime: `${day} ${time}` };
}

/**
 * Add days to a "YYYY-MM-DD" date (calendar arithmetic, no time zone).
 * @param {string} day
 * @param {number} count
 */
export function addDays(day, count) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

/** "2026-10-14" -> "14/10" (the way French schools write it). */
export function shortDate(day) {
  const [, month, date] = String(day).split('-');
  return month && date ? `${date}/${month}` : String(day);
}

/** "2026-10-14 08:00" -> "08:00". */
export function timeOf(dateTime) {
  return String(dateTime ?? '').slice(11, 16);
}

/** "2026-10-14 08:00" -> "2026-10-14". */
export function dayOf(dateTime) {
  return String(dateTime ?? '').slice(0, 10);
}
