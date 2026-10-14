// -----------------------------------------------------------------------------
// Entry point of the EcoleDirecte integration for Gladys Assistant.
//
// The SDK reads the three variables the Gladys supervisor injects
// (GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR):
// `new GladysIntegration()` is enough. Every handler is registered in
// src/app.js, before connect().
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const runtime = registerHandlers(gladys);

// An unexpected rejection is logged, never fatal: the next sync retries.
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection', err);
});

gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  runtime.stopTimers();
});

logger.info('Starting the EcoleDirecte integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
