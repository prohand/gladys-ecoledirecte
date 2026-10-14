// The integration wired on the SDK's fake Gladys and the fake EcoleDirecte.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { createClient } from '../../src/ecoledirecte/client.js';
import { createStore } from '../../src/store.js';
import { createFakeEcoleDirecte, NOW } from './fakeEcoleDirecte.js';

/**
 * @param {object} [options]
 * @param {boolean} [options.doubleAuth] the account asks the security question
 * @param {object} [options.config] configuration overrides
 * @param {object} [options.store] a store to reuse (simulates a restart)
 */
export async function setup({ doubleAuth = false, config = {}, store, connect = true } = {}) {
  const ed = createFakeEcoleDirecte({ doubleAuth });
  const clock = { now: NOW };
  const gladys = createFakeGladys({
    config: { username: ed.state.username, password: ed.state.password, ...config },
  });
  const runtime = registerHandlers(gladys, {
    client: createClient({ fetch: ed.fetch }),
    store: store ?? createStore({ dir: null }),
    now: () => clock.now,
  });
  if (connect) {
    await gladys.connect();
  }
  return { ed, gladys, runtime, clock, stop: () => runtime.stopTimers() };
}

export const deviceOf = (gladys, studentId) =>
  gladys.externalIds('student', String(studentId)).device;
