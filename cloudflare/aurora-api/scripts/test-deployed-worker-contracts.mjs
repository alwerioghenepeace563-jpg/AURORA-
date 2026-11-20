import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const smokeScript = fileURLToPath(new URL('./test-deployed-worker.mjs', import.meta.url));

function run(envOverrides = {}) {
  const env = { ...process.env, ...envOverrides };
  for (const key of ['AURORA_WORKER_URL', 'AURORA_SMOKE_ORIGIN', 'AURORA_SMOKE_TIMEOUT_MS']) {
    if (!Object.hasOwn(envOverrides, key)) delete env[key];
  }
  return spawnSync(process.execPath, [smokeScript], {
    encoding: 'utf8',
    env,
    timeout: 5000
  });
}

const missing = run({});
assert.equal(missing.status, 2);
assert.match(missing.stderr, /Set AURORA_WORKER_URL/);

for (const value of [
  'http://aurora-api.example.workers.dev',
  'https://aurora-api.example.workers.dev/api',
  'https://user:pass@aurora-api.example.workers.dev',
  'https://aurora-api.example.workers.dev?debug=1',
  'https://aurora-api.example.workers.dev#fragment',
  'not-a-url'
]) {
  const result = run({ AURORA_WORKER_URL: value });
  assert.equal(result.status, 2, `Expected invalid Worker origin to be rejected: ${value}`);
  assert.match(result.stderr, /AURORA_WORKER_URL must be/);
}

for (const value of [
  'http://localhost:3000',
  'https://user:pass@example.com',
  'https://example.com/path',
  'https://example.com?debug=1',
  'not-a-url'
]) {
  const result = run({
    AURORA_WORKER_URL: 'https://aurora-api.example.workers.dev',
    AURORA_SMOKE_ORIGIN: value
  });
  assert.equal(result.status, 2, `Expected invalid smoke origin to be rejected: ${value}`);
  assert.match(result.stderr, /AURORA_SMOKE_ORIGIN must be/);
}

for (const value of ['0', '-1', '999', '60001', '1.5', 'abc']) {
  const result = run({
    AURORA_WORKER_URL: 'https://aurora-api.example.workers.dev',
    AURORA_SMOKE_TIMEOUT_MS: value
  });
  assert.equal(result.status, 2, `Expected invalid timeout to be rejected: ${value}`);
  assert.match(result.stderr, /AURORA_SMOKE_TIMEOUT_MS must be/);
}


console.log('AURORA deployed Worker smoke-test input contracts passed.');
