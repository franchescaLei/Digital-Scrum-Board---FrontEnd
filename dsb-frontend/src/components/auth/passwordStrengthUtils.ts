// ── Password rules (matches backend policy) ───
export interface PasswordStrength {
  hasMinLength: boolean;  // >= 8
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
}

export function checkPasswordStrength(password: string): PasswordStrength {
  return {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber:    /[0-9]/.test(password),
    hasSymbol:    /[^A-Za-z0-9]/.test(password),
  };
}

export function countMet(s: PasswordStrength): number {
  return Object.values(s).filter(Boolean).length;
}

export function isPasswordValid(s: PasswordStrength): boolean {
  return countMet(s) === 5;
}

export const LABELS: Record<keyof PasswordStrength, string> = {
  hasMinLength: '8+ characters',
  hasUppercase: 'Uppercase letter',
  hasLowercase: 'Lowercase letter',
  hasNumber:    'Number',
  hasSymbol:    'Symbol',
};

export const STRENGTH_LABELS = ['', 'Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];
