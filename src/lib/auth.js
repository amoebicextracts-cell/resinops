export const MIN_PASSWORD_LENGTH = 12;

export function passwordValidationError(password, confirmation) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmation) return "Passwords don't match.";
  return null;
}

export function passwordResetRedirect(origin) {
  return new URL('/reset-password', origin).toString();
}

export function isPasswordRecoveryEvent(event) {
  return event === 'PASSWORD_RECOVERY';
}

export function isPasswordRecoveryUrl(urlLike) {
  const href = typeof urlLike === 'string' ? urlLike : urlLike?.href;
  if (!href) return false;

  const url = new URL(href, 'https://app.resinops.com');
  const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ''));

  return url.pathname === '/reset-password'
    || url.searchParams.get('type') === 'recovery'
    || hashParameters.get('type') === 'recovery';
}

// Supabase email OTPs are 6 digits by default but the project setting
// allows up to 10, so accept that whole range rather than hardcoding 6.
export const MAX_EMAIL_OTP_LENGTH = 10;

export function normalizeOtpCode(value) {
  return String(value ?? '').replace(/\D/g, '').slice(0, MAX_EMAIL_OTP_LENGTH);
}

export function isPlausibleOtpCode(value) {
  return /^\d{6,10}$/.test(value);
}

// Supabase's invite email redirects the same way a recovery link does — a
// magic link that lands with access_token/type in the URL hash. This mirrors
// isPasswordRecoveryUrl exactly, just matching "invite" instead of "recovery".
export function isInviteUrl(urlLike) {
  const href = typeof urlLike === 'string' ? urlLike : urlLike?.href;
  if (!href) return false;

  const url = new URL(href, 'https://app.resinops.com');
  const hashParameters = new URLSearchParams(url.hash.replace(/^#/, ''));

  return url.pathname === '/accept-invite'
    || url.searchParams.get('type') === 'invite'
    || hashParameters.get('type') === 'invite';
}
