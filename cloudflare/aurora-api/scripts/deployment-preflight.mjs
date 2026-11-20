import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function stripJsoncComments(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; output += char; continue; }
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      output += '\n';
      continue;
    }
    if (char === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++;
      continue;
    }
    output += char;
  }
  return output;
}

const configText = await readFile(resolve(root, 'wrangler.jsonc'), 'utf8');
const config = JSON.parse(stripJsoncComments(configText));
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const readme = await readFile(resolve(root, 'README.md'), 'utf8');
const deployWorkflow = await readFile(resolve(root, '../../.github/workflows/deploy-aurora-cloudflare.yml'), 'utf8');
const validationWorkflow = await readFile(resolve(root, '../../.github/workflows/aurora-cloudflare-api.yml'), 'utf8');
const frontendPackage = JSON.parse(await readFile(resolve(root, '../../package.json'), 'utf8'));
const frontendDist = resolve(root, '../../dist/index.html');

const requiredFiles = [
  'src/index.ts',
  'src/research.ts',
  'src/chat.ts',
  'src/data.ts',
  'src/voice.ts',
  'src/media.ts',
  'src/voices.ts',
  'src/weather.ts',
  'src/voicetext.ts',
  'src/media-search.ts',
  'scripts/test-worker-contracts.mjs',
  'scripts/test-deployed-worker.mjs'
];
for (const file of requiredFiles) {
  assert.equal(await exists(resolve(root, file)), true, 'Required deployment file is missing: ' + file);
}

assert.equal(config.name, 'aurora-api', 'Unexpected Worker name');
assert.equal(config.main, 'src/index.ts', 'Unexpected Worker entry point');
assert.match(config.compatibility_date || '', /^\d{4}-\d{2}-\d{2}$/, 'A valid compatibility_date is required');
assert.equal(config.workers_dev, true, 'workers.dev must remain enabled for the staged rollout');
assert.equal(config.observability?.enabled, true, 'Worker observability must remain enabled');
assert.equal(config.assets?.directory, '../../dist', 'Worker must publish the Vite dist directory');
assert.equal(config.assets?.binding, 'ASSETS', 'Worker static asset binding is required');
assert.equal(config.assets?.not_found_handling, 'none', 'Worker must control missing-asset and SPA fallback handling');
assert.ok(config.assets?.run_worker_first?.includes('/*'), 'All requests must reach the Worker for explicit asset and SPA routing');
for (const name of ['typecheck', 'build', 'android:check', 'test:core']) {
  assert.equal(typeof frontendPackage.scripts?.[name], 'string', 'Missing root validation script: ' + name);
}
for (const required of ['npm run typecheck', 'npm run build', 'npm run android:check', 'npm run test:core', 'npm run test:contracts', 'npm run test:smoke-contracts', 'npx wrangler deploy --dry-run']) {
  assert.ok(validationWorkflow.includes(required), 'Cloudflare validation workflow is missing required check: ' + required);
}
assert.equal(await exists(frontendDist), true, 'Run the root Vite build before deployment preflight');
assert.equal(config.vars?.AURORA_BACKEND_STAGE, 'stage-7-release-validation',
  'Worker stage marker is missing or unexpected');

for (const name of ['typecheck', 'test:contracts', 'test:smoke-contracts', 'test:deployed', 'deploy', 'test:preflight']) {
  assert.equal(typeof pkg.scripts?.[name], 'string', 'Missing npm script: ' + name);
}

assert.ok(!/SUPABASE_SERVICE_ROLE/i.test(configText),
  'Do not put a Supabase service-role credential in wrangler.jsonc');
assert.match(readme, /Worker has not been deployed/i,
  'README must state that the Worker is not yet deployed');
assert.match(readme, /Keep \`VITE_AURORA_API_BASE_URL\` blank/i,
  'README must keep client switching blocked until release gates pass');
assert.match(readme, /least-privilege Workers Scripts Edit/i,
  'README must document the separate least-privilege deployment credential');

for (const required of [
  'workflow_dispatch:',
  'confirm_deploy:',
  "inputs.confirm_deploy == 'DEPLOY'",
  'secrets.CLOUDFLARE_API_TOKEN',
  'secrets.CLOUDFLARE_ACCOUNT_ID',
  'Validate deployment inputs before publishing',
  'Missing CLOUDFLARE_API_TOKEN GitHub Secret',
  'Missing CLOUDFLARE_ACCOUNT_ID GitHub Secret',
  'endsWith(".workers.dev")',
  'wrangler deploy --config wrangler.jsonc',
  'npm run test:deployed'
]) {
  assert.ok(deployWorkflow.includes(required), 'Cloudflare deployment workflow is missing required safety feature: ' + required);
}
assert.ok(deployWorkflow.indexOf('Validate deployment inputs before publishing') < deployWorkflow.indexOf('Deploy frontend and API Worker together'),
  'Deployment inputs must be validated before publishing');
assert.ok(!deployWorkflow.includes('\n  push:') && !deployWorkflow.includes('\n  pull_request:'),
  'Cloudflare deployment must not run on pushes or pull requests');

console.log('AURORA deployment preflight passed: Worker API config, Cloudflare static hosting, built SPA output, required source files, validation scripts, and release-safety documentation are present.');
console.log('This is a static preflight only. It does not inspect Cloudflare account secrets, authenticate, deploy, or authorize client switching.');
