const PHONE_ALLOWED = /^[\d\s()+-]+$/;
const PHONE_DIGITS = /^\d{10,15}$/;

export const normalizePhoneNumber = (value: string) => value.trim().replace(/[\s()-]/g, '');

export const isPhoneNumberLike = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!PHONE_ALLOWED.test(trimmed)) return false;

  const normalized = normalizePhoneNumber(trimmed);
  const digits = normalized.startsWith('+') ? normalized.slice(1) : normalized;
  if (!PHONE_DIGITS.test(digits)) return false;
  return !normalized.slice(1).includes('+');
};

export const toOptionalPhoneNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
