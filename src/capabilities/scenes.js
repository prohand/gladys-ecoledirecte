// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+): operations a scene author places in a scene.
//
//   - refresh        : synchronize with EcoleDirecte now (before reading a
//                      device state in the same scene, say);
//   - get_homework   : the homework due on a day, as outputs a scene can
//                      read aloud or send ({{...summary}}), or gate on (count);
//   - get_timetable  : the lessons of a day: first start, last end, how many
//                      are cancelled — the morning alarm of a school day.
//
// `fields` arrive RESOLVED (the student is the chosen device external_id).
// Outputs are scalars. A scene action is never a condition: "no lesson" is an
// output (`has_lessons: false`), not a failure.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { pick } from '../i18n.js';
import { timeOf } from '../dates.js';
import { DAYS, homeworkOn, lessonsOn, resolveDay } from './days.js';

const logger = createLogger({ name: 'scenes' });

/** Scene action keys, as declared in the manifest. Never renamed. */
export const SCENE_ACTION_KEYS = {
  REFRESH: 'refresh',
  GET_HOMEWORK: 'get_homework',
  GET_TIMETABLE: 'get_timetable',
};

const TEST = { en: 'test', fr: 'contrôle', de: 'Test', es: 'examen' };
const SUMMARY_MAX = 2000;

/** The snapshot of the chosen student, or a clear error for the scene log. */
function snapshotOf(runtime, externalId) {
  const snapshot = runtime.snapshotByDevice(externalId);
  if (!snapshot) {
    throw new Error(
      `Unknown student "${externalId}", or EcoleDirecte not synchronized yet: check the integration's connection status.`,
    );
  }
  return snapshot;
}

/** "MATHEMATIQUES (contrôle) : Exercices 3 et 4 p. 52" — one line per homework. */
export function summarizeHomework(entries, language) {
  return entries
    .map((entry) => {
      const test = entry.test ? ` (${pick(language, TEST)})` : '';
      const content = entry.content ? ` : ${entry.content.replace(/\s*\n\s*/g, ' ')}` : '';
      return `${entry.subject}${test}${content}`;
    })
    .join('\n')
    .slice(0, SUMMARY_MAX);
}

export const SCENE_ACTIONS = {
  async [SCENE_ACTION_KEYS.REFRESH](runtime) {
    logger.info('Scene action refresh');
    // The events this sync fires are one per NEW item: a scene bound to
    // "new grade" that calls refresh cannot loop, the second sync finds
    // nothing new.
    const result = await runtime.sync();
    return { success: result.ok === true, new_items: result.events ?? 0 };
  },

  async [SCENE_ACTION_KEYS.GET_HOMEWORK](runtime, { fields }) {
    const snapshot = snapshotOf(runtime, fields.student);
    const { today, language } = runtime.clock();
    const date = resolveDay(fields.day ?? DAYS.TOMORROW, snapshot, today);
    const todo = homeworkOn(snapshot, date).filter((entry) => !entry.done);
    return {
      date,
      count: todo.length,
      tests: todo.filter((entry) => entry.test).length,
      subjects: [...new Set(todo.map((entry) => entry.subject))].join(', '),
      summary: summarizeHomework(todo, language),
    };
  },

  async [SCENE_ACTION_KEYS.GET_TIMETABLE](runtime, { fields }) {
    const snapshot = snapshotOf(runtime, fields.student);
    const { today } = runtime.clock();
    const date = resolveDay(fields.day ?? DAYS.TOMORROW, snapshot, today);
    const lessons = lessonsOn(snapshot, date);
    const held = lessons.filter((lesson) => !lesson.cancelled);
    return {
      date,
      has_lessons: held.length > 0,
      lesson_count: held.length,
      cancelled_count: lessons.length - held.length,
      first_start: held.length ? timeOf(held[0].start) : '',
      first_subject: held.length ? held[0].subject : '',
      last_end: held.length ? timeOf(held.at(-1).end) : '',
    };
  },
};
