import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = 8791;
const base = `http://${host}:${port}`;
const allowedOrigin = 'https://aurora-ten-gold.vercel.app';
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--ip', host, '--port', String(port), '--log-level', 'error'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function request(path, init = {}) {
  return fetch(base + path, { ...init, signal: AbortSignal.timeout(5000) });
}
async function expectStatus(path, expected, init = {}) {
  const response = await request(path, init);
  assert.equal(response.status, expected, `${init.method || 'GET'} ${path}: expected ${expected}, got ${response.status}`);
  return response;
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited early (${child.exitCode}).\n${output}`);
    try {
      const response = await fetch(base + '/health', { signal: AbortSignal.timeout(700) });
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, `Wrangler did not become ready.\n${output}`);

  const homepageResponse = await expectStatus('/', 200);
  assert.match(homepageResponse.headers.get('content-type') || '', /text\/html/i);
  const homepageHtml = await homepageResponse.text();
  assert.match(homepageHtml, /<html|<!doctype html/i, 'Cloudflare should serve the built AURORA SPA at /');

  const healthResponse = await expectStatus('/health', 200);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.platform, 'cloudflare-workers');
  assert.equal(health.migration.dataLayerMoved, true);
  assert.equal(health.migration.voiceSynthesisMoved, true);
  assert.equal(health.migration.voiceCatalogueMoved, true);
  assert.equal(health.migration.imageGenerationMoved, true);
  assert.equal(health.migration.weatherMoved, true);
  assert.equal(health.migration.voiceTextTranscriptionMoved, true);
  assert.equal(health.migration.voiceTextPersistentJobsAliasMoved, true);
  assert.equal(health.migration.metadataCompatibilityAliasesMoved, true);
  assert.equal(health.migration.mediaSearchMoved, true);
  assert.equal(health.migration.chatAttachmentsMoved, true);
  assert.equal(health.migration.chatVoiceIntelligenceMoved, true);
  assert.equal(health.migration.adminAccessMoved, true);
  assert.equal(health.migration.adminProviderDiagnosticsMoved, true);
  assert.equal(health.migration.versionedChatMoved, true);
  assert.equal(health.migration.adminCodeEditingMoved, true);
  assert.equal(health.migration.frontendMoved, false);
  assert.equal(health.migration.frontendHostingConfigured, true);
  assert.equal(health.safeToSwitchClients, false);
  assert.equal(health.releaseGates.workerDeployed, false);
  assert.equal(health.releaseGates.legacyFallbackConfigured, false);
  assert.equal(health.releaseGates.rowLevelSecurityVerified, false);
  assert.equal(health.releaseGates.legacyParityVerified, false);
  assert.equal(health.releaseGates.rollbackVerified, false);
  assert.equal(health.migration.rowLevelSecurityMode, 'supabase-caller-jwt-forwarding');

  const sameOriginMetadata = await expectStatus('/api/meta?handler=health', 200, {
    headers: { Origin: base }
  });
  assert.equal(sameOriginMetadata.headers.get('access-control-allow-origin'), base,
    'Cloudflare-hosted frontend must be allowed to call its same-origin API');

  const metadataResponse = await expectStatus('/api/meta?handler=health', 200, {
    headers: { Origin: allowedOrigin }
  });
  const metadata = await metadataResponse.json();
  assert.equal(metadata.ok, true);
  assert.deepEqual(metadata.configuredProviders, []);
  assert.equal(metadata.integrations.userScopedData, false);
  assert.equal(metadataResponse.headers.get('access-control-allow-origin'), allowedOrigin);

  await expectStatus('/api/meta?handler=public-config', 503);
  await expectStatus('/api/meta?handler=models', 503);
  await expectStatus('/api/health', 200);
  await expectStatus('/api/public-config', 503);
  await expectStatus('/api/models', 503);

  const preflight = await expectStatus('/api/chat', 204, {
    method: 'OPTIONS',
    headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'POST' }
  });
  assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);

  await expectStatus('/api/chat', 403, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })
  });
  await expectStatus('/api/chat', 400, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] })
  });
  await expectStatus('/api/chat', 503, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] })
  });

  const voiceIntelligenceResponse = await expectStatus('/api/chat', 503, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Explain this slowly and step by step.' }],
      voiceIntelligence: { teachingMode: 'adaptive', speechDelivery: 'adaptive', interruption: 'hybrid' }
    })
  });
  const voiceIntelligenceError = await voiceIntelligenceResponse.json();
  assert.match(voiceIntelligenceError.error, /AI service is not configured/,
    'Voice-intelligence requests must reach Worker provider readiness, not legacy fallback.');


  await expectStatus('/api/chat', 400, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Read this file', document: { mimeType: 'text/plain', data: 'SGVsbG8=' } }] })
  });
  await expectStatus('/api/chat', 400, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Read this PDF', document: { mimeType: 'application/pdf', data: 'not-base64!' } }] })
  });
  await expectStatus('/api/chat', 400, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'assistant', content: 'Attached file', image: { mimeType: 'image/png', data: 'AQ==' } }] })
  });
  await expectStatus('/api/chat', 503, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Describe this image', image: { mimeType: 'image/png', data: 'AQ==' } }] })
  });
  await expectStatus('/api/chat', 503, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Summarise this PDF', document: { mimeType: 'application/pdf', data: 'AQ==' } }] })
  });
  await expectStatus('/api/chat', 503, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Transcribe this audio', media: { mimeType: 'audio/webm', data: 'AQ==' } }] })
  });

  await expectStatus('/api/search', 204, {
    method: 'OPTIONS',
    headers: { Origin: allowedOrigin, 'Access-Control-Request-Method': 'POST' }
  });
  await expectStatus('/api/search', 400, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  await expectStatus('/api/research', 400, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1/private' })
  });

  for (const blockedUrl of [
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/private',
    'http://2130706433/private',
    'http://192.168.1.1/private'
  ]) {
    await expectStatus('/api/research', 400, {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: blockedUrl })
    });
  }

  await expectStatus('/api/research', 403, {
    method: 'POST',
    headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'test query' })
  });
  await expectStatus('/api/research', 405, { method: 'PUT' });
  await expectStatus('/api/chat', 405, { method: 'GET' });

  await expectStatus('/api/voice', 204, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/voice', 403, { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello' }) });
  await expectStatus('/api/voice', 405, { method: 'GET' });
  await expectStatus('/api/voice', 503, { method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello' }) });

  await expectStatus('/api/media-generate', 204, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/media-generate', 403, { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'A bright city at sunset' }) });
  await expectStatus('/api/media-generate', 405, { method: 'GET' });
  await expectStatus('/api/media-generate', 503, { method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'A bright city at sunset' }) });

  await expectStatus('/api/voicetext-transcribe', 204, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/voicetext-transcribe', 403, { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) });
  await expectStatus('/api/voicetext-transcribe', 405, { method: 'PUT' });
  await expectStatus('/api/voicetext-transcribe', 401, { method: 'GET', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/voicetext-transcribe', 401, { method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'transcribe' }) });
  await expectStatus('/api/voicetext', 204, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/voicetext', 403, { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) });
  await expectStatus('/api/voicetext', 405, { method: 'PUT' });
  await expectStatus('/api/voicetext', 401, { method: 'GET', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/voicetext', 401, { method: 'POST', headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) });

  await expectStatus('/api/media-search', 204, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/media-search', 403, { method: 'GET', headers: { Origin: 'https://untrusted.invalid' } });
  await expectStatus('/api/media-search', 405, { method: 'POST' });
  await expectStatus('/api/media-search', 400, { method: 'GET', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/media-search?q=x', 400, { method: 'GET', headers: { Origin: allowedOrigin } });

  await expectStatus('/api/weather', 204, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/weather', 403, { method: 'GET', headers: { Origin: 'https://untrusted.invalid' } });
  await expectStatus('/api/weather', 405, { method: 'POST' });
  await expectStatus('/api/weather', 400, { method: 'GET', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/weather?city=%20%20', 400, { method: 'GET', headers: { Origin: allowedOrigin } });

  await expectStatus('/api/voices', 204, { method: 'OPTIONS', headers: { Origin: allowedOrigin } });
  await expectStatus('/api/voices', 403, { method: 'GET', headers: { Origin: 'https://untrusted.invalid' } });
  await expectStatus('/api/voices', 405, { method: 'POST' });
  await expectStatus('/api/voices', 503, { method: 'GET', headers: { Origin: allowedOrigin } });

  await expectStatus('/api/admin', 401);
  await expectStatus('/api/admin?handler=code', 204, { method: 'OPTIONS' });
  await expectStatus('/api/admin?handler=code', 403, { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit_code', prompt: 'Change the home title' }) });
  await expectStatus('/api/admin?handler=code', 405, { method: 'GET' });
  await expectStatus('/api/admin?handler=code', 400, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'wrong', prompt: 'Change the home title' }) });
  await expectStatus('/api/admin-code', 204, { method: 'OPTIONS' });
  await expectStatus('/api/admin-code', 503, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }, body: JSON.stringify({ action: 'edit_code', prompt: 'Change the home title' }) });
  await expectStatus('/api/admin-execute', 503, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }, body: JSON.stringify({ action: 'test_providers' }) });
  await expectStatus('/api/v1/chat', 401, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }) });
  await expectStatus('/api/v1/chat', 204, { method: 'OPTIONS' });
  await expectStatus('/api/auth/user', 503);
  await expectStatus('/api/data/example_table', 503);
  await expectStatus('/api/legacy-parity-smoke', 503);
  const spaFallback = await expectStatus('/not-an-api-route', 200);
  assert.match(spaFallback.headers.get('content-type') || '', /text\/html/i);

  console.log('AURORA Worker contract smoke tests passed (Cloudflare-hosted SPA, SPA fallback, health, metadata, same-origin CORS, chat, VoiceText transcription bridge, media search, weather, voice catalogue, voice synthesis, image-generation route guards, research, Supabase configuration, and legacy fallback).');
} catch (error) {
  console.error(error);
  console.error('Wrangler output:\n' + output);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
}
