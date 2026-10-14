// -----------------------------------------------------------------------------
// HTTP client of the EcoleDirecte API (https://api.ecoledirecte.com/v3).
//
// The API is private and undocumented by its editor; what follows is what the
// community documented (github.com/EduWireApps/ecoledirecte-api-docs) and what
// the official web app does:
//   - every call is a POST; the real verb travels as `?verbe=get|post|put`;
//   - the body is a form with one field, `data`, holding JSON;
//   - the HTTP status is 200 even on errors: the outcome is the `code` of the
//     JSON answer (200 ok, 250 security question, 505 bad credentials,
//     520/525 token invalid or expired, 517 version refused, 535 school closed);
//   - login needs a "GTK" cookie fetched first (GET login.awp?gtk=1), echoed
//     in the `X-Gtk` header of the login POST — without it the API answers
//     "bad credentials" even for good ones;
//   - a new device must answer a security question (code 250): its answer
//     gives a "cn"/"cv" pair, sent back in `fa` at every later login;
//   - a token only works with the User-Agent it was issued to: one constant UA.
//
// Nothing here logs the password, the token or the cn/cv pair.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'ecoledirecte' });

export const API_URL = 'https://api.ecoledirecte.com/v3';
// The version the web app announces. The API refuses an unknown one (517).
export const API_VERSION = '4.75.0';
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/128.0.0.0 Safari/537.36';
const REQUEST_TIMEOUT_MS = 20_000;

/** Codes of the JSON answers, and what they mean for the integration. */
export const API_CODES = {
  OK: 200,
  DOUBLE_AUTH: 250,
  BAD_CREDENTIALS: 505,
  BAD_VERSION: 517,
  TOKEN_INVALID: 520,
  TOKEN_EXPIRED: 525,
  SCHOOL_CLOSED: 535,
};

/** Error kinds, read by the connection status and the action messages. */
export const ERROR_KINDS = {
  DOUBLE_AUTH: 'double-auth',
  CREDENTIALS: 'credentials',
  TOKEN: 'token',
  CLOSED: 'closed',
  VERSION: 'version',
  NETWORK: 'network',
  API: 'api',
};

export class EcoleDirecteError extends Error {
  constructor(kind, message, code = null) {
    super(message);
    this.name = 'EcoleDirecteError';
    this.kind = kind;
    this.code = code;
  }
}

function kindOf(code) {
  switch (code) {
    case API_CODES.DOUBLE_AUTH:
      return ERROR_KINDS.DOUBLE_AUTH;
    case API_CODES.BAD_CREDENTIALS:
      return ERROR_KINDS.CREDENTIALS;
    case API_CODES.TOKEN_INVALID:
    case API_CODES.TOKEN_EXPIRED:
      return ERROR_KINDS.TOKEN;
    case API_CODES.SCHOOL_CLOSED:
      return ERROR_KINDS.CLOSED;
    case API_CODES.BAD_VERSION:
      return ERROR_KINDS.VERSION;
    default:
      return ERROR_KINDS.API;
  }
}

/** Base64 (as the API sends the QCM and the homework) -> UTF-8 text. */
export function decodeBase64(value) {
  return value ? Buffer.from(String(value), 'base64').toString('utf8') : '';
}

/** Parse the `name=value` part of every Set-Cookie header. */
function readCookies(response) {
  const lines =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
  const cookies = {};
  for (const line of lines) {
    const [pair] = String(line).split(';');
    const index = pair.indexOf('=');
    if (index > 0) {
      cookies[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
    }
  }
  return cookies;
}

/**
 * Create a client. One client = one EcoleDirecte session (token + cookies).
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] injected in the tests
 */
export function createClient({ fetch: fetchImpl = globalThis.fetch } = {}) {
  let token = '';
  let cookies = {};

  function cookieHeader() {
    return Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  async function send(url, { method = 'POST', body, headers = {} } = {}) {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json, text/plain, */*',
          ...(body !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(token ? { 'X-Token': token } : {}),
          ...(Object.keys(cookies).length ? { Cookie: cookieHeader() } : {}),
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new EcoleDirecteError(ERROR_KINDS.NETWORK, `EcoleDirecte unreachable: ${err.message}`);
    }
    Object.assign(cookies, readCookies(response));
    return response;
  }

  async function readJson(response) {
    if (!response.ok) {
      throw new EcoleDirecteError(ERROR_KINDS.NETWORK, `EcoleDirecte HTTP ${response.status}`);
    }
    let json;
    try {
      json = await response.json();
    } catch {
      throw new EcoleDirecteError(
        ERROR_KINDS.API,
        'EcoleDirecte answered something else than JSON',
      );
    }
    // Every answer may carry a renewed token: always keep the newest one.
    const renewed = json?.token || response.headers.get('x-token');
    if (renewed) {
      token = renewed;
    }
    return json ?? {};
  }

  /** Encode the `data` form field: JSON, URL-encoded (a `+` or `&` in a password survives). */
  function formBody(data) {
    return `data=${encodeURIComponent(JSON.stringify(data ?? {}))}`;
  }

  /**
   * Log in. Resolves the accounts; rejects with an EcoleDirecteError whose
   * `kind` is DOUBLE_AUTH when the security question must be answered (the
   * token received then allows exactly that, see doubleAuthQuestion).
   *
   * @param {{ username: string, password: string, doubleAuth?: { cn: string, cv: string } | null }} credentials
   */
  async function login({ username, password, doubleAuth = null }) {
    token = '';
    cookies = {};
    // The GTK cookie first: the login POST is refused without it.
    await send(`${API_URL}/login.awp?gtk=1&v=${API_VERSION}`, { method: 'GET' });
    const gtk = cookies.GTK;
    if (!gtk) {
      logger.warn('EcoleDirecte gave no GTK cookie: the login will probably be refused');
    }
    const payload = {
      identifiant: username,
      motdepasse: password,
      isRelogin: false,
      uuid: '',
      ...(doubleAuth ? { fa: [{ cn: doubleAuth.cn, cv: doubleAuth.cv }] } : {}),
    };
    const json = await readJson(
      await send(`${API_URL}/login.awp?v=${API_VERSION}`, {
        body: formBody(payload),
        headers: gtk ? { 'X-Gtk': gtk } : {},
      }),
    );
    if (json.code !== API_CODES.OK) {
      throw new EcoleDirecteError(
        kindOf(json.code),
        json.message || `EcoleDirecte login refused (code ${json.code})`,
        json.code,
      );
    }
    return json.data?.accounts ?? [];
  }

  /**
   * Call an authenticated endpoint.
   * @param {string} path e.g. `eleves/1234/notes.awp`
   * @param {{ verbe?: string, query?: Record<string, string>, data?: object }} [options]
   * @returns {Promise<any>} the `data` of the answer
   */
  async function request(path, { verbe = 'get', query = {}, data = {} } = {}) {
    const params = new URLSearchParams({ verbe, ...query, v: API_VERSION });
    const json = await readJson(
      await send(`${API_URL}/${path}?${params.toString()}`, { body: formBody(data) }),
    );
    if (json.code !== API_CODES.OK) {
      throw new EcoleDirecteError(
        kindOf(json.code),
        json.message || `EcoleDirecte refused ${path.replace(/\d+/g, '…')} (code ${json.code})`,
        json.code,
      );
    }
    return json.data;
  }

  /** The security question, decoded: `{ question, propositions: [{ raw, text }] }`. */
  async function doubleAuthQuestion() {
    const data = await request('connexion/doubleauth.awp', { verbe: 'get', data: {} });
    return {
      question: decodeBase64(data?.question),
      propositions: (data?.propositions ?? []).map((raw) => ({ raw, text: decodeBase64(raw) })),
    };
  }

  /** Answer the security question with one proposition as received (base64). */
  async function doubleAuthAnswer(raw) {
    const data = await request('connexion/doubleauth.awp', {
      verbe: 'post',
      data: { choix: raw },
    });
    if (!data?.cn || !data?.cv) {
      throw new EcoleDirecteError(ERROR_KINDS.DOUBLE_AUTH, 'EcoleDirecte refused the answer');
    }
    return { cn: data.cn, cv: data.cv };
  }

  return {
    login,
    request,
    doubleAuthQuestion,
    doubleAuthAnswer,
    hasToken: () => Boolean(token),
    reset() {
      token = '';
      cookies = {};
    },
  };
}
