// -----------------------------------------------------------------------------
// Device type: STUDENT
//
// One Gladys device per child followed on EcoleDirecte (a student account is
// one child, a family account one per child). Its features are the figures a
// household looks at: the general average and the last grade, the homework due
// tomorrow, the next lesson, absences and delays, unread messages.
//
// External ids are built from the EcoleDirecte student id, the one value that
// never changes (names, classes and schools do): `externalIds('student', id)`.
// Feature keys are forever too: Gladys keys the history, the scenes and the
// dashboards on them.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { addDays, shortDate, timeOf, dayOf } from '../dates.js';
import { pick } from '../i18n.js';
import { studentName } from '../ecoledirecte/parse.js';

export const DEVICE_TYPE = 'student';

/** Feature keys. Never renamed: Gladys stores them. */
export const FEATURES = {
  AVERAGE: 'average',
  LAST_GRADE: 'last-grade',
  LAST_GRADE_TEXT: 'last-grade-text',
  HOMEWORK_TOMORROW: 'homework-tomorrow',
  HOMEWORK_PENDING: 'homework-pending',
  NEXT_LESSON: 'next-lesson',
  ABSENCES: 'absences',
  DELAYS: 'delays',
  UNREAD_MESSAGES: 'unread-messages',
};

// Feature names, in the language chosen in the configuration: a feature name
// is a plain string in Gladys, written once when the device is created.
const FEATURE_NAMES = {
  [FEATURES.AVERAGE]: {
    en: 'General average',
    fr: 'Moyenne générale',
    de: 'Gesamtdurchschnitt',
    es: 'Media general',
  },
  [FEATURES.LAST_GRADE]: {
    en: 'Last grade (/20)',
    fr: 'Dernière note (/20)',
    de: 'Letzte Note (/20)',
    es: 'Última nota (/20)',
  },
  [FEATURES.LAST_GRADE_TEXT]: {
    en: 'Last grade',
    fr: 'Dernière note',
    de: 'Letzte Note',
    es: 'Última nota',
  },
  [FEATURES.HOMEWORK_TOMORROW]: {
    en: 'Homework for tomorrow',
    fr: 'Devoirs pour demain',
    de: 'Hausaufgaben für morgen',
    es: 'Deberes para mañana',
  },
  [FEATURES.HOMEWORK_PENDING]: {
    en: 'Homework to do',
    fr: 'Devoirs à faire',
    de: 'Offene Hausaufgaben',
    es: 'Deberes pendientes',
  },
  [FEATURES.NEXT_LESSON]: {
    en: 'Next lesson',
    fr: 'Prochain cours',
    de: 'Nächste Stunde',
    es: 'Próxima clase',
  },
  [FEATURES.ABSENCES]: { en: 'Absences', fr: 'Absences', de: 'Fehlzeiten', es: 'Ausencias' },
  [FEATURES.DELAYS]: { en: 'Delays', fr: 'Retards', de: 'Verspätungen', es: 'Retrasos' },
  [FEATURES.UNREAD_MESSAGES]: {
    en: 'Unread messages',
    fr: 'Messages non lus',
    de: 'Ungelesene Nachrichten',
    es: 'Mensajes no leídos',
  },
};

const NONE = { en: 'None', fr: 'Aucun', de: 'Keine', es: 'Ninguna' };

const grade = (key) => ({
  category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
  type: DEVICE_FEATURE_TYPES.SENSOR.DECIMAL,
  min: 0,
  max: 20,
  key,
});
const counter = (key, max = 1000) => ({
  category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
  type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
  min: 0,
  max,
  key,
});
const text = (key) => ({
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  // min/max are NOT NULL in Gladys, even for a text.
  min: 0,
  max: 0,
  key,
});

const FEATURE_SPECS = [
  grade(FEATURES.AVERAGE),
  grade(FEATURES.LAST_GRADE),
  text(FEATURES.LAST_GRADE_TEXT),
  counter(FEATURES.HOMEWORK_TOMORROW, 100),
  counter(FEATURES.HOMEWORK_PENDING),
  text(FEATURES.NEXT_LESSON),
  counter(FEATURES.ABSENCES),
  counter(FEATURES.DELAYS),
  counter(FEATURES.UNREAD_MESSAGES),
];

export function studentIds(gladys, studentId) {
  return gladys.externalIds(DEVICE_TYPE, String(studentId));
}

/** The discovery payload of one student. */
export function buildStudentDevice(gladys, student, language = 'fr') {
  const ids = studentIds(gladys, student.id);
  return {
    name: studentName(student),
    external_id: ids.device,
    // No `should_poll`: the integration drives its own refresh (one API sync
    // for every student, at the pace of the configuration), see src/runtime.js.
    params: [
      { name: 'class', value: student.className || '-' },
      { name: 'school', value: student.school || '-' },
    ],
    features: FEATURE_SPECS.map(({ key, ...spec }) => ({
      name: pick(language, FEATURE_NAMES[key]),
      external_id: ids.feature(key),
      ...spec,
      read_only: true,
      has_feedback: false,
      // Texts change often and say little over time: no history for them.
      keep_history: spec.category !== DEVICE_FEATURE_CATEGORIES.TEXT,
    })),
  };
}

/** "Mathématiques : 15/20 (Contrôle chapitre 3)". */
export function describeGrade(entry) {
  if (!entry) {
    return '';
  }
  const value = `${entry.value}/${entry.outOf}`;
  const assignment = entry.assignment ? ` (${entry.assignment})` : '';
  return `${entry.subject} : ${value}${assignment}`.slice(0, 250);
}

/** The next lesson not cancelled, after `nowDateTime` ("YYYY-MM-DD HH:mm"). */
export function nextLesson(snapshot, nowDateTime) {
  return (snapshot?.lessons ?? []).find(
    (lesson) => !lesson.cancelled && lesson.start > nowDateTime,
  );
}

/** "08:00 MATHEMATIQUES (S12)", prefixed with the day when it is not today. */
export function describeLesson(lesson, today) {
  if (!lesson) {
    return '';
  }
  const day = dayOf(lesson.start) === today ? '' : `${shortDate(dayOf(lesson.start))} `;
  const room = lesson.room ? ` (${lesson.room})` : '';
  return `${day}${timeOf(lesson.start)} ${lesson.subject}${room}`.slice(0, 250);
}

/**
 * The states of one student, from its last snapshot. Sections the API never
 * delivered (module switched off by the school) publish nothing.
 *
 * @param {object} gladys
 * @param {object} snapshot see src/runtime.js
 * @param {{ today: string, nowDateTime: string, language: string }} clock
 */
export function studentStates(gladys, snapshot, { today, nowDateTime, language }) {
  const ids = studentIds(gladys, snapshot.student.id);
  const states = [];
  const number = (key, value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      states.push({ device_feature_external_id: ids.feature(key), state: value });
    }
  };
  const textState = (key, value) =>
    states.push({ device_feature_external_id: ids.feature(key), text: value });

  if (snapshot.grades) {
    number(FEATURES.AVERAGE, snapshot.averages?.average);
    const last = snapshot.grades.at(-1);
    if (last) {
      number(FEATURES.LAST_GRADE, last.value20);
      textState(FEATURES.LAST_GRADE_TEXT, describeGrade(last));
    }
  }
  if (snapshot.homework) {
    const tomorrow = addDays(today, 1);
    const open = snapshot.homework.filter((entry) => !entry.done && entry.date >= today);
    number(FEATURES.HOMEWORK_TOMORROW, open.filter((entry) => entry.date === tomorrow).length);
    number(FEATURES.HOMEWORK_PENDING, open.length);
  }
  if (snapshot.lessons) {
    const next = nextLesson(snapshot, nowDateTime);
    textState(FEATURES.NEXT_LESSON, next ? describeLesson(next, today) : pick(language, NONE));
  }
  if (snapshot.schoolLife) {
    number(FEATURES.ABSENCES, snapshot.schoolLife.filter((e) => e.kind === 'absence').length);
    number(FEATURES.DELAYS, snapshot.schoolLife.filter((e) => e.kind === 'delay').length);
  }
  if (snapshot.messages) {
    number(FEATURES.UNREAD_MESSAGES, snapshot.messages.unread);
  }
  return states;
}
