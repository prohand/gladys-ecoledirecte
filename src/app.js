// -----------------------------------------------------------------------------
// SDK wiring: every Gladys handler, registered on one runtime.
//
// Kept out of index.js so the tests can run the exact same wiring against the
// SDK's fake Gladys (see test/app.test.js).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { createRuntime } from './runtime.js';
import { ACTIONS } from './actions.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS, refreshWidgets } from './capabilities/widgets.js';

const logger = createLogger({ name: 'app' });

/**
 * Register the handlers and return the runtime.
 * @param {object} gladys the SDK instance
 * @param {object} [options] passed to createRuntime (client, store, clock)
 */
export function registerHandlers(gladys, options = {}) {
  const runtime = createRuntime({
    gladys,
    onWidgetsChanged: () => refreshWidgets(gladys),
    ...options,
  });

  // Discovery: Gladys asks for the device list (the "Discovery" tab).
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> synchronizing and publishing the students');
    await runtime.sync();
    await runtime.publishDevices({ force: true });
  });

  // A device created from the Discovery tab: its states, right away (the SDK
  // forgot the values remembered for it, so they all go out).
  gladys.onDeviceCreated(async () => {
    await runtime.publishStates();
  });

  // Manifest actions (Configuration screen).
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, (fields) => handler(runtime, { fields }));
  }

  // Scene actions (Gladys 5.1+). Scene TRIGGERS need no handler: the sync
  // fires them (src/capabilities/triggers.js).
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(runtime, { fields }));
  }

  // Dashboard widgets (Gladys 5.1+).
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(runtime, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
      widget.action(runtime, { actionKey, params, settings }),
    );
  }

  gladys.onConfigUpdated(async (config) => {
    logger.info('onConfigUpdated -> new configuration received');
    runtime.setConfig(config);
    runtime.startTimers();
    await runtime.sync();
    // The language of the names may have changed: publish the devices again.
    await runtime.publishDevices();
  });

  gladys.on('connected', async () => {
    try {
      runtime.setConfig(await gladys.getConfig());
      runtime.startTimers();
      await runtime.sync();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Logs der Integration.',
          es: 'La inicialización ha fallado, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    runtime.stopTimers();
  });

  return runtime;
}
