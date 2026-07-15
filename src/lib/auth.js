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
