// -----------------------------------------------------------------------------
// Scene triggers (Gladys 5.1+): what HAPPENED on EcoleDirecte.
//
// Each sync compares what EcoleDirecte shows with the ids already seen (kept
// in /data, see src/store.js) and fires one event per new item: a grade, a
// homework, an absence or a delay, a cancelled lesson, a message. The first
// sync of a student only records what is there: installing the integration
// must not fire forty "new grade" events.
//
// The values themselves (the average, the homework count) are device features:
// a scene compares those with the standard "device state" trigger. An event
// says "this happened, with these details" (which subject, which grade).
// -----------------------------------------------------------------------------

import { studentIds } from '../devices/student.js';
import { studentName } from '../ecoledirecte/parse.js';
import { timeOf, dayOf } from '../dates.js';

/** Trigger keys, as declared in the manifest. Never renamed: scenes store them. */
export const TRIGGERS = {
  NEW_GRADE: 'new_grade',
  NEW_HOMEWORK: 'new_homework',
  NEW_ABSENCE: 'new_absence',
  LESSON_CANCELLED: 'lesson_cancelled',
  NEW_MESSAGE: 'new_message',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);

// A school that imports a whole term at once must not flood the scenes (the
// core admits 300 events a minute): beyond this, the items are only recorded.
export const MAX_EVENTS_PER_KIND = 10;

/**
 * Compare a list with the ids seen under `key`, remember the new list, and
 * return the new items. Null (nothing ever seen) is the baseline: everything
 * is recorded, nothing is new.
 */
function newItems(store, key, items) {
  const seen = store.getSeen(key);
  const ids = items.map((item) => item.id);
  if (seen === null) {
    store.setSeen(key, ids);
    return [];
  }
  const known = new Set(seen);
  const fresh = items.filter((item) => !known.has(item.id));
  // Keep the old ids too: homework and lessons leave the API's window, and an
  // item that comes back (a lesson cancelled, restored, cancelled again) must
  // not count as new twice.
  const current = new Set(ids);
  store.setSeen(key, [...seen.filter((id) => !current.has(id)), ...ids]);
  return fresh.slice(-MAX_EVENTS_PER_KIND);
}

/**
 * The scene events of one student's fresh snapshot.
 *
 * @param {object} gladys
 * @param {object} store see src/store.js
 * @param {object} snapshot see src/runtime.js
 * @param {{ nowDateTime: string }} clock
 * @returns {Array<{ key: string, data: object }>}
 */
export function studentEvents(gladys, store, snapshot, { nowDateTime }) {
  const { student } = snapshot;
  const base = {
    student: studentIds(gladys, student.id).device,
    student_name: studentName(student),
  };
  const events = [];
  const fetched = snapshot.fetched ?? {};

  if (fetched.grades) {
    for (const grade of newItems(store, `grades:${student.id}`, snapshot.grades)) {
      events.push({
        key: TRIGGERS.NEW_GRADE,
        data: {
          ...base,
          subject: grade.subject,
          assignment: grade.assignment,
          grade: grade.value,
          out_of: grade.outOf,
          grade_20: grade.value20,
          date: grade.date,
        },
      });
    }
  }
  if (fetched.homework) {
    for (const homework of newItems(store, `homework:${student.id}`, snapshot.homework)) {
      events.push({
        key: TRIGGERS.NEW_HOMEWORK,
        data: {
          ...base,
          subject: homework.subject,
          due_date: homework.date,
          is_test: homework.test,
        },
      });
    }
  }
  if (fetched.schoolLife) {
    for (const entry of newItems(store, `absences:${student.id}`, snapshot.schoolLife)) {
      events.push({
        key: TRIGGERS.NEW_ABSENCE,
        data: {
          ...base,
          kind: entry.kind,
          date: entry.date,
          label: entry.label,
          justified: entry.justified,
        },
      });
    }
  }
  if (fetched.lessons) {
    // Only the lessons still to come: a lesson cancelled last week that enters
    // the window late is news to nobody.
    const cancelled = snapshot.lessons.filter(
      (lesson) => lesson.cancelled && lesson.start > nowDateTime,
    );
    for (const lesson of newItems(store, `cancelled:${student.id}`, cancelled)) {
      events.push({
        key: TRIGGERS.LESSON_CANCELLED,
        data: {
          ...base,
          subject: lesson.subject,
          date: dayOf(lesson.start),
          start: timeOf(lesson.start),
          end: timeOf(lesson.end),
          teacher: lesson.teacher,
        },
      });
    }
  }
  return events;
}

/**
 * The scene events of an account's inbox (a family account has ONE inbox for
 * every child: the event names the account's students, not one of them).
 */
export function messageEvents(store, accountId, inbox, accountName) {
  return newItems(store, `messages:${accountId}`, inbox.messages).map((message) => ({
    key: TRIGGERS.NEW_MESSAGE,
    data: {
      from: message.from,
      subject: message.subject,
      date: message.date,
      account: accountName,
    },
  }));
}
