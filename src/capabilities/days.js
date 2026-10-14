// -----------------------------------------------------------------------------
// "Which day?" — shared by the scene actions and the widgets.
//
// A scene that wakes a child up asks for "the next school day", not a date:
// the first day after today with a lesson that is not cancelled, read from the
// timetable (two weeks ahead). Without timetable, the next weekday.
// -----------------------------------------------------------------------------

import { addDays, dayOf } from '../dates.js';

/** Day choices, as declared in the manifest. Never renamed: scenes store them. */
export const DAYS = {
  TODAY: 'today',
  TOMORROW: 'tomorrow',
  NEXT_SCHOOL_DAY: 'next_school_day',
};

export const DAY_LABELS = {
  [DAYS.TODAY]: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  [DAYS.TOMORROW]: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  [DAYS.NEXT_SCHOOL_DAY]: {
    en: 'Next school day',
    fr: 'Prochain jour de classe',
    de: 'Nächster Schultag',
    es: 'Próximo día de clase',
  },
};

function nextWeekday(today) {
  let day = addDays(today, 1);
  while ([0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())) {
    day = addDays(day, 1);
  }
  return day;
}

/**
 * The date ("YYYY-MM-DD") a day choice stands for.
 * @param {string} choice a value of {@link DAYS}
 * @param {object | null} snapshot the student's snapshot (for its timetable)
 * @param {string} today
 */
export function resolveDay(choice, snapshot, today) {
  if (choice === DAYS.TODAY) {
    return today;
  }
  if (choice === DAYS.NEXT_SCHOOL_DAY) {
    const lesson = (snapshot?.lessons ?? []).find(
      (entry) => !entry.cancelled && dayOf(entry.start) > today,
    );
    return lesson ? dayOf(lesson.start) : nextWeekday(today);
  }
  return addDays(today, 1);
}

/** The lessons of one day, in time order. */
export function lessonsOn(snapshot, day) {
  return (snapshot?.lessons ?? []).filter((lesson) => dayOf(lesson.start) === day);
}

/** The homework due on one day. */
export function homeworkOn(snapshot, day) {
  return (snapshot?.homework ?? []).filter((entry) => entry.date === day);
}
