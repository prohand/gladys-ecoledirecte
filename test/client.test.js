import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_VERSION,
  ERROR_KINDS,
  USER_AGENT,
  createClient,
  decodeBase64,
} from '../src/ecoledirecte/client.js';
import { GTK, createFakeEcoleDirecte } from './helpers/fakeEcoleDirecte.js';

const credentials = (ed) => ({ username: ed.state.username, password: ed.state.password });

test('login fetches the GTK cookie first and echoes it in X-Gtk', async () => {
  const ed = createFakeEcoleDirecte();
  const client = createClient({ fetch: ed.fetch });
  const accounts = await client.login(credentials(ed));
  assert.equal(accounts.length, 1);
  const [gtk, login] = ed.state.calls;
  assert.equal(gtk.query.gtk, '1');
  assert.equal(login.headers['X-Gtk'], GTK);
  assert.match(login.headers.Cookie, new RegExp(`GTK=${GTK}`));
  assert.equal(login.query.v, API_VERSION);
  assert.equal(login.headers['User-Agent'], USER_AGENT);
});

test('a password with + and & survives the form encoding', async () => {
  const ed = createFakeEcoleDirecte();
  const client = createClient({ fetch: ed.fetch });
  await client.login(credentials(ed));
  assert.equal(ed.state.logins[0].motdepasse, 'p+ss&word');
  assert.equal(ed.state.logins[0].isRelogin, false);
});

test('authenticated calls carry the token and the verb', async () => {
  const ed = createFakeEcoleDirecte();
  const client = createClient({ fetch: ed.fetch });
  await client.login(credentials(ed));
  await client.request('eleves/1001/notes.awp', { data: { anneeScolaire: '' } });
  const call = ed.state.calls.at(-1);
  assert.equal(call.headers['X-Token'], 'token-1');
  assert.equal(call.query.verbe, 'get');
  assert.deepEqual(call.data, { anneeScolaire: '' });
});

test('the API codes become error kinds', async () => {
  const ed = createFakeEcoleDirecte({ doubleAuth: true });
  const client = createClient({ fetch: ed.fetch });
  await assert.rejects(client.login(credentials(ed)), { kind: ERROR_KINDS.DOUBLE_AUTH, code: 250 });
  await assert.rejects(client.login({ username: 'x', password: 'y' }), {
    kind: ERROR_KINDS.CREDENTIALS,
    code: 505,
  });
  client.reset();
  await assert.rejects(client.request('eleves/1/notes.awp'), { kind: ERROR_KINDS.TOKEN });
});

test('a network failure is a NETWORK error, without the request details', async () => {
  const ed = createFakeEcoleDirecte();
  ed.state.down = true;
  const client = createClient({ fetch: ed.fetch });
  await assert.rejects(client.login(credentials(ed)), (err) => {
    assert.equal(err.kind, ERROR_KINDS.NETWORK);
    assert.ok(!err.message.includes(ed.state.password));
    return true;
  });
});

test('an HTTP error or a non-JSON answer is reported', async () => {
  const client = createClient({ fetch: async () => new Response('oops', { status: 502 }) });
  await assert.rejects(client.request('x.awp'), { kind: ERROR_KINDS.NETWORK });
  const html = createClient({ fetch: async () => new Response('<html>', { status: 200 }) });
  await assert.rejects(html.request('x.awp'), { kind: ERROR_KINDS.API });
});

test('the security question is decoded, the answer gives the pair', async () => {
  const ed = createFakeEcoleDirecte({ doubleAuth: true });
  const client = createClient({ fetch: ed.fetch });
  await client.login(credentials(ed)).catch(() => {});
  const { question, propositions } = await client.doubleAuthQuestion();
  assert.equal(question, 'Quelle est votre année de naissance ?');
  assert.deepEqual(
    propositions.map((proposition) => proposition.text),
    ['1978', '1981', '1984'],
  );
  assert.deepEqual(await client.doubleAuthAnswer(propositions[1].raw), ed.state.pair);
  await assert.rejects(client.doubleAuthAnswer(propositions[0].raw));
});

test('decodeBase64 reads UTF-8', () => {
  assert.equal(decodeBase64(Buffer.from('Réviser', 'utf8').toString('base64')), 'Réviser');
  assert.equal(decodeBase64(''), '');
  assert.equal(decodeBase64(undefined), '');
});
