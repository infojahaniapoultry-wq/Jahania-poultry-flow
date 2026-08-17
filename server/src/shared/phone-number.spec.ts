import { isPhoneNumberLike, normalizePhoneNumber } from './phone-number';

describe('phone-number validation', () => {
  it('accepts common local and international mobile formats', () => {
    expect(isPhoneNumberLike('+92 300 0000000')).toBe(true);
    expect(isPhoneNumberLike('0300-1234567')).toBe(true);
  });

  it('rejects non-phone input', () => {
    expect(isPhoneNumberLike('test')).toBe(false);
    expect(isPhoneNumberLike('12345')).toBe(false);
    expect(isPhoneNumberLike('+92-abc')).toBe(false);
  });

  it('normalizes separators and whitespace', () => {
    expect(normalizePhoneNumber(' +92 300-123 4567 ')).toBe('+923001234567');
  });
});
