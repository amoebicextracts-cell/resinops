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
