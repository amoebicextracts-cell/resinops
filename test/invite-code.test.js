import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isInviteUrl, isPlausibleOtpCode, normalizeOtpCode } from '../src/lib/auth.js';

test('invite codes keep digits only and cap at the longest Supabase OTP', () => {
  assert.equal(normalizeOtpCode(' 123 456 '), '123456');
  assert.equal(normalizeOtpCode('12-34-56'), '123456');
  assert.equal(normalizeOtpCode('12345678901234'), '1234567890');
  assert.equal(normalizeOtpCode(undefined), '');
});

test('only 6 to 10 digit codes are submitted', () => {
  assert.equal(isPlausibleOtpCode('12345'), false);
  assert.equal(isPlausibleOtpCode('123456'), true);
  assert.equal(isPlausibleOtpCode('1234567890'), true);
  assert.equal(isPlausibleOtpCode('12345a'), false);
});

test('the bare accept-invite route opens the invite flow without a token in the URL', () => {
  assert.equal(isInviteUrl('https://app.resinops.com/accept-invite'), true);
});

test('the invite email carries a code and no one-time link a mail scanner could burn', () => {
  const template = readFileSync(new URL('../supabase/templates/invite.html', import.meta.url), 'utf8');
  const body = template.replace(/<!--[\s\S]*?-->/g, '');
  assert.match(body, /\{\{\s*\.Token\s*\}\}/);
  assert.doesNotMatch(body, /ConfirmationURL|TokenHash/);
  assert.match(body, /\{\{\s*\.SiteURL\s*\}\}\/accept-invite/);
});

test('invite codes are verified as invite OTPs, not magic-link sign-ins', () => {
  const db = readFileSync(new URL('../src/lib/db.js', import.meta.url), 'utf8');
  assert.match(db, /verifyOtp\(\{\s*email,\s*token,\s*type:\s*'invite'\s*\}\)/);
});
