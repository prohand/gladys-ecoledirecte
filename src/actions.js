// -----------------------------------------------------------------------------
// Manifest actions: the buttons of the Configuration screen.
//
//   - test_connection     : log in, read everything once, say what was found;
//   - double_auth_question: EcoleDirecte asks a new device a security question
//                           (code 250: "what is your birth year?", with a few
//                           propositions). This button shows it;
//   - double_auth_answer  : the user types the number (or the text) of the
//                           right proposition. The answer gives a reusable
//                           pair, saved in /data: the question is not asked
//                           again at the next start.
//
// The resolved multi-language object is shown under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { localize, pick } from './i18n.js';
import { describeError, NOT_CONFIGURED } from './runtime.js';
import { studentName } from './ecoledirecte/parse.js';
import { hasCredentials } from './config.js';

const logger = createLogger({ name: 'actions' });

/** Action keys, as declared in the manifest. Never renamed. */
export const ACTION_KEYS = {
  TEST_CONNECTION: 'test_connection',
  DOUBLE_AUTH_QUESTION: 'double_auth_question',
  DOUBLE_AUTH_ANSWER: 'double_auth_answer',
};

function describeStudents(runtime) {
  const list = runtime.students
    .map((student) => {
      const name = studentName(student);
      return student.className ? `${name} (${student.className})` : name;
    })
    .join(', ');
  return localize((language) => {
    const found = pick(language, {
      en: 'Connected to EcoleDirecte.',
      fr: 'Connecté à EcoleDirecte.',
      de: 'Mit EcoleDirecte verbunden.',
      es: 'Conectado a EcoleDirecte.',
    });
    if (!list) {
      return `${found} ${pick(language, {
        en: 'This account follows no student (only student and parent accounts are supported).',
        fr: 'Ce compte ne suit aucun élève (seuls les comptes élève et parent sont pris en charge).',
        de: 'Dieses Konto folgt keinem Schüler (nur Schüler- und Elternkonten werden unterstützt).',
        es: 'Esta cuenta no sigue a ningún alumno (solo se admiten cuentas de alumno y de padres).',
      })}`;
    }
    const students = pick(language, {
      en: 'Students',
      fr: 'Élèves',
      de: 'Schüler',
      es: 'Alumnos',
    });
    const next = pick(language, {
      en: 'They appear in the Discovery tab.',
      fr: "Ils apparaissent dans l'onglet Découverte.",
      de: 'Sie erscheinen im Reiter „Erkennung“.',
      es: 'Aparecen en la pestaña Descubrimiento.',
    });
    return `${found} ${students} : ${list}. ${next}`;
  });
}

export const ACTIONS = {
  async [ACTION_KEYS.TEST_CONNECTION](runtime) {
    if (!hasCredentials(runtime.config)) {
      return NOT_CONFIGURED;
    }
    if (runtime.pendingQuestion()) {
      return describeError({ kind: 'double-auth' });
    }
    const result = await runtime.sync();
    if (!result.ok) {
      return describeError(result.error);
    }
    return describeStudents(runtime);
  },

  async [ACTION_KEYS.DOUBLE_AUTH_QUESTION](runtime) {
    if (!hasCredentials(runtime.config)) {
      return NOT_CONFIGURED;
    }
    let question;
    try {
      question = await runtime.askQuestion();
    } catch (err) {
      logger.warn(`Security question not obtained: ${err.message}`);
      return describeError(err);
    }
    if (!question) {
      // The account opened without a question: start the sync right away.
      await runtime.sync();
      return {
        en: 'EcoleDirecte asks no security question: the connection works.',
        fr: 'EcoleDirecte ne pose pas de question de sécurité : la connexion fonctionne.',
        de: 'EcoleDirecte stellt keine Sicherheitsfrage: Die Verbindung funktioniert.',
        es: 'EcoleDirecte no hace ninguna pregunta de seguridad: la conexión funciona.',
      };
    }
    const choices = question.propositions
      .map((proposition, index) => `${index + 1}. ${proposition.text}`)
      .join(' — ');
    return localize(
      (language) =>
        `${question.question} → ${choices}. ${pick(language, {
          en: 'Type the number of the right answer in "Answer the security question" within 10 minutes.',
          fr: 'Tapez le numéro de la bonne réponse dans « Répondre à la question de sécurité » dans les 10 minutes.',
          de: 'Gib innerhalb von 10 Minuten die Nummer der richtigen Antwort unter „Sicherheitsfrage beantworten“ ein.',
          es: 'Escriba el número de la respuesta correcta en «Responder a la pregunta de seguridad» en menos de 10 minutos.',
        })}`,
    );
  },

  async [ACTION_KEYS.DOUBLE_AUTH_ANSWER](runtime, { fields }) {
    let outcome;
    try {
      outcome = await runtime.answerQuestion(fields.answer);
    } catch (err) {
      logger.warn(`Security answer refused: ${err.message}`);
      return {
        en: 'EcoleDirecte refused this answer. Ask for a new question and try again.',
        fr: 'EcoleDirecte a refusé cette réponse. Demandez une nouvelle question et réessayez.',
        de: 'EcoleDirecte hat diese Antwort abgelehnt. Fordere eine neue Frage an und versuche es erneut.',
        es: 'EcoleDirecte ha rechazado esta respuesta. Pida una nueva pregunta y vuelva a intentarlo.',
      };
    }
    if (outcome.expired) {
      return {
        en: 'No question is waiting: use "Get the security question" first.',
        fr: "Aucune question en attente : utilisez d'abord « Obtenir la question de sécurité ».",
        de: 'Keine Frage offen: Nutze zuerst „Sicherheitsfrage abrufen“.',
        es: 'No hay ninguna pregunta pendiente: use primero «Obtener la pregunta de seguridad».',
      };
    }
    if (!outcome.matched) {
      const choices = outcome.propositions
        .map((proposition, index) => `${index + 1}. ${proposition.text}`)
        .join(' — ');
      return localize(
        (language) =>
          `${pick(language, {
            en: 'This answer matches no proposition. Type its number:',
            fr: 'Cette réponse ne correspond à aucune proposition. Tapez son numéro :',
            de: 'Diese Antwort passt zu keinem Vorschlag. Gib ihre Nummer ein:',
            es: 'Esta respuesta no corresponde a ninguna propuesta. Escriba su número:',
          })} ${choices}`,
      );
    }
    if (!outcome.result?.ok) {
      return describeError(outcome.result?.error);
    }
    return localize(
      (language) =>
        `${pick(language, {
          en: 'Answer accepted and saved.',
          fr: 'Réponse acceptée et enregistrée.',
          de: 'Antwort angenommen und gespeichert.',
          es: 'Respuesta aceptada y guardada.',
        })} ${describeStudents(runtime)[language]}`,
    );
  },
};
