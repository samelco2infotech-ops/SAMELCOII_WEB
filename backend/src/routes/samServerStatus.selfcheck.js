const assert = require('assert');
const route = require('./samServerStatus');

const { parsePm2Output } = route._selfcheck;

// Real pm2 jlist shape (trimmed to the fields we read).
const sample = JSON.stringify([{
  name: 'samelcii-api',
  pm2_env: { status: 'online', restart_time: 3, pm_uptime: Date.now() - 60000 },
  monit: { memory: 104857600, cpu: 2 },
}]);
const parsed = parsePm2Output(sample);
assert.strictEqual(parsed.length, 1, 'parses one process entry');
assert.strictEqual(parsed[0].name, 'samelcii-api');
assert.strictEqual(parsed[0].status, 'online');
assert.strictEqual(parsed[0].restarts, 3);
assert.strictEqual(parsed[0].memoryMb, 100, 'bytes converted to MB');
assert.ok(parsed[0].uptimeMs >= 60000, 'uptime computed from pm_uptime');

// Never throws — empty/null/malformed input must degrade to [], not crash the route.
assert.deepStrictEqual(parsePm2Output(null), []);
assert.deepStrictEqual(parsePm2Output(''), []);
assert.deepStrictEqual(parsePm2Output('not json'), []);
assert.deepStrictEqual(parsePm2Output('{}'), []); // valid JSON but not an array

const methods = route.stack
  .filter((layer) => layer.route)
  .map((layer) => `${Object.keys(layer.route.methods)[0].toUpperCase()} ${layer.route.path}`);
assert.deepStrictEqual(methods, ['GET /']);

console.log('OK — SAM server status route self-check passed (pm2 output parsing + route shape)');
