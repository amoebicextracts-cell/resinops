import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MIN_PASSWORD_LENGTH,
  isPasswordRecoveryEvent,
  isPasswordRecoveryUrl,
  passwordResetRedirect,
  passwordValidationError,
} from '../src/lib/auth.js';

test('password recovery redirects to the dedicated public route', () => {
  assert.equal(
    passwordResetRedirect('https://app.resinops.com'),
    'https://app.resinops.com/reset-password',
  );
});

test('new passwords use a consistent launch-strength policy', () => {
  const shortPassword = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
  assert.match(passwordValidationError(shortPassword, shortPassword), /at least 12 characters/);
  assert.match(passwordValidationError('a-secure-password', 'a-different-password'), /match/);
  assert.equal(passwordValidationError('a-secure-password', 'a-secure-password'), null);
});

test('only the Supabase recovery event opens the password update screen', () => {
  assert.equal(isPasswordRecoveryEvent('PASSWORD_RECOVERY'), true);
  assert.equal(isPasswordRecoveryEvent('SIGNED_IN'), false);
});

test('recovery intent survives callbacks that land on the app root', () => {
  assert.equal(
    isPasswordRecoveryUrl('https://app.resinops.com/#access_token=secret&type=recovery'),
    true,
  );
  assert.equal(isPasswordRecoveryUrl('https://app.resinops.com/reset-password'), true);
  assert.equal(isPasswordRecoveryUrl('https://app.resinops.com/?type=recovery'), true);
  assert.equal(isPasswordRecoveryUrl('https://app.resinops.com/'), false);
});

test('the app preserves the recovery route and does not log Supabase configuration', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(vercel.rewrites.some(rule => rule.source === '/(.*)' && rule.destination === '/index.html'));

  const supabaseClient = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');
  assert.doesNotMatch(supabaseClient, /console\.log\(['"]SUPABASE ENV/);
  assert.ok(
    supabaseClient.indexOf('passwordRecoveryFromInitialUrl')
      < supabaseClient.indexOf('createClient(SUPABASE_URL'),
    'recovery intent must be captured before Supabase consumes the callback URL',
  );
});
