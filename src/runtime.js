// -----------------------------------------------------------------------------
// The integration at run time: one EcoleDirecte session, the last data read
// for every student, and what is published to Gladys from it.
//
// A sync logs in when needed, reads every section of every student (grades,
// homework, timetable, school life) and every account's inbox, then:
//   1. publishes the devices when the list of students changed;
//   2. publishes the states that changed (publishChangedStates);
//   3. fires the scene events of what is new (src/capabilities/triggers.js);
//   4. publishes the transport badge (cloud, or unreachable after a failure)
//      and the connection status of the Configuration screen;
//   5. nudges the widgets.
//
// Syncs never overlap: a sync asked while one runs gets the running one. A
// minute "tick" republishes the time-dependent states (next lesson, homework
// for tomorrow) from memory, without calling EcoleDirecte.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { hasCredentials, normalizeConfig } from './config.js';
import { addDays, localParts } from './dates.js';
import { createStore } from './store.js';
import { createClient, ERROR_KINDS } from './ecoledirecte/client.js';
import {
  ACCOUNT_TYPES,
  MODULES,
  isModuleEnabled,
  parseAverages,
  parseGrades,
  parseHomework,
  parseHomeworkDetails,
  parseLessons,
  parseMessages,
  parseSchoolLife,
  studentName,
  studentsFromAccounts,
} from './ecoledirecte/parse.js';
import { buildStudentDevice, studentIds, studentStates } from './devices/student.js';
import { messageEvents, studentEvents } from './capabilities/triggers.js';

const logger = createLogger({ name: 'runtime' });

// How far ahead the timetable is read: two weeks covers "next school day"
// across any holiday weekend, in one request per student.
export const TIMETABLE_DAYS = 14;
// How far ahead the homework contents are read (one request per due date).
export const HOMEWORK_DETAIL_DAYS = 7;
// A security question left unanswered expires after this delay.
export const QUESTION_TTL_MS = 10 * 60 * 1000;
const STATE_HEARTBEAT_MS = 6 * 60 * 60 * 1000;
const TICK_MS = 60 * 1000;

/** Multi-language text of the connection status, per failure. */
export function describeError(err) {
  switch (err?.kind) {
    case ERROR_KINDS.DOUBLE_AUTH:
      return {
        en: 'EcoleDirecte asks a security question: use "Get the security question", then "Answer the security question".',
        fr: 'EcoleDirecte pose une question de sécurité : utilisez « Obtenir la question de sécurité », puis « Répondre à la question de sécurité ».',
        de: 'EcoleDirecte stellt eine Sicherheitsfrage: Nutze „Sicherheitsfrage abrufen“ und dann „Sicherheitsfrage beantworten“.',
        es: 'EcoleDirecte hace una pregunta de seguridad: use «Obtener la pregunta de seguridad» y luego «Responder a la pregunta de seguridad».',
      };
    case ERROR_KINDS.CREDENTIALS:
      return {
        en: 'EcoleDirecte refused the username or the password.',
        fr: "EcoleDirecte a refusé l'identifiant ou le mot de passe.",
        de: 'EcoleDirecte hat den Benutzernamen oder das Passwort abgelehnt.',
        es: 'EcoleDirecte ha rechazado el usuario o la contraseña.',
      };
    case ERROR_KINDS.CLOSED:
      return {
        en: 'The school is not available on EcoleDirecte right now (often during the holidays).',
        fr: "L'établissement n'est pas disponible sur EcoleDirecte pour le moment (souvent pendant les vacances).",
        de: 'Die Schule ist auf EcoleDirecte gerade nicht verfügbar (oft in den Ferien).',
        es: 'El centro no está disponible en EcoleDirecte por ahora (a menudo durante las vacaciones).',
      };
    case ERROR_KINDS.VERSION:
      return {
        en: 'EcoleDirecte refused the API version: update the integration.',
        fr: "EcoleDirecte a refusé la version d'API : mettez l'intégration à jour.",
        de: 'EcoleDirecte hat die API-Version abgelehnt: Aktualisiere die Integration.',
        es: 'EcoleDirecte ha rechazado la versión de la API: actualice la integración.',
      };
    case ERROR_KINDS.NETWORK:
      return {
        en: 'EcoleDirecte cannot be reached. The integration retries at the next refresh.',
        fr: "EcoleDirecte est injoignable. L'intégration réessaie au prochain rafraîchissement.",
        de: 'EcoleDirecte ist nicht erreichbar. Die Integration versucht es bei der nächsten Aktualisierung erneut.',
        es: 'No se puede acceder a EcoleDirecte. La integración lo reintenta en la próxima actualización.',
      };
    default:
      return {
        en: 'EcoleDirecte answered with an error, check the integration logs.',
        fr: "EcoleDirecte a répondu par une erreur, consultez les logs de l'intégration.",
        de: 'EcoleDirecte hat mit einem Fehler geantwortet, prüfe die Logs der Integration.',
        es: 'EcoleDirecte ha respondido con un error, consulte los registros de la integración.',
      };
  }
}

export const NOT_CONFIGURED = {
  en: 'Enter your EcoleDirecte username and password.',
  fr: 'Saisissez votre identifiant et votre mot de passe EcoleDirecte.',
  de: 'Gib deinen EcoleDirecte-Benutzernamen und dein Passwort ein.',
  es: 'Introduzca su usuario y su contraseña de EcoleDirecte.',
};

/**
 * Create the runtime.
 *
 * @param {object} options
 * @param {object} options.gladys the SDK instance (or the fake one in tests)
 * @param {object} [options.client] see src/ecoledirecte/client.js
 * @param {object} [options.store] see src/store.js
 * @param {() => Date} [options.now] clock
 * @param {(names: string[]) => void} [options.onWidgetsChanged] nudge the widgets
 */
export function createRuntime({
  gladys,
  client = createClient(),
  store = createStore(),
  now = () => new Date(),
  onWidgetsChanged = () => {},
}) {
  let config = normalizeConfig();
  let students = [];
  let publishedDevices = '';
  let loggedIn = false;
  let running = null;
  let refreshTimer = null;
  let tickTimer = null;
  let pendingQuestion = null;
  // The next login follows an answered security question (see client.login).
  let resumeLogin = false;
  const snapshots = new Map();
  const inboxes = new Map();
  const details = new Map();
  const status = { lastSync: null, lastError: null };

  function clock() {
    const { date: today, dateTime: nowDateTime } = localParts(now(), config.timezone);
    return { today, nowDateTime, language: config.language };
  }

  function questionPending() {
    return pendingQuestion !== null && now() - pendingQuestion.at < QUESTION_TTL_MS;
  }

  async function login() {
    const saved = store.getDoubleAuth(config.username);
    const resume = resumeLogin;
    resumeLogin = false;
    try {
      const accounts = await client.login({
        username: config.username,
        password: config.password,
        doubleAuth: saved,
        resume: resume && Boolean(saved),
      });
      students = studentsFromAccounts(accounts);
      loggedIn = true;
      if (students.length === 0) {
        logger.warn('Logged in, but the account follows no student (teacher or staff account?)');
      }
    } catch (err) {
      loggedIn = false;
      if (err.kind === ERROR_KINDS.DOUBLE_AUTH && saved) {
        // The saved pair no longer opens the account: forget it, so the next
        // answer to the question is the one used.
        logger.warn('The saved double-authentication pair was refused, a new answer is needed');
        store.clearDoubleAuth();
      }
      throw err;
    }
  }

  /** An authenticated call, logging in again once when the token expired. */
  async function call(path, options) {
    if (!loggedIn) {
      await login();
    }
    try {
      return await client.request(path, options);
    } catch (err) {
      if (err.kind !== ERROR_KINDS.TOKEN) {
        throw err;
      }
      logger.info('EcoleDirecte token expired, logging in again');
      await login();
      return client.request(path, options);
    }
  }

  /**
   * Read one section; a failure that is not about the session (the school
   * switched a module off, one endpoint down) keeps the previous value and
   * lets the other sections through.
   */
  async function section(name, student, read) {
    try {
      return { ok: true, value: await read() };
    } catch (err) {
      if (
        [ERROR_KINDS.NETWORK, ERROR_KINDS.DOUBLE_AUTH, ERROR_KINDS.CREDENTIALS].includes(err.kind)
      ) {
        throw err;
      }
      logger.warn(`${name} of student ${student.id} not read: ${err.message}`);
      return { ok: false };
    }
  }

  async function readHomeworkDetails(student, homework, today) {
    const limit = addDays(today, HOMEWORK_DETAIL_DAYS);
    const dates = [...new Set(homework.map((entry) => entry.date))].filter(
      (date) => date >= today && date <= limit,
    );
    const contents = new Map();
    for (const date of dates) {
      const key = `${student.id}|${date}`;
      const signature = homework
        .filter((entry) => entry.date === date)
        .map((entry) => entry.id)
        .join(',');
      let cached = details.get(key);
      if (!cached || cached.signature !== signature) {
        const result = await section('Homework details', student, () =>
          call(`Eleves/${student.id}/cahierdetexte/${date}.awp`, { verbe: 'get' }),
        );
        if (!result.ok) {
          continue;
        }
        cached = { signature, contents: parseHomeworkDetails(result.value) };
        details.set(key, cached);
      }
      for (const [id, content] of cached.contents) {
        contents.set(id, content);
      }
    }
    // Forget the days gone by.
    for (const key of details.keys()) {
      if (key.startsWith(`${student.id}|`) && key.slice(key.indexOf('|') + 1) < today) {
        details.delete(key);
      }
    }
    return homework.map((entry) => ({ ...entry, content: contents.get(entry.id) ?? '' }));
  }

  async function readStudent(student, today) {
    const previous = snapshots.get(student.id) ?? {};
    const snapshot = { student, fetched: {} };
    const enabled = (code) => isModuleEnabled(student.modules ?? student.accountModules, code);

    if (enabled(MODULES.GRADES)) {
      const result = await section('Grades', student, () =>
        call(`eleves/${student.id}/notes.awp`, { data: { anneeScolaire: '' } }),
      );
      if (result.ok) {
        snapshot.grades = parseGrades(result.value);
        snapshot.averages = parseAverages(result.value, snapshot.grades, today);
        snapshot.fetched.grades = true;
      } else {
        snapshot.grades = previous.grades;
        snapshot.averages = previous.averages;
      }
    }
    if (enabled(MODULES.HOMEWORK)) {
      const result = await section('Homework', student, () =>
        call(`Eleves/${student.id}/cahierdetexte.awp`),
      );
      if (result.ok) {
        snapshot.homework = await readHomeworkDetails(student, parseHomework(result.value), today);
        snapshot.fetched.homework = true;
      } else {
        snapshot.homework = previous.homework;
      }
    }
    if (enabled(MODULES.TIMETABLE)) {
      const result = await section('Timetable', student, () =>
        call(`E/${student.id}/emploidutemps.awp`, {
          data: {
            dateDebut: today,
            dateFin: addDays(today, TIMETABLE_DAYS - 1),
            avecTrous: false,
          },
        }),
      );
      if (result.ok) {
        snapshot.lessons = parseLessons(result.value);
        snapshot.fetched.lessons = true;
      } else {
        snapshot.lessons = previous.lessons;
      }
    }
    if (enabled(MODULES.SCHOOL_LIFE)) {
      const result = await section('School life', student, () =>
        call(`eleves/${student.id}/viescolaire.awp`),
      );
      if (result.ok) {
        snapshot.schoolLife = parseSchoolLife(result.value);
        snapshot.fetched.schoolLife = true;
      } else {
        snapshot.schoolLife = previous.schoolLife;
      }
    }
    return snapshot;
  }

  async function readInbox(student) {
    const path =
      student.accountType === ACCOUNT_TYPES.FAMILY
        ? `familles/${student.accountId}/messages.awp`
        : `eleves/${student.accountId}/messages.awp`;
    const result = await section('Messages', student, () =>
      call(path, {
        query: {
          force: 'false',
          typeRecuperation: 'received',
          idClasseur: '0',
          orderBy: 'date',
          order: 'desc',
          query: '',
          onlyRead: '',
          page: '0',
          itemsPerPage: '20',
          getAll: '0',
        },
        data: { anneeMessages: student.schoolYear },
      }),
    );
    return result.ok ? parseMessages(result.value) : null;
  }

  async function publishDevices({ force = false } = {}) {
    const devices = students.map((student) => buildStudentDevice(gladys, student, config.language));
    const signature = JSON.stringify(devices);
    if (!force && signature === publishedDevices) {
      return;
    }
    await gladys.publishDiscoveredDevices(devices);
    publishedDevices = signature;
  }

  async function publishTransports(transport) {
    if (students.length === 0) {
      return;
    }
    await gladys.publishTransports(
      students.map((student) => ({
        external_id: studentIds(gladys, student.id).device,
        transport,
      })),
    );
  }

  /** Republish the states from memory (no API call): the next lesson moves with time. */
  async function publishStates() {
    const time = clock();
    const states = [...snapshots.values()].flatMap((snapshot) =>
      studentStates(gladys, snapshot, time),
    );
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  }

  async function publishEvents(events) {
    for (const { key, data } of events) {
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.error(`Scene event ${key} refused`, err);
      }
    }
  }

  async function runSync({ events = true } = {}) {
    if (!hasCredentials(config)) {
      await gladys.setConnectionStatus(false, NOT_CONFIGURED);
      return { ok: false, reason: 'not-configured' };
    }
    if (questionPending()) {
      // Logging in again would ask EcoleDirecte for a NEW question and void
      // the one the user is reading: wait for the answer.
      logger.info('Sync postponed: a security question is waiting for its answer');
      return { ok: false, reason: 'question-pending' };
    }
    const time = clock();
    try {
      if (!loggedIn) {
        await login();
      }
      const fresh = new Map();
      const newInboxes = new Map();
      for (const student of students) {
        fresh.set(student.id, await readStudent(student, time.today));
        const enabledInbox = isModuleEnabled(student.accountModules, MODULES.MESSAGES);
        if (enabledInbox && !newInboxes.has(student.accountId)) {
          newInboxes.set(student.accountId, await readInbox(student));
        }
      }

      snapshots.clear();
      inboxes.clear();
      for (const [accountId, inbox] of newInboxes) {
        if (inbox) {
          inboxes.set(accountId, inbox);
        }
      }
      for (const [id, snapshot] of fresh) {
        snapshot.messages = inboxes.get(snapshot.student.accountId);
        snapshots.set(id, snapshot);
      }

      await publishDevices();
      await publishStates();

      const pending = [];
      for (const snapshot of snapshots.values()) {
        pending.push(...studentEvents(gladys, store, snapshot, time));
      }
      for (const [accountId, inbox] of inboxes) {
        const names = students
          .filter((student) => student.accountId === accountId)
          .map(studentName)
          .join(', ');
        pending.push(...messageEvents(store, accountId, inbox, names));
      }
      store.save();
      if (events) {
        await publishEvents(pending);
      }

      status.lastSync = now();
      status.lastError = null;
      await publishTransports(DEVICE_TRANSPORTS.CLOUD);
      await gladys.setConnectionStatus(true);
      onWidgetsChanged();
      logger.info(
        `Synchronized ${students.length} student(s)` +
          (pending.length ? `, ${pending.length} new item(s)` : ''),
      );
      return { ok: true, students: students.length, events: pending.length };
    } catch (err) {
      status.lastError = err;
      logger.error(`Synchronization failed: ${err.message}`);
      await publishTransports(DEVICE_TRANSPORTS.UNREACHABLE).catch(() => {});
      await gladys.setConnectionStatus(false, describeError(err)).catch(() => {});
      onWidgetsChanged();
      return { ok: false, reason: err.kind ?? 'error', error: err };
    }
  }

  function sync(options) {
    if (!running) {
      running = runSync(options).finally(() => {
        running = null;
      });
    }
    return running;
  }

  function stopTimers() {
    clearInterval(refreshTimer);
    clearInterval(tickTimer);
    refreshTimer = null;
    tickTimer = null;
  }

  function startTimers() {
    stopTimers();
    refreshTimer = setInterval(
      () => {
        sync().catch((err) => logger.error('Scheduled sync failed', err));
      },
      config.refresh_minutes * 60 * 1000,
    );
    tickTimer = setInterval(() => {
      publishStates().catch((err) => logger.debug(`Tick publication failed: ${err.message}`));
    }, TICK_MS);
    refreshTimer.unref?.();
    tickTimer.unref?.();
  }

  return {
    gladys,
    get config() {
      return config;
    },
    get students() {
      return students;
    },
    status,
    snapshots,
    inboxes,
    clock,

    /** Apply a new configuration; a change of account starts a new session. */
    setConfig(raw) {
      const next = normalizeConfig(raw);
      if (next.username !== config.username || next.password !== config.password) {
        client.reset();
        loggedIn = false;
        pendingQuestion = null;
        resumeLogin = false;
        students = [];
        snapshots.clear();
        inboxes.clear();
        details.clear();
      }
      const languageChanged = next.language !== config.language;
      config = next;
      if (languageChanged) {
        publishedDevices = '';
      }
    },

    sync,
    publishDevices,
    publishStates,
    startTimers,
    stopTimers,

    /** The snapshot of the student whose device external_id is given. */
    snapshotByDevice(externalId) {
      const student = students.find((entry) => studentIds(gladys, entry.id).device === externalId);
      return student ? (snapshots.get(student.id) ?? null) : null;
    },

    /**
     * Step 1 of the double authentication: log in (with the saved pair, if
     * any) and fetch the question when EcoleDirecte asks one. Resolves null
     * when no question is needed: the account already opens.
     */
    async askQuestion() {
      if (!hasCredentials(config)) {
        throw Object.assign(new Error('not configured'), { kind: 'not-configured' });
      }
      await running;
      pendingQuestion = null;
      try {
        await login();
        return null;
      } catch (err) {
        if (err.kind !== ERROR_KINDS.DOUBLE_AUTH) {
          throw err;
        }
      }
      const question = await client.doubleAuthQuestion();
      pendingQuestion = { ...question, at: now() };
      return question;
    },

    /** The question waiting for its answer, or null. */
    pendingQuestion() {
      return questionPending() ? pendingQuestion : null;
    },

    /**
     * Step 2: answer with one of the propositions (its number or its text).
     * Resolves `{ matched: false, propositions }` when the answer matches none.
     */
    async answerQuestion(answer) {
      if (!questionPending()) {
        return { matched: false, expired: true };
      }
      const typed = String(answer ?? '').trim();
      const { propositions } = pendingQuestion;
      const index = /^\d+$/.test(typed) ? Number(typed) - 1 : -1;
      const normalize = (value) => value.trim().toLocaleLowerCase('fr');
      const chosen =
        propositions[index] ??
        propositions.find((proposition) => normalize(proposition.text) === normalize(typed));
      if (!chosen) {
        return { matched: false, propositions };
      }
      const pair = await client.doubleAuthAnswer(chosen.raw);
      store.setDoubleAuth(config.username, pair);
      pendingQuestion = null;
      loggedIn = false;
      resumeLogin = true;
      return { matched: true, result: await sync() };
    },
  };
}
