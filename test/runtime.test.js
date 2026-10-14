import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { FEATURES } from '../src/devices/student.js';
import { TRIGGERS } from '../src/capabilities/triggers.js';
import { lesson } from './helpers/fakeEcoleDirecte.js';
import { deviceOf, setup } from './helpers/setup.js';

const feature = (gladys, studentId, key) => `${deviceOf(gladys, studentId)}:${key}`;

test('the first sync publishes one device per child, its states, and no event', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);

  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Emma MARTIN', 'Léo MARTIN'],
  );
  assert.equal(gladys.fake.lastState(feature(gladys, 1001, FEATURES.AVERAGE)), 14.25);
  // Last grade entered: the dictation, 7/10 -> 14/20.
  assert.equal(gladys.fake.lastState(feature(gladys, 1001, FEATURES.LAST_GRADE)), 14);
  assert.equal(gladys.fake.lastState(feature(gladys, 1001, FEATURES.HOMEWORK_TOMORROW)), 1);
  assert.equal(gladys.fake.lastState(feature(gladys, 1001, FEATURES.HOMEWORK_PENDING)), 2);
  assert.equal(gladys.fake.lastState(feature(gladys, 1001, FEATURES.ABSENCES)), 1);
  assert.equal(gladys.fake.lastState(feature(gladys, 1001, FEATURES.DELAYS)), 1);
  assert.equal(gladys.fake.lastState(feature(gladys, 1001, FEATURES.UNREAD_MESSAGES)), 1);
  // Installing the integration fires nothing: the existing items are the baseline.
  assert.deepEqual(gladys.fake.sceneEvents, []);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('the text features carry the last grade and the next lesson', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const texts = gladys.fake.states.filter((state) => typeof state.text === 'string');
  const textOf = (key) =>
    texts.findLast((state) => state.device_feature_external_id === feature(gladys, 1001, key))
      ?.text;
  assert.equal(textOf(FEATURES.LAST_GRADE_TEXT), 'FRANCAIS : 7/10 (Dictée)');
  // 08:30 in Paris: the 08:00 lesson started, the 09:00 one is next.
  assert.equal(textOf(FEATURES.NEXT_LESSON), '09:00 FRANCAIS (S04)');
});

test('a module switched off by the school publishes nothing for it', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  assert.equal(gladys.fake.lastState(feature(gladys, 1002, FEATURES.AVERAGE)), undefined);
  assert.equal(gladys.fake.lastState(feature(gladys, 1002, FEATURES.ABSENCES)), 0);
});

test('a new grade, homework, absence, message and cancelled lesson each fire one event', async (t) => {
  const { gladys, runtime, ed, stop } = await setup();
  t.after(stop);
  const { fixtures } = ed.state;
  fixtures.notes[1001].notes.push({
    id: 4,
    devoir: 'Évaluation',
    codePeriode: 'A001',
    codeMatiere: 'SVT',
    libelleMatiere: 'SVT',
    coef: '2',
    noteSur: '20',
    valeur: '18',
    date: '2026-10-13',
    dateSaisie: '2026-10-14',
  });
  fixtures.homework[1001]['2026-10-17'] = [
    { matiere: 'SVT', idDevoir: 504, donneLe: '2026-10-14', effectue: false, interrogation: true },
  ];
  fixtures.schoolLife[1001].absencesRetards.push({
    id: 72,
    typeElement: 'Retard',
    date: '2026-10-14',
    displayDate: '14 oct.',
  });
  fixtures.messages[100].messages.received.unshift({
    id: 901,
    subject: 'Réunion parents-professeurs',
    from: { name: 'Vie scolaire' },
    date: '2026-10-14 08:00:00',
    read: false,
  });
  fixtures.lessons[1001][3].isAnnule = true;

  const result = await runtime.sync();
  assert.equal(result.ok, true);
  const byKey = Object.groupBy(gladys.fake.sceneEvents, (event) => event.key);
  assert.deepEqual(Object.keys(byKey).sort(), Object.values(TRIGGERS).sort());

  const grade = byKey[TRIGGERS.NEW_GRADE][0].data;
  assert.equal(grade.student, deviceOf(gladys, 1001));
  assert.equal(grade.student_name, 'Emma MARTIN');
  assert.equal(grade.subject, 'SVT');
  assert.equal(grade.grade, 18);
  assert.equal(grade.grade_20, 18);
  assert.equal(byKey[TRIGGERS.NEW_HOMEWORK][0].data.is_test, true);
  assert.equal(byKey[TRIGGERS.NEW_ABSENCE][0].data.kind, 'delay');
  assert.equal(byKey[TRIGGERS.NEW_MESSAGE][0].data.from, 'Vie scolaire');
  assert.equal(byKey[TRIGGERS.NEW_MESSAGE][0].data.account, 'Emma MARTIN, Léo MARTIN');
  const cancelled = byKey[TRIGGERS.LESSON_CANCELLED][0].data;
  assert.deepEqual(
    [cancelled.subject, cancelled.date, cancelled.start],
    ['ANGLAIS', '2026-10-15', '11:00'],
  );

  // The same items a second time: nothing new.
  const before = gladys.fake.sceneEvents.length;
  await runtime.sync();
  assert.equal(gladys.fake.sceneEvents.length, before);
});

test('after a restart, only what appeared meanwhile fires', async (t) => {
  const store = createStore({ dir: null });
  const first = await setup({ store });
  first.stop();
  // Same store (as /data survives a restart), new process.
  const second = await setup({ store, connect: false });
  t.after(second.stop);
  second.ed.state.fixtures.notes[1001].notes.push({
    id: 9,
    devoir: 'Quiz',
    libelleMatiere: 'MATHEMATIQUES',
    noteSur: '20',
    valeur: '12',
    dateSaisie: '2026-10-14',
  });
  await second.gladys.connect();
  assert.deepEqual(
    second.gladys.fake.sceneEvents.map((event) => [event.key, event.data.assignment]),
    [[TRIGGERS.NEW_GRADE, 'Quiz']],
  );
});

test('the store survives a real restart on disk', async (t) => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'ecoledirecte-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const store = createStore({ dir });
  store.setDoubleAuth('claire', { cn: 'a', cv: 'b' });
  store.setSeen('grades:1', ['1', '2']);
  store.save();

  const reloaded = createStore({ dir });
  assert.deepEqual(reloaded.getDoubleAuth('claire'), { cn: 'a', cv: 'b' });
  assert.equal(reloaded.getDoubleAuth('someone-else'), null);
  assert.deepEqual(reloaded.getSeen('grades:1'), ['1', '2']);
});

test('an expired token logs in again once, transparently', async (t) => {
  const { runtime, ed, stop } = await setup();
  t.after(stop);
  const logins = ed.state.logins.length;
  ed.state.expireTokens = true;
  const result = await runtime.sync();
  assert.equal(result.ok, true);
  assert.equal(ed.state.logins.length, logins + 1);
});

test('EcoleDirecte unreachable: devices go unreachable, the status says why', async (t) => {
  const { gladys, runtime, ed, stop } = await setup();
  t.after(stop);
  ed.state.down = true;
  // A fresh session, so the failure happens at login.
  runtime.setConfig({ ...runtime.config, password: 'other' });
  runtime.setConfig({ ...runtime.config, password: ed.state.password });
  const result = await runtime.sync();
  assert.equal(result.ok, false);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /injoignable/);
});

test('wrong credentials are reported on the Configuration screen', async (t) => {
  const { gladys, stop } = await setup({ config: { password: 'wrong' } });
  t.after(stop);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the username or the password/);
  assert.deepEqual(gladys.fake.discoveredDevices, []);
});

test('without credentials, the status asks for them and nothing is called', async (t) => {
  const { gladys, ed, stop } = await setup({ config: { username: '', password: '' } });
  t.after(stop);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /username and password/);
  assert.equal(ed.state.calls.length, 0);
});

test('a lesson cancelled in the past fires nothing', async (t) => {
  const { gladys, runtime, ed, stop } = await setup();
  t.after(stop);
  // 08:00 today is over at 08:30.
  ed.state.fixtures.lessons[1001][0].isAnnule = true;
  await runtime.sync();
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('the timetable window starts today in the school time zone', async (t) => {
  const { ed, clock, runtime, stop } = await setup();
  t.after(stop);
  // 23:30 UTC on the 14th is already the 15th in Paris.
  clock.now = new Date('2026-10-14T23:30:00Z');
  ed.state.fixtures.lessons[1001].push(lesson(16, 'EPS', '2026-10-16 08:00', '2026-10-16 09:55'));
  await runtime.sync();
  const call = ed.state.calls.findLast((entry) => entry.path === 'E/1001/emploidutemps.awp');
  assert.equal(call.data.dateDebut, '2026-10-15');
  assert.equal(call.data.dateFin, '2026-10-28');
});

test('the homework contents are read once per due date, then cached', async (t) => {
  const { runtime, ed, stop } = await setup();
  t.after(stop);
  const details = () =>
    ed.state.calls.filter((call) => /cahierdetexte\/\d{4}/.test(call.path)).length;
  const first = details();
  await runtime.sync();
  assert.equal(details(), first, 'unchanged days are not read again');
  const snapshot = runtime.snapshots.get('1001');
  assert.equal(
    snapshot.homework.find((entry) => entry.id === '501').content,
    'Réviser le chapitre 2',
  );
});

test('a scan request publishes the devices again', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const published = gladys.fake.requests.filter((r) => r.path.includes('discovered')).length;
  await gladys.fake.scanRequest();
  assert.equal(
    gladys.fake.requests.filter((r) => r.path.includes('discovered')).length,
    published + 1,
  );
});
