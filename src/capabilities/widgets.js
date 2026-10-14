// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
//   - student_overview : the figures of one child at a glance — live tiles
//                        bound to the device features, the next lesson, the
//                        last grade, absences and delays — and a refresh button;
//   - homework         : the homework still to do, with its content one tap
//                        away (the core's detail panel);
//   - timetable        : the lessons of a day (today, tomorrow, next school
//                        day), cancelled ones flagged.
//
// Each instance picks its student in its settings (`"source": "devices"`: the
// student's device external_id). The content is declarative (no HTML): see
// the "Dashboard widgets" section of the SDK README for the vocabulary and the
// budget — at most 8 components, 6 tiles, 1 focal, 1 status list, 4 buttons.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { pick } from '../i18n.js';
import { localParts, shortDate, timeOf } from '../dates.js';
import { studentName } from '../ecoledirecte/parse.js';
import {
  FEATURES,
  describeGrade,
  describeLesson,
  nextLesson,
  studentIds,
} from '../devices/student.js';
import { DAYS, DAY_LABELS, lessonsOn, resolveDay } from './days.js';

const logger = createLogger({ name: 'widgets' });

/** Widget keys, as declared in the manifest. Never renamed: dashboards store them. */
export const WIDGET_KEYS = {
  OVERVIEW: 'student_overview',
  HOMEWORK: 'homework',
  TIMETABLE: 'timetable',
};

/** The one button action every widget offers. */
export const WIDGET_ACTIONS = { REFRESH: 'refresh' };

const MAX_LIST = 8;

const clip = (text, max) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const TEXTS = {
  chooseStudent: {
    en: 'Pick a student in the widget settings.',
    fr: 'Choisissez un élève dans les réglages du widget.',
    de: 'Wähle in den Widget-Einstellungen einen Schüler aus.',
    es: 'Elija un alumno en los ajustes del widget.',
  },
  notSynced: {
    en: 'No data yet: check the connection in the integration.',
    fr: "Pas encore de données : vérifiez la connexion dans l'intégration.",
    de: 'Noch keine Daten: Prüfe die Verbindung in der Integration.',
    es: 'Aún no hay datos: compruebe la conexión en la integración.',
  },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'EcoleDirecte synchronized.',
    fr: 'EcoleDirecte synchronisé.',
    de: 'EcoleDirecte synchronisiert.',
    es: 'EcoleDirecte sincronizado.',
  },
  refreshFailed: {
    en: 'Synchronization failed: see the integration status.',
    fr: "Échec de la synchronisation : voir l'état de l'intégration.",
    de: 'Synchronisierung fehlgeschlagen: siehe Status der Integration.',
    es: 'Error de sincronización: vea el estado de la integración.',
  },
  average: { en: 'Average', fr: 'Moyenne', de: 'Durchschnitt', es: 'Media' },
  lastGrade: { en: 'Last grade', fr: 'Dernière note', de: 'Letzte Note', es: 'Última nota' },
  homeworkTomorrow: {
    en: 'Homework tomorrow',
    fr: 'Devoirs demain',
    de: 'Aufgaben morgen',
    es: 'Deberes mañana',
  },
  unread: { en: 'Unread messages', fr: 'Messages non lus', de: 'Ungelesen', es: 'No leídos' },
  nextLesson: {
    en: 'Next lesson',
    fr: 'Prochain cours',
    de: 'Nächste Stunde',
    es: 'Próxima clase',
  },
  absencesDelays: {
    en: 'Absences / delays',
    fr: 'Absences / retards',
    de: 'Fehlzeiten / Verspätungen',
    es: 'Ausencias / retrasos',
  },
  lastSync: {
    en: 'Last update',
    fr: 'Dernière mise à jour',
    de: 'Letzte Aktualisierung',
    es: 'Última actualización',
  },
  none: { en: 'None', fr: 'Aucun', de: 'Keine', es: 'Ninguno' },
  noHomework: {
    en: 'No homework to do.',
    fr: 'Aucun devoir à faire.',
    de: 'Keine offenen Hausaufgaben.',
    es: 'No hay deberes pendientes.',
  },
  noLesson: {
    en: 'No lesson that day.',
    fr: 'Aucun cours ce jour-là.',
    de: 'An diesem Tag kein Unterricht.',
    es: 'No hay clases ese día.',
  },
  due: { en: 'Due', fr: 'Pour le', de: 'Fällig am', es: 'Para el' },
  test: { en: 'Test', fr: 'Contrôle', de: 'Test', es: 'Examen' },
  done: { en: 'Done', fr: 'Fait', de: 'Erledigt', es: 'Hecho' },
  cancelled: { en: 'Cancelled', fr: 'Annulé', de: 'Entfällt', es: 'Anulada' },
  changed: { en: 'Changed', fr: 'Modifié', de: 'Geändert', es: 'Cambiada' },
};

const refreshButton = (language) => ({
  type: 'button',
  label: pick(language, TEXTS.refresh),
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: WIDGET_ACTIONS.REFRESH },
});

/** The empty states: no student chosen, or nothing synchronized yet. */
function placeholder(runtime, settings, language) {
  if (!settings?.student) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', text: pick(language, TEXTS.chooseStudent) }],
    };
  }
  const snapshot = runtime.snapshotByDevice(settings.student);
  if (!snapshot) {
    return {
      ttl_seconds: 60,
      components: [
        { type: 'text', text: pick(language, TEXTS.notSynced) },
        refreshButton(language),
      ],
    };
  }
  return snapshot;
}

function heading(snapshot, suffix = '') {
  const name = studentName(snapshot.student);
  const extra = suffix || snapshot.student.className;
  return { type: 'text', variant: 'heading', text: clip(extra ? `${name} · ${extra}` : name, 40) };
}

function overview(runtime, snapshot, language) {
  const { today, nowDateTime } = runtime.clock();
  const ids = studentIds(runtime.gladys, snapshot.student.id);
  const tile = (feature, label, icon) => ({
    type: 'value',
    label: pick(language, label),
    icon,
    device_feature: ids.feature(feature),
  });
  const items = [];
  if (snapshot.lessons) {
    const next = nextLesson(snapshot, nowDateTime);
    items.push({
      label: pick(language, TEXTS.nextLesson),
      icon: 'clock',
      value: clip(next ? describeLesson(next, today) : pick(language, TEXTS.none), 40),
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  const last = snapshot.grades?.at(-1);
  if (last) {
    items.push({
      label: pick(language, TEXTS.lastGrade),
      icon: 'award',
      value: clip(describeGrade(last), 40),
      color: last.value20 >= 10 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    });
  }
  if (snapshot.schoolLife) {
    const absences = snapshot.schoolLife.filter((entry) => entry.kind === 'absence').length;
    const delays = snapshot.schoolLife.length - absences;
    items.push({
      label: pick(language, TEXTS.absencesDelays),
      icon: 'user-x',
      value: `${absences} / ${delays}`,
      color: absences + delays > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (runtime.status.lastSync) {
    items.push({
      label: pick(language, TEXTS.lastSync),
      icon: 'refresh-cw',
      value: localParts(runtime.status.lastSync, runtime.config.timezone).time,
      color: runtime.status.lastError ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
    });
  }
  return {
    // The tiles are live (bound to the features); the rows follow the syncs,
    // which nudge the widget: the TTL is a safety net for the next lesson.
    ttl_seconds: 300,
    components: [
      heading(snapshot),
      tile(FEATURES.AVERAGE, TEXTS.average, 'bar-chart-2'),
      tile(FEATURES.LAST_GRADE, TEXTS.lastGrade, 'award'),
      tile(FEATURES.HOMEWORK_TOMORROW, TEXTS.homeworkTomorrow, 'book-open'),
      tile(FEATURES.UNREAD_MESSAGES, TEXTS.unread, 'mail'),
      ...(items.length ? [{ type: 'status', items }] : []),
      refreshButton(language),
    ],
  };
}

function homeworkList(runtime, snapshot, language) {
  const { today } = runtime.clock();
  const todo = (snapshot.homework ?? []).filter((entry) => entry.date >= today && !entry.done);
  const components = [heading(snapshot)];
  if (todo.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(language, TEXTS.noHomework) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: todo.slice(0, MAX_LIST).map((entry) => ({
        title: clip(entry.subject, 60),
        subtitle: `${pick(language, TEXTS.due)} ${shortDate(entry.date)}`,
        ...(entry.test
          ? { badge: { text: pick(language, TEXTS.test), color: WIDGET_COLORS.WARNING } }
          : {}),
        ...(entry.content ? { description: clip(entry.content, 2000) } : {}),
      })),
    });
  }
  components.push(refreshButton(language));
  return { ttl_seconds: 900, components };
}

function timetable(runtime, snapshot, language, settings) {
  const { today } = runtime.clock();
  const choice = Object.values(DAYS).includes(settings?.day) ? settings.day : DAYS.TODAY;
  const date = resolveDay(choice, snapshot, today);
  const lessons = lessonsOn(snapshot, date);
  const components = [
    heading(snapshot, `${pick(language, DAY_LABELS[choice])} ${shortDate(date)}`),
  ];
  if (lessons.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(language, TEXTS.noLesson) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: lessons.slice(0, MAX_LIST).map((lesson) => {
        const badge = lesson.cancelled
          ? { text: pick(language, TEXTS.cancelled), color: WIDGET_COLORS.DANGER }
          : lesson.changed
            ? { text: pick(language, TEXTS.changed), color: WIDGET_COLORS.WARNING }
            : null;
        return {
          title: clip(`${timeOf(lesson.start)}–${timeOf(lesson.end)} ${lesson.subject}`, 60),
          subtitle: clip([lesson.room, lesson.teacher].filter(Boolean).join(' · '), 80),
          ...(badge ? { badge } : {}),
        };
      }),
    });
  }
  components.push(refreshButton(language));
  return { ttl_seconds: 900, components };
}

const BUILDERS = {
  [WIDGET_KEYS.OVERVIEW]: overview,
  [WIDGET_KEYS.HOMEWORK]: homeworkList,
  [WIDGET_KEYS.TIMETABLE]: timetable,
};

/**
 * The widgets, keyed like the manifest: `get` builds the content, `action`
 * answers the refresh button with a toast.
 */
export const WIDGETS = Object.fromEntries(
  Object.entries(BUILDERS).map(([key, build]) => [
    key,
    {
      async get(runtime, { settings = {}, language = 'en' } = {}) {
        logger.debug(`onWidgetGet <- ${key}`);
        const snapshot = placeholder(runtime, settings, language);
        if (!snapshot.student) {
          return snapshot;
        }
        return build(runtime, snapshot, language, settings);
      },
      async action(runtime, { actionKey }) {
        logger.info(`onWidgetAction <- ${key}.${actionKey}`);
        if (actionKey !== WIDGET_ACTIONS.REFRESH) {
          // Throwing acks the action as failed: the message reaches the user.
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
        const result = await runtime.sync();
        return result.ok ? TEXTS.refreshed : TEXTS.refreshFailed;
      },
    },
  ]),
);

/** Ask the core to re-pull every widget now (after a sync, a config change). */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}
