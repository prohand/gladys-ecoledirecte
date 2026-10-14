import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTION_KEYS } from '../src/capabilities/scenes.js';
import { DAYS, resolveDay } from '../src/capabilities/days.js';
import { MAX_EVENTS_PER_KIND, TRIGGERS } from '../src/capabilities/triggers.js';
import { deviceOf, setup } from './helpers/setup.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declared = (list, key) => list.find((entry) => entry.key === key);

const run = async (gladys, key, fields) => {
  const ack = await gladys.fake.sceneAction(key, fields);
  assert.equal(ack.success, true, ack.error);
  return ack.data.outputs;
};

test('get_homework: tomorrow by default, the open homework only', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const outputs = await run(gladys, SCENE_ACTION_KEYS.GET_HOMEWORK, {
    student: deviceOf(gladys, 1001),
  });
  assert.deepEqual(outputs, {
    date: '2026-10-15',
    count: 1,
    tests: 1,
    subjects: 'MATHEMATIQUES',
    // The summary speaks the language of the configuration (French by default).
    summary: 'MATHEMATIQUES (contrôle) : Réviser le chapitre 2',
  });
});

test('get_timetable: first start and last end of the next school day', async (t) => {
  const { gladys, ed, runtime, stop } = await setup();
  t.after(stop);
  ed.state.fixtures.lessons[1001][2].isAnnule = true;
  await runtime.sync();
  const outputs = await run(gladys, SCENE_ACTION_KEYS.GET_TIMETABLE, {
    student: deviceOf(gladys, 1001),
    day: DAYS.NEXT_SCHOOL_DAY,
  });
  assert.deepEqual(outputs, {
    date: '2026-10-15',
    has_lessons: true,
    lesson_count: 2,
    cancelled_count: 1,
    first_start: '11:00',
    first_subject: 'ANGLAIS',
    last_end: '14:55',
  });
});

test('a day without lessons is an output, not a failure', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const outputs = await run(gladys, SCENE_ACTION_KEYS.GET_TIMETABLE, {
    student: deviceOf(gladys, 1002),
    day: DAYS.TODAY,
  });
  assert.equal(outputs.has_lessons, false);
  assert.equal(outputs.first_start, '');
});

test('refresh synchronizes and counts what is new', async (t) => {
  const { gladys, ed, stop } = await setup();
  t.after(stop);
  ed.state.fixtures.homework[1001]['2026-10-20'] = [{ matiere: 'EPS', idDevoir: 777 }];
  const outputs = await run(gladys, SCENE_ACTION_KEYS.REFRESH, {});
  assert.deepEqual(outputs, { success: true, new_items: 1 });
});

test('an unknown student fails the action with a readable error', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const ack = await gladys.fake.sceneAction(SCENE_ACTION_KEYS.GET_HOMEWORK, {
    student: 'ext:test-integration:student:999',
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unknown student/);
});

test('outputs and event data only use declared keys', async (t) => {
  const { gladys, ed, runtime, stop } = await setup();
  t.after(stop);
  for (const key of Object.values(SCENE_ACTION_KEYS)) {
    const outputs = await run(gladys, key, { student: deviceOf(gladys, 1001) });
    const keys = declared(manifest.scene_actions, key).outputs.map((output) => output.key);
    assert.deepEqual(Object.keys(outputs).sort(), [...keys].sort(), key);
  }
  ed.state.fixtures.notes[1001].notes.push({
    id: 50,
    libelleMatiere: 'SVT',
    valeur: '10',
    dateSaisie: '2026-10-14',
  });
  ed.state.fixtures.lessons[1001][4].isAnnule = true;
  ed.state.fixtures.schoolLife[1001].absencesRetards.push({ id: 80, typeElement: 'Absence' });
  ed.state.fixtures.homework[1001]['2026-10-21'] = [{ matiere: 'EPS', idDevoir: 778 }];
  ed.state.fixtures.messages[100].messages.received.push({ id: 950, subject: 'x' });
  await runtime.sync();
  assert.equal(gladys.fake.sceneEvents.length, Object.keys(TRIGGERS).length);
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declared(manifest.scene_triggers, key);
    const allowed = [...(trigger.fields ?? []), ...(trigger.variables ?? [])].map((f) => f.key);
    for (const name of Object.keys(data)) {
      assert.ok(allowed.includes(name), `${key}.${name} is not declared`);
    }
    assert.ok(Object.keys(data).length <= 30);
  }
});

test('a whole term imported at once fires a bounded number of events', async (t) => {
  const { gladys, ed, runtime, stop } = await setup();
  t.after(stop);
  for (let i = 0; i < 40; i += 1) {
    ed.state.fixtures.notes[1001].notes.push({
      id: 1000 + i,
      libelleMatiere: 'MATHEMATIQUES',
      valeur: '12',
      dateSaisie: '2026-10-14',
    });
  }
  await runtime.sync();
  const grades = gladys.fake.sceneEvents.filter((event) => event.key === TRIGGERS.NEW_GRADE);
  assert.equal(grades.length, MAX_EVENTS_PER_KIND);
});

test('the next school day skips the weekend and cancelled days', () => {
  // 2026-10-16 is a Friday.
  assert.equal(resolveDay(DAYS.NEXT_SCHOOL_DAY, null, '2026-10-16'), '2026-10-19');
  const snapshot = {
    lessons: [
      { start: '2026-10-19 08:00', cancelled: true },
      { start: '2026-10-20 08:00', cancelled: false },
    ],
  };
  assert.equal(resolveDay(DAYS.NEXT_SCHOOL_DAY, snapshot, '2026-10-16'), '2026-10-20');
  assert.equal(resolveDay(DAYS.TODAY, snapshot, '2026-10-16'), '2026-10-16');
  assert.equal(resolveDay(DAYS.TOMORROW, snapshot, '2026-10-16'), '2026-10-17');
});
