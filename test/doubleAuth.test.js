import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { ACTION_KEYS } from '../src/actions.js';
import { QUESTION, RIGHT_ANSWER } from './helpers/fakeEcoleDirecte.js';
import { setup } from './helpers/setup.js';

const action = async (gladys, key, fields = {}) => {
  const ack = await gladys.fake.action(key, fields);
  assert.equal(ack.success, true, ack.error);
  return ack.data.message;
};

test('an account under double authentication says so, then the question is answered', async (t) => {
  const store = createStore({ dir: null });
  const { gladys, ed, stop } = await setup({ doubleAuth: true, store });
  t.after(stop);

  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /question de sécurité/);

  const question = await action(gladys, ACTION_KEYS.DOUBLE_AUTH_QUESTION);
  assert.ok(question.fr.startsWith(QUESTION));
  assert.match(question.fr, /1\. 1978 — 2\. 1981 — 3\. 1984/);

  const answer = await action(gladys, ACTION_KEYS.DOUBLE_AUTH_ANSWER, { answer: '2' });
  assert.match(answer.fr, /Réponse acceptée/);
  assert.match(answer.fr, /Emma MARTIN \(5ème B\)/);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  // The pair is saved and sent at the next login.
  assert.deepEqual(store.getDoubleAuth(ed.state.username), ed.state.pair);
  assert.deepEqual(ed.state.logins.at(-1).fa, [ed.state.pair]);
  // The login right after the answer also sends the pair at the top level.
  assert.equal(ed.state.logins.at(-1).cn, ed.state.pair.cn);
});

test('the answer can be typed as its text', async (t) => {
  const { gladys, stop } = await setup({ doubleAuth: true });
  t.after(stop);
  await action(gladys, ACTION_KEYS.DOUBLE_AUTH_QUESTION);
  const answer = await action(gladys, ACTION_KEYS.DOUBLE_AUTH_ANSWER, {
    answer: ` ${RIGHT_ANSWER} `,
  });
  assert.match(answer.en, /Answer accepted/);
});

test('an answer matching no proposition lists them again', async (t) => {
  const { gladys, stop } = await setup({ doubleAuth: true });
  t.after(stop);
  await action(gladys, ACTION_KEYS.DOUBLE_AUTH_QUESTION);
  const answer = await action(gladys, ACTION_KEYS.DOUBLE_AUTH_ANSWER, { answer: '7' });
  assert.match(answer.en, /matches no proposition/);
  assert.match(answer.en, /2\. 1981/);
});

test('a wrong proposition is refused by EcoleDirecte', async (t) => {
  const { gladys, stop } = await setup({ doubleAuth: true });
  t.after(stop);
  await action(gladys, ACTION_KEYS.DOUBLE_AUTH_QUESTION);
  const answer = await action(gladys, ACTION_KEYS.DOUBLE_AUTH_ANSWER, { answer: '1' });
  assert.match(answer.en, /refused this answer/);
});

test('answering without a question asks for the question first', async (t) => {
  const { gladys, stop } = await setup({ doubleAuth: true });
  t.after(stop);
  const answer = await action(gladys, ACTION_KEYS.DOUBLE_AUTH_ANSWER, { answer: '2' });
  assert.match(answer.en, /No question is waiting/);
});

test('the scheduled sync waits while a question is being answered', async (t) => {
  const { gladys, runtime, ed, stop } = await setup({ doubleAuth: true });
  t.after(stop);
  await action(gladys, ACTION_KEYS.DOUBLE_AUTH_QUESTION);
  const logins = ed.state.logins.length;
  const result = await runtime.sync();
  assert.equal(result.reason, 'question-pending');
  assert.equal(ed.state.logins.length, logins, 'a new login would void the question');
});

test('a saved pair EcoleDirecte no longer accepts is forgotten', async (t) => {
  const store = createStore({ dir: null });
  store.setDoubleAuth('claire.martin', { cn: 'old', cv: 'old' });
  const { gladys, stop } = await setup({ doubleAuth: true, store });
  t.after(stop);
  assert.equal(store.getDoubleAuth('claire.martin'), null);
  assert.equal(gladys.fake.connectionStatus.connected, false);
});

test('without double authentication, the question button says the connection works', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const answer = await action(gladys, ACTION_KEYS.DOUBLE_AUTH_QUESTION);
  assert.match(answer.en, /asks no security question/);
});

test('test_connection lists the students found', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const answer = await action(gladys, ACTION_KEYS.TEST_CONNECTION);
  assert.match(answer.en, /Connected to EcoleDirecte/);
  assert.match(answer.de, /Emma MARTIN \(5ème B\), Léo MARTIN \(6ème A\)/);
});

test('test_connection without credentials asks for them', async (t) => {
  const { gladys, stop } = await setup({ config: { username: '' } });
  t.after(stop);
  const answer = await action(gladys, ACTION_KEYS.TEST_CONNECTION);
  assert.match(answer.es, /usuario y su contraseña/);
});
