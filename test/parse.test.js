import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentPeriod,
  htmlToText,
  isModuleEnabled,
  parseAverages,
  parseGrades,
  parseHomework,
  parseLessons,
  parseMessages,
  parseNumber,
  parseSchoolLife,
  studentName,
  studentsFromAccounts,
} from '../src/ecoledirecte/parse.js';
import { createFixtures } from './helpers/fakeEcoleDirecte.js';

const fixtures = createFixtures();

test('numbers are read the French way, the rest is null', () => {
  assert.equal(parseNumber('12,5'), 12.5);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber(' 7 '), 7);
  assert.equal(parseNumber(14), 14);
  for (const value of ['', 'Abs', 'Disp', 'NE', null, undefined, NaN]) {
    assert.equal(parseNumber(value), null, `${value}`);
  }
});

test('a family account gives its children, a student account itself', () => {
  const family = studentsFromAccounts(fixtures.accounts);
  assert.deepEqual(
    family.map((student) => [
      student.id,
      studentName(student),
      student.className,
      student.accountId,
    ]),
    [
      ['1001', 'Emma MARTIN', '5ème B', '100'],
      ['1002', 'Léo MARTIN', '6ème A', '100'],
    ],
  );
  const student = studentsFromAccounts([
    {
      id: 42,
      typeCompte: 'E',
      prenom: 'Tom',
      nom: 'DURAND',
      nomEtablissement: 'Lycée Victor Hugo',
      profile: { classe: { libelle: 'Terminale B' } },
    },
    { id: 7, typeCompte: 'P', prenom: 'Prof' },
  ]);
  assert.deepEqual(
    student.map((entry) => [entry.id, entry.className, entry.school]),
    [['42', 'Terminale B', 'Lycée Victor Hugo']],
  );
});

test('a module is off only when listed and disabled', () => {
  assert.equal(isModuleEnabled(undefined, 'NOTES'), true);
  assert.equal(isModuleEnabled([], 'NOTES'), true);
  assert.equal(isModuleEnabled([{ code: 'NOTES', enable: false }], 'NOTES'), false);
  assert.equal(isModuleEnabled([{ code: 'NOTES', enable: true }], 'NOTES'), true);
});

test('grades: numeric only, scaled to 20, ordered by entry date', () => {
  const grades = parseGrades(fixtures.notes[1001]);
  assert.deepEqual(
    grades.map((grade) => [grade.subject, grade.value, grade.outOf, grade.value20]),
    [
      ['MATHEMATIQUES', 15.5, 20, 15.5],
      ['FRANCAIS', 7, 10, 14],
    ],
  );
});

test('the general average is the school one when published', () => {
  const data = fixtures.notes[1001];
  const averages = parseAverages(data, parseGrades(data), '2026-10-14');
  assert.deepEqual(averages, { average: 14.25, classAverage: 12.1, period: '1er Trimestre' });
});

test('otherwise it is computed per subject from the significant grades', () => {
  const data = structuredClone(fixtures.notes[1001]);
  data.periodes[0].ensembleMatieres.moyenneGenerale = '';
  data.notes.push({
    id: 5,
    codePeriode: 'A001',
    libelleMatiere: 'MATHEMATIQUES',
    noteSur: '20',
    valeur: '9,5',
    coef: '2',
    dateSaisie: '2026-10-10',
  });
  data.notes.push({
    id: 6,
    codePeriode: 'A001',
    libelleMatiere: 'MATHEMATIQUES',
    noteSur: '20',
    valeur: '0',
    nonSignificatif: true,
    dateSaisie: '2026-10-11',
  });
  // Maths (15.5×1 + 9.5×2) / 3 = 11.5, French 14 -> (11.5 + 14) / 2.
  const { average } = parseAverages(data, parseGrades(data), '2026-10-14');
  assert.equal(average, 12.75);
});

test('the current period falls back to the year when no term runs', () => {
  const data = fixtures.notes[1001];
  assert.equal(currentPeriod(data, '2026-10-14').idPeriode, 'A001');
  assert.equal(currentPeriod(data, '2026-12-15').idPeriode, 'A001', 'last term started');
  assert.equal(currentPeriod({ periodes: [data.periodes[1]] }, '2026-10-14').idPeriode, 'A999Z');
  assert.equal(currentPeriod({}, '2026-10-14'), null);
});

test('homework is flattened by due date', () => {
  const homework = parseHomework(fixtures.homework[1001]);
  assert.deepEqual(
    homework.map((entry) => [entry.id, entry.date, entry.subject, entry.done, entry.test]),
    [
      ['502', '2026-10-15', 'FRANCAIS', true, false],
      ['501', '2026-10-15', 'MATHEMATIQUES', false, true],
      ['503', '2026-10-16', 'ANGLAIS', false, false],
    ],
  );
  assert.deepEqual(parseHomework({ notADate: [] }), []);
});

test('HTML homework becomes plain text', () => {
  assert.equal(
    htmlToText('<p>Exercices <b>3</b> &amp; 4<br>p.&nbsp;52</p><p>Lire</p>'),
    'Exercices 3 & 4\np. 52\nLire',
  );
});

test('lessons keep their times, cancellations and rooms', () => {
  const [first] = parseLessons([
    {
      id: 1,
      matiere: 'SVT',
      start_date: '2026-10-15 10:00',
      end_date: '2026-10-15 10:55',
      isAnnule: true,
      salle: 'LAB',
    },
    { id: 2, matiere: 'EPS' },
  ]);
  assert.deepEqual(
    [first.subject, first.start, first.end, first.cancelled, first.room],
    ['SVT', '2026-10-15 10:00', '2026-10-15 10:55', true, 'LAB'],
  );
  assert.deepEqual(parseLessons(null), []);
});

test('absences and delays are told apart', () => {
  assert.deepEqual(
    parseSchoolLife(fixtures.schoolLife[1001]).map((entry) => [
      entry.id,
      entry.kind,
      entry.justified,
    ]),
    [
      ['70', 'absence', true],
      ['71', 'delay', false],
    ],
  );
});

test('messages: the unread count of the API, or the unread ones listed', () => {
  const { unread, messages } = parseMessages(fixtures.messages[100]);
  assert.equal(unread, 1);
  assert.equal(messages[0].from, 'Mme Anne DUPONT');
  const counted = parseMessages({
    messages: {
      received: [
        { id: 1, read: false },
        { id: 2, read: true },
      ],
    },
  });
  assert.equal(counted.unread, 1);
});
