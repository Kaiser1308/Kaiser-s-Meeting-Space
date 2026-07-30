// @kms/database public surface. T01 exports client + schema barrel only;
// T05 appends repository exports.
export * from './client.js';
export * from './migrator.js';
export * as schema from './schema/index.js';
export * from './repositories/index.js';
