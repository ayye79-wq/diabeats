const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const secretName = 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON';
const keyPath = path.resolve('.eas/google-play-service-account.json');
const targetRelease = {
  applicationId: 'com.diabeats.android',
  appVersion: '1.3.4',
  versionCode: 6,
  buildId: 'c7efec89-8907-4b02-b27a-d5952c0e70e9',
};

if (process.argv.length > 2) {
  throw new Error(
    'This one-off command submits only the verified DiabEats 1.3.4 (6) EAS build; it accepts no arguments.'
  );
}

const keyJson = process.env[secretName];
if (!keyJson) {
  throw new Error(`${secretName} must be configured as a managed secret before submitting.`);
}

try {
  const key = JSON.parse(keyJson);
  if (key.type !== 'service_account' || typeof key.private_key !== 'string' || !key.private_key) {
    throw new Error(`${secretName} is not a valid Google service-account JSON key.`);
  }

  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(keyPath, keyJson, { encoding: 'utf8', mode: 0o600 });

  const result = spawnSync(
    'npx',
    [
      'eas-cli',
      'submit',
      '--platform',
      'android',
      '--profile',
      'production',
      '--non-interactive',
      '--wait',
      '--id',
      targetRelease.buildId,
    ],
    { stdio: 'inherit', env: process.env }
  );

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(keyPath, { force: true });
}