import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DAYS } from '../src/capabilities/days.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  WIDGET_KEYS,
  refreshWidgets,
} from '../src/capabilities/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { deviceOf, setup } from './helpers/setup.js';

const get = async (gladys, key, settings, language = 'fr') => {
  const ack = await gladys.fake.widgetGet(key, { settings, language, units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
};

test('every widget content is rendered exactly as sent, in every language', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  for (const key of Object.values(WIDGET_KEYS)) {
    for (const language of LANGUAGES) {
      for (const student of [1001, 1002]) {
        for (const day of Object.values(DAYS)) {
          const content = await get(
            gladys,
            key,
            { student: deviceOf(gladys, student), day },
            language,
          );
          assert.deepEqual(validateWidgetContent(content), [], `${key} ${language} ${student}`);
        }
      }
    }
  }
});

test('the empty states are valid too', async (t) => {
  const { gladys, stop } = await setup({ config: { password: 'wrong' } });
  t.after(stop);
  for (const key of Object.values(WIDGET_KEYS)) {
    const unset = await get(gladys, key, {});
    assert.deepEqual(validateWidgetContent(unset), []);
    assert.match(unset.components[0].text, /Choisissez un élève/);
    const unknown = await get(gladys, key, { student: deviceOf(gladys, 1001) });
    assert.deepEqual(validateWidgetContent(unknown), []);
    assert.match(unknown.components[0].text, /Pas encore de données/);
  }
});

test('the overview tiles are bound to features the integration publishes', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const featureIds = new Set(
    gladys.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  const content = await get(gladys, WIDGET_KEYS.OVERVIEW, { student: deviceOf(gladys, 1001) });
  const tiles = content.components.filter((component) => component.device_feature);
  assert.equal(tiles.length, 4);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), tile.device_feature);
  }
  const status = content.components.find((component) => component.type === 'status');
  assert.equal(status.items[0].value, '09:00 FRANCAIS (S04)');
});

test('the homework list shows what is left, the content one tap away', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  const content = await get(
    gladys,
    WIDGET_KEYS.HOMEWORK,
    { student: deviceOf(gladys, 1001) },
    'en',
  );
  const list = content.components.find((component) => component.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.subtitle, item.badge?.text, item.description]),
    [
      ['MATHEMATIQUES', 'Due 15/10', 'Test', 'Réviser le chapitre 2'],
      ['ANGLAIS', 'Due 16/10', undefined, 'Exercise 4'],
    ],
  );
});

test('the timetable flags a cancelled lesson', async (t) => {
  const { gladys, ed, runtime, stop } = await setup();
  t.after(stop);
  ed.state.fixtures.lessons[1001][3].isAnnule = true;
  await runtime.sync();
  const content = await get(gladys, WIDGET_KEYS.TIMETABLE, {
    student: deviceOf(gladys, 1001),
    day: DAYS.TOMORROW,
  });
  const list = content.components.find((component) => component.type === 'card-list');
  assert.deepEqual(
    list.items.map((item) => [item.title, item.badge?.text]),
    [
      ['10:00–10:55 HISTOIRE-GEO', undefined],
      ['11:00–11:55 ANGLAIS', 'Annulé'],
      ['14:00–14:55 SVT', undefined],
    ],
  );
});

test('every button action is handled and answers a short toast', async (t) => {
  const { gladys, stop } = await setup();
  t.after(stop);
  for (const key of Object.values(WIDGET_KEYS)) {
    const content = await get(gladys, key, { student: deviceOf(gladys, 1001) });
    for (const { action } of content.components.filter((c) => c.type === 'button')) {
      const ack = await gladys.fake.widgetAction(key, action.key, action.params ?? {}, {
        settings: {},
      });
      assert.equal(ack.success, true, ack.error);
      assert.ok(ack.data.message.en.length <= 200);
    }
  }
  const unknown = await gladys.fake.widgetAction(
    WIDGET_KEYS.OVERVIEW,
    'nope',
    {},
    { settings: {} },
  );
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /Unknown widget action/);
});

test('a failed refresh says so', async (t) => {
  const { ed, runtime, stop } = await setup();
  t.after(stop);
  ed.state.down = true;
  runtime.setConfig({ ...runtime.config, username: 'someone' });
  const message = await WIDGETS[WIDGET_KEYS.HOMEWORK].action(runtime, {
    actionKey: WIDGET_ACTIONS.REFRESH,
  });
  assert.match(message.en, /failed/);
});

test('a sync nudges every widget', async (t) => {
  const { gladys, runtime, stop } = await setup();
  t.after(stop);
  const before = gladys.fake.widgetRefreshes.length;
  await runtime.sync();
  assert.deepEqual(gladys.fake.widgetRefreshes.slice(before), Object.values(WIDGET_KEYS));
  const fresh = createFakeGladys();
  refreshWidgets(fresh);
  assert.deepEqual(fresh.fake.widgetRefreshes, Object.keys(WIDGETS));
});
