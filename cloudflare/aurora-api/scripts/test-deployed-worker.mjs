import assert from 'node:assert/strict';

function parseBareHttpsOrigin(raw, variableName) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    console.error(`${variableName} must be a valid bare HTTPS origin.`);
    process.exit(2);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    console.error(`${variableName} must be a bare HTTPS origin (no path, credentials, query, or fragment).`);
    process.exit(2);
  }
  return parsed;
}

const rawOrigin = (process.env.AURORA_WORKER_URL || '').trim();
if (!rawOrigin) {
  console.error('Set AURORA_WORKER_URL to the deployed Worker HTTPS origin.');
  process.exit(2);
}
const origin = parseBareHttpsOrigin(rawOrigin, 'AURORA_WORKER_URL');

const smokeOrigin = (process.env.AURORA_SMOKE_ORIGIN || '').trim();
if (smokeOrigin) parseBareHttpsOrigin(smokeOrigin, 'AURORA_SMOKE_ORIGIN');

const timeoutRaw = process.env.AURORA_SMOKE_TIMEOUT_MS || '10000';
const timeout = Number(timeoutRaw);
if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60000) {
  console.error('AURORA_SMOKE_TIMEOUT_MS must be a whole number from 1000 to 60000.');
  process.exit(2);
}
const headers = {
  ...(smokeOrigin ? { Origin: smokeOrigin } : {}),
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache'
};

async function get(path) {
  const response = await fetch(new URL(path, origin), {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeout),
    redirect: 'manual'
  });
  const body = await response.json().catch(() => null);
  assert.equal(response.status, 200, `${path}: expected HTTP 200, received ${response.status}`);
  assert.ok(body && typeof body === 'object', `${path}: expected a JSON object`);
  return { response, body };
}

async function getText(path) {
  const response = await fetch(new URL(path, origin), {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(timeout),
    redirect: 'manual'
  });
  const body = await response.text();
  assert.equal(response.status, 200, `${path}: expected HTTP 200, received ${response.status}`);
  return { response, body };
}

async function options(path) {
  const response = await fetch(new URL(path, origin), {
    method: 'OPTIONS',
    headers,
    signal: AbortSignal.timeout(timeout),
    redirect: 'manual'
  });
  assert.equal(response.status, 204, `${path}: expected OPTIONS 204, received ${response.status}`);
  return response;
}

const { response: appResponse, body: appHtml } = await getText('/');
assert.ok((appResponse.headers.get('content-type') || '').includes('text/html'), 'Root must serve the AURORA SPA HTML');
assert.match(appHtml, /<div[^>]+id=["']root["']/i, 'Root HTML must include the React mount point');
assert.match(appResponse.headers.get('cache-control') || '', /no-store|no-cache/i,
  'SPA shell must not be cached across asset deployments');
const jsAsset = appHtml.match(/<script[^>]+src=["']([^"']+)["']/i)?.[1];
assert.ok(jsAsset && jsAsset.split('?')[0].endsWith('.js'), 'Root HTML must reference a built JavaScript asset');
const jsAssetUrl = new URL(jsAsset, origin);
jsAssetUrl.searchParams.set('__aurora_asset_probe', String(Date.now()));
const { response: jsResponse, body: jsBody } = await getText(jsAssetUrl.toString());
const jsContentType = jsResponse.headers.get('content-type') || '';
assert.match(jsContentType, /javascript|ecmascript/i,
  `Built app JavaScript ${jsAssetUrl.pathname} must be served as JavaScript; received HTTP ${jsResponse.status}, content-type "${jsContentType}", body prefix: ${jsBody.slice(0, 120)}`);
const { response: spaResponse, body: spaHtml } = await getText('/__aurora_cloudflare_spa_probe__');
assert.ok((spaResponse.headers.get('content-type') || '').includes('text/html'), 'Unknown frontend paths must use SPA fallback');
assert.match(spaHtml, /id=["']root["']/i, 'SPA fallback must serve the AURORA application shell');

await options('/api/admin-code');
await options('/api/voicetext');
await options('/api/v1/chat');

const { body: health } = await get('/health');
assert.equal(health.ok, true, 'Worker health must report ok=true');
const { body: healthAlias } = await get('/api/health');
assert.equal(healthAlias.ok, true, 'Legacy /api/health alias must report ok=true');
assert.ok(Array.isArray(healthAlias.configuredProviders), 'Health alias must return configuredProviders');
assert.equal(healthAlias.integrations?.adminCodeEditing, healthAlias.integrations?.adminCodeEditing,
  'Admin code readiness must be exposed as a boolean');
assert.equal(typeof healthAlias.integrations?.adminCodeEditing, 'boolean',
  'Admin code readiness must be reported without exposing credentials');

assert.equal(health.platform, 'cloudflare-workers', 'Unexpected API platform');
assert.equal(health.safeToSwitchClients, false, 'Client switching must remain blocked until release gates are independently verified');
assert.equal(health.releaseGates?.rowLevelSecurityVerified, false, 'RLS must not be marked verified by a smoke test');
assert.equal(health.releaseGates?.legacyParityVerified, false, 'Legacy parity must not be marked verified by a smoke test');
assert.equal(health.releaseGates?.rollbackVerified, false, 'Rollback must not be marked verified by a smoke test');

const { response: metadataResponse, body: metadata } = await get('/api/meta?handler=health');
assert.equal(metadata.ok, true, 'Metadata health must report ok=true');
assert.ok(Array.isArray(metadata.configuredProviders), 'Metadata must return configuredProviders');
assert.ok(metadata.integrations && typeof metadata.integrations === 'object', 'Metadata must return integration status');
if (smokeOrigin) {
  assert.equal(metadataResponse.headers.get('access-control-allow-origin'), smokeOrigin,
    'Configured smoke origin must be allowed by CORS');
}

console.log('AURORA deployed Worker smoke checks passed: SPA shell, static JS asset, SPA fallback, API aliases, admin/VoiceText route preflight, health, and metadata.');
console.log(`Platform: ${health.platform}`);
console.log(`Stage: ${health.stage || 'unknown'}`);
console.log(`Configured chat providers: ${metadata.configuredProviders.join(', ') || 'none'}`);
console.log('Client switching remains blocked pending RLS, parity, rollback, and monitoring verification.');
