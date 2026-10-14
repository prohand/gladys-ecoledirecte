// -----------------------------------------------------------------------------
// A fake EcoleDirecte API, as a `fetch` replacement: no network in the tests.
//
// It plays the protocol the client must follow (GTK cookie, X-Gtk header,
// `data=` form body, codes in the JSON, security question) and serves the
// fixtures below, which the tests edit to simulate a new grade, a cancelled
// lesson, an expired token...
// -----------------------------------------------------------------------------

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

export const GTK = 'gtk-cookie-value';
export const QUESTION = 'Quelle est votre année de naissance ?';
export const PROPOSITIONS = ['1978', '1981', '1984'];
export const RIGHT_ANSWER = '1981';

/** Fixtures of a family account with two children. */
export function createFixtures() {
  return {
    accounts: [
      {
        id: 100,
        typeCompte: '1',
        prenom: 'Claire',
        nom: 'MARTIN',
        anneeScolaireCourante: '2026-2027',
        modules: [{ code: 'MESSAGERIE', enable: true }],
        profile: {
          eleves: [
            {
              id: 1001,
              prenom: 'Emma',
              nom: 'MARTIN',
              classe: { libelle: '5ème B' },
              nomEtablissement: 'Collège Jean Moulin',
              modules: [
                { code: 'NOTES', enable: true },
                { code: 'CAHIER_DE_TEXTES', enable: true },
                { code: 'EDT', enable: true },
                { code: 'VIE_SCOLAIRE', enable: true },
              ],
            },
            {
              id: 1002,
              prenom: 'Léo',
              nom: 'MARTIN',
              classe: { libelle: '6ème A' },
              nomEtablissement: 'Collège Jean Moulin',
              // The school switched the grades off for this one.
              modules: [{ code: 'NOTES', enable: false }],
            },
          ],
        },
      },
    ],
    notes: {
      1001: {
        periodes: [
          {
            idPeriode: 'A001',
            codePeriode: 'A001',
            periode: '1er Trimestre',
            annuel: false,
            dateDebut: '2026-09-01',
            dateFin: '2026-11-30',
            ensembleMatieres: { moyenneGenerale: '14,25', moyenneClasse: '12,10' },
          },
          {
            idPeriode: 'A999Z',
            codePeriode: 'A999Z',
            periode: 'Année',
            annuel: true,
            dateDebut: '2026-09-01',
            dateFin: '2027-07-04',
            ensembleMatieres: { moyenneGenerale: '' },
          },
        ],
        notes: [
          {
            id: 1,
            devoir: 'Contrôle chapitre 1',
            codePeriode: 'A001',
            codeMatiere: 'MATHS',
            libelleMatiere: 'MATHEMATIQUES',
            coef: '1',
            noteSur: '20',
            valeur: '15,5',
            date: '2026-09-20',
            dateSaisie: '2026-09-22',
          },
          {
            id: 2,
            devoir: 'Dictée',
            codePeriode: 'A001',
            codeMatiere: 'FRANC',
            libelleMatiere: 'FRANCAIS',
            coef: '1',
            noteSur: '10',
            valeur: '7',
            date: '2026-10-01',
            dateSaisie: '2026-10-02',
          },
          {
            id: 3,
            devoir: 'Oral',
            codePeriode: 'A001',
            codeMatiere: 'ANGL',
            libelleMatiere: 'ANGLAIS',
            coef: '1',
            noteSur: '20',
            valeur: 'Abs',
            date: '2026-10-05',
            dateSaisie: '2026-10-05',
          },
        ],
      },
    },
    homework: {
      1001: {
        '2026-10-15': [
          {
            matiere: 'MATHEMATIQUES',
            codeMatiere: 'MATHS',
            idDevoir: 501,
            donneLe: '2026-10-12',
            effectue: false,
            interrogation: true,
          },
          {
            matiere: 'FRANCAIS',
            codeMatiere: 'FRANC',
            idDevoir: 502,
            donneLe: '2026-10-12',
            effectue: true,
            interrogation: false,
          },
        ],
        '2026-10-16': [
          {
            matiere: 'ANGLAIS',
            codeMatiere: 'ANGL',
            idDevoir: 503,
            donneLe: '2026-10-13',
            effectue: false,
            interrogation: false,
          },
        ],
      },
      1002: {},
    },
    homeworkDetails: {
      '1001|2026-10-15': {
        date: '2026-10-15',
        matieres: [
          {
            id: 501,
            aFaire: { idDevoir: 501, contenu: b64('<p>Réviser le <b>chapitre 2</b></p>') },
          },
          { id: 502, aFaire: { idDevoir: 502, contenu: b64('<p>Lire p. 12</p>') } },
        ],
      },
      '1001|2026-10-16': {
        date: '2026-10-16',
        matieres: [{ id: 503, aFaire: { idDevoir: 503, contenu: b64('<p>Exercise 4</p>') } }],
      },
    },
    lessons: {
      1001: [
        lesson(11, 'MATHEMATIQUES', '2026-10-14 08:00', '2026-10-14 08:55', 'S12'),
        lesson(12, 'FRANCAIS', '2026-10-14 09:00', '2026-10-14 09:55', 'S04'),
        lesson(13, 'HISTOIRE-GEO', '2026-10-15 10:00', '2026-10-15 10:55', 'S07'),
        lesson(14, 'ANGLAIS', '2026-10-15 11:00', '2026-10-15 11:55', 'S02'),
        lesson(15, 'SVT', '2026-10-15 14:00', '2026-10-15 14:55', 'LAB1'),
      ],
      1002: [],
    },
    schoolLife: {
      1001: {
        absencesRetards: [
          {
            id: 70,
            typeElement: 'Absence',
            date: '2026-09-25',
            displayDate: 'le jeudi 25 septembre 2026',
            justifie: true,
          },
          { id: 71, typeElement: 'Retard', date: '2026-10-06', displayDate: '6 oct.' },
        ],
      },
      1002: { absencesRetards: [] },
    },
    messages: {
      100: {
        messages: {
          received: [
            {
              id: 900,
              subject: 'Sortie scolaire',
              from: { civilite: 'Mme', prenom: 'Anne', nom: 'DUPONT' },
              date: '2026-10-13 18:00:00',
              read: false,
            },
          ],
        },
        pagination: { messagesRecusNotReadCount: 1 },
      },
    },
  };
}

export function lesson(id, subject, start, end, room = '') {
  return {
    id,
    text: subject,
    matiere: subject,
    codeMatiere: subject.slice(0, 4),
    typeCours: 'COURS',
    start_date: start,
    end_date: end,
    prof: 'M. PROF',
    salle: room,
    isAnnule: false,
    isModifie: false,
  };
}

/**
 * Create the fake server.
 * @param {object} [options]
 * @param {boolean} [options.doubleAuth] the account asks the security question
 */
export function createFakeEcoleDirecte({ doubleAuth = false } = {}) {
  const state = {
    fixtures: createFixtures(),
    username: 'claire.martin',
    password: 'p+ss&word',
    doubleAuth,
    pair: { cn: 'Y24tdmFsdWU=', cv: 'Y3YtdmFsdWU=' },
    tokenCount: 0,
    validTokens: new Set(),
    expireTokens: false,
    calls: [],
    logins: [],
    down: false,
  };

  const json = (body, headers = {}) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...headers },
    });

  const newToken = () => {
    state.tokenCount += 1;
    const token = `token-${state.tokenCount}`;
    state.validTokens.add(token);
    return token;
  };

  async function fetch(url, init = {}) {
    if (state.down) {
      throw new TypeError('fetch failed');
    }
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/v3\//, '');
    const headers = init.headers ?? {};
    const raw = typeof init.body === 'string' ? init.body : '';
    const data = raw.startsWith('data=') ? JSON.parse(decodeURIComponent(raw.slice(5))) : null;
    state.calls.push({ path, query: Object.fromEntries(parsed.searchParams), headers, data });

    if (path === 'login.awp' && parsed.searchParams.get('gtk') === '1') {
      return json({ code: 200 }, { 'Set-Cookie': `GTK=${GTK}; Path=/; Secure` });
    }
    if (path === 'login.awp') {
      state.logins.push(data);
      if (headers['X-Gtk'] !== GTK) {
        return json({ code: 505, token: '', message: 'Identifiant et/ou mot de passe invalide !' });
      }
      if (data.identifiant !== state.username || data.motdepasse !== state.password) {
        return json({ code: 505, token: '', message: 'Mot de passe invalide !' });
      }
      const fa = data.fa?.[0];
      const pairOk = fa && fa.cn === state.pair.cn && fa.cv === state.pair.cv;
      if (state.doubleAuth && !pairOk) {
        return json({ code: 250, token: newToken(), message: '', data: {} });
      }
      return json({ code: 200, token: newToken(), data: { accounts: state.fixtures.accounts } });
    }

    const token = headers['X-Token'];
    if (!state.validTokens.has(token)) {
      return json({ code: 520, token: '', message: 'Token invalide !' });
    }
    if (state.expireTokens) {
      state.expireTokens = false;
      state.validTokens.clear();
      return json({ code: 525, token: '', message: 'Token expiré' });
    }
    const ok = (body) => json({ code: 200, token, data: body });

    if (path === 'connexion/doubleauth.awp') {
      if (parsed.searchParams.get('verbe') === 'get') {
        return ok({ question: b64(QUESTION), propositions: PROPOSITIONS.map(b64) });
      }
      if (data.choix === b64(RIGHT_ANSWER)) {
        return ok(state.pair);
      }
      return json({ code: 400, token, message: 'Mauvaise réponse', data: {} });
    }

    const { fixtures } = state;
    let match;
    if ((match = path.match(/^eleves\/(\d+)\/notes\.awp$/))) {
      return ok(fixtures.notes[match[1]] ?? { periodes: [], notes: [] });
    }
    if ((match = path.match(/^Eleves\/(\d+)\/cahierdetexte\/(\d{4}-\d{2}-\d{2})\.awp$/))) {
      return ok(fixtures.homeworkDetails[`${match[1]}|${match[2]}`] ?? { matieres: [] });
    }
    if ((match = path.match(/^Eleves\/(\d+)\/cahierdetexte\.awp$/))) {
      return ok(fixtures.homework[match[1]] ?? {});
    }
    if ((match = path.match(/^E\/(\d+)\/emploidutemps\.awp$/))) {
      return ok(fixtures.lessons[match[1]] ?? []);
    }
    if ((match = path.match(/^eleves\/(\d+)\/viescolaire\.awp$/))) {
      return ok(fixtures.schoolLife[match[1]] ?? { absencesRetards: [] });
    }
    if ((match = path.match(/^(?:familles|eleves)\/(\d+)\/messages\.awp$/))) {
      return ok(fixtures.messages[match[1]] ?? { messages: { received: [] } });
    }
    return json({ code: 404, token, message: `Unknown route ${path}` });
  }

  return { fetch, state };
}

/** 2026-10-14 08:30 in Paris (a Wednesday). */
export const NOW = new Date('2026-10-14T06:30:00Z');
