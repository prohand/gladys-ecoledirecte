// -----------------------------------------------------------------------------
// From the raw EcoleDirecte answers to the integration's own shapes.
//
// Pure functions, no network: everything the API sends is loosely typed
// ("12,5" for a number, "" for "not computed", "Abs" for a grade), so it is
// read defensively here, once, and the rest of the code handles clean values.
// -----------------------------------------------------------------------------

import { decodeBase64 } from './client.js';

/** Account types (`typeCompte`) the integration follows. */
export const ACCOUNT_TYPES = { STUDENT: 'E', FAMILY: '1' };

/** Module codes of an account, to skip what the school switched off. */
export const MODULES = {
  GRADES: 'NOTES',
  HOMEWORK: 'CAHIER_DE_TEXTES',
  TIMETABLE: 'EDT',
  SCHOOL_LIFE: 'VIE_SCOLAIRE',
  MESSAGES: 'MESSAGERIE',
};

/** "12,5" / "12.5" / 12.5 -> 12.5; "", "Abs", "Disp" -> null. */
export function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return null;
  }
  return Number(text);
}

export const round2 = (value) => Math.round(value * 100) / 100;

/** HTML (as teachers type homework) -> plain text, one paragraph per line. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** False only when the module is listed AND switched off. */
export function isModuleEnabled(modules, code) {
  if (!Array.isArray(modules)) {
    return true;
  }
  const module = modules.find((entry) => entry?.code === code);
  return module ? module.enable !== false : true;
}

/**
 * The students reachable from the accounts of a login: the student himself
 * for a student account, every child for a family account. Other account
 * types (teachers, staff) are ignored.
 */
export function studentsFromAccounts(accounts) {
  const students = [];
  for (const account of accounts ?? []) {
    const common = {
      accountId: String(account.id),
      accountType: account.typeCompte,
      schoolYear: account.anneeScolaireCourante ?? '',
      accountModules: account.modules,
    };
    if (account.typeCompte === ACCOUNT_TYPES.STUDENT) {
      students.push({
        ...common,
        id: String(account.id),
        firstName: account.prenom ?? '',
        lastName: account.nom ?? '',
        className: account.profile?.classe?.libelle ?? '',
        school: account.nomEtablissement ?? account.profile?.nomEtablissement ?? '',
        modules: account.modules,
      });
    } else if (account.typeCompte === ACCOUNT_TYPES.FAMILY) {
      for (const child of account.profile?.eleves ?? []) {
        students.push({
          ...common,
          id: String(child.id),
          firstName: child.prenom ?? '',
          lastName: child.nom ?? '',
          className: child.classe?.libelle ?? '',
          school: child.nomEtablissement ?? '',
          modules: child.modules,
        });
      }
    }
  }
  return students.filter((student) => student.id && student.id !== 'undefined');
}

/** "Emma MARTIN", or the id when the API gave no name. */
export function studentName(student) {
  return [student.firstName, student.lastName].filter(Boolean).join(' ') || `#${student.id}`;
}

/**
 * The grades of a `notes.awp` answer that carry a number, newest last.
 * @returns {Array<{ id, subject, assignment, value, outOf, value20, coef, date, entered, period, significant }>}
 */
export function parseGrades(data) {
  const grades = [];
  for (const note of data?.notes ?? []) {
    const value = parseNumber(note.valeur);
    const outOf = parseNumber(note.noteSur) ?? 20;
    if (value === null || outOf <= 0) {
      continue;
    }
    grades.push({
      id: String(note.id ?? `${note.codeMatiere}|${note.devoir}|${note.date}`),
      subject: note.libelleMatiere || note.codeMatiere || '',
      subjectCode: note.codeMatiere ?? '',
      assignment: note.devoir ?? '',
      value,
      outOf,
      value20: round2((value / outOf) * 20),
      coef: parseNumber(note.coef) ?? 1,
      date: note.date ?? '',
      entered: note.dateSaisie || note.date || '',
      period: note.codePeriode ?? '',
      significant: note.nonSignificatif !== true,
    });
  }
  return grades.sort((a, b) =>
    `${a.entered}|${a.date}|${a.id}`.localeCompare(`${b.entered}|${b.date}|${b.id}`),
  );
}

/** The period running today, else the last one started, else the yearly one. */
export function currentPeriod(data, today) {
  const periods = data?.periodes ?? [];
  const terms = periods.filter((period) => !period.annuel && period.idPeriode !== 'A999Z');
  return (
    terms.find((period) => period.dateDebut <= today && today <= period.dateFin) ??
    terms.filter((period) => period.dateDebut && period.dateDebut <= today).at(-1) ??
    periods.find((period) => period.annuel || period.idPeriode === 'A999Z') ??
    null
  );
}

/**
 * General average of the current period. The school's own figure when it
 * publishes one; otherwise the mean of the subject averages computed from the
 * significant grades (each subject weighted by its grades' coefficients), as
 * the report card does.
 *
 * @returns {{ average: number | null, classAverage: number | null, period: string }}
 */
export function parseAverages(data, grades, today) {
  const period = currentPeriod(data, today);
  const name = period?.periode ?? '';
  const school = parseNumber(period?.ensembleMatieres?.moyenneGenerale);
  const classAverage = parseNumber(period?.ensembleMatieres?.moyenneClasse);
  if (school !== null) {
    return { average: round2(school), classAverage, period: name };
  }
  const code = period?.codePeriode ?? period?.idPeriode;
  const inPeriod = grades.filter(
    (grade) => grade.significant && (!code || period?.annuel || grade.period === code),
  );
  const bySubject = new Map();
  for (const grade of inPeriod) {
    const entry = bySubject.get(grade.subject) ?? { sum: 0, weight: 0 };
    entry.sum += grade.value20 * grade.coef;
    entry.weight += grade.coef;
    bySubject.set(grade.subject, entry);
  }
  const averages = [...bySubject.values()]
    .filter((entry) => entry.weight > 0)
    .map((entry) => entry.sum / entry.weight);
  return {
    average: averages.length
      ? round2(averages.reduce((sum, value) => sum + value, 0) / averages.length)
      : null,
    classAverage,
    period: name,
  };
}

/**
 * The homework of a `cahierdetexte.awp` answer (today onwards), by due date.
 * @returns {Array<{ id, date, subject, done, test, givenOn, online }>}
 */
export function parseHomework(data) {
  const homework = [];
  for (const [date, entries] of Object.entries(data ?? {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      homework.push({
        id: String(entry.idDevoir ?? `${date}|${entry.codeMatiere}`),
        date,
        subject: entry.matiere || entry.codeMatiere || '',
        done: entry.effectue === true,
        test: entry.interrogation === true,
        givenOn: entry.donneLe ?? '',
        online: entry.rendreEnLigne === true,
      });
    }
  }
  return homework.sort((a, b) => `${a.date}|${a.subject}`.localeCompare(`${b.date}|${b.subject}`));
}

/**
 * The homework contents of a `cahierdetexte/<date>.awp` answer.
 * @returns {Map<string, string>} homework id -> plain text
 */
export function parseHomeworkDetails(data) {
  const contents = new Map();
  for (const subject of data?.matieres ?? []) {
    const id = subject.aFaire?.idDevoir ?? subject.id;
    if (id !== undefined && subject.aFaire?.contenu) {
      contents.set(String(id), htmlToText(decodeBase64(subject.aFaire.contenu)));
    }
  }
  return contents;
}

/**
 * The lessons of an `emploidutemps.awp` answer, in time order.
 * @returns {Array<{ id, subject, start, end, teacher, room, cancelled, changed }>}
 */
export function parseLessons(data) {
  return (Array.isArray(data) ? data : [])
    .filter((lesson) => lesson?.start_date && lesson?.end_date)
    .map((lesson) => ({
      id: `${lesson.id ?? ''}|${lesson.start_date}`,
      subject: lesson.matiere || lesson.text || '',
      start: String(lesson.start_date).slice(0, 16),
      end: String(lesson.end_date).slice(0, 16),
      teacher: lesson.prof ?? '',
      room: lesson.salle ?? '',
      cancelled: lesson.isAnnule === true,
      changed: lesson.isModifie === true,
      kind: lesson.typeCours ?? '',
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/**
 * The absences and delays of a `viescolaire.awp` answer.
 * @returns {Array<{ id, kind: 'absence' | 'delay', date, label, justified, reason }>}
 */
export function parseSchoolLife(data) {
  return (data?.absencesRetards ?? []).map((entry) => ({
    id: String(entry.id ?? `${entry.typeElement}|${entry.date}`),
    kind: /retard/i.test(entry.typeElement ?? '') ? 'delay' : 'absence',
    date: entry.date ?? '',
    label: entry.displayDate || entry.libelle || entry.date || '',
    justified: entry.justifie === true,
    reason: entry.motif ?? '',
  }));
}

function senderName(from) {
  if (!from) {
    return '';
  }
  return (
    [from.civilite, from.prenom, from.nom].filter(Boolean).join(' ') ||
    from.name ||
    from.libelle ||
    ''
  );
}

/**
 * The received messages of a `messages.awp` answer.
 * @returns {{ unread: number, messages: Array<{ id, subject, from, date, read }> }}
 */
export function parseMessages(data) {
  const messages = (data?.messages?.received ?? []).map((message) => ({
    id: String(message.id),
    subject: message.subject ?? '',
    from: senderName(message.from),
    date: message.date ?? '',
    read: message.read === true,
  }));
  const counted = Number(data?.pagination?.messagesRecusNotReadCount);
  return {
    unread: Number.isFinite(counted) ? counted : messages.filter((message) => !message.read).length,
    messages,
  };
}
