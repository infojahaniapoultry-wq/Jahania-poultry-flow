import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const PHONE_ALLOWED = /^[\d\s()+-]+$/;
const PHONE_DIGITS = /^\d{10,15}$/;

export function normalizePhoneNumber(value: string) {
  return value.trim().replace(/[\s()-]/g, '');
}

export function isPhoneNumberLike(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return false;

  if (!PHONE_ALLOWED.test(value)) return false;
  const digits = normalized.startsWith('+') ? normalized.slice(1) : normalized;
  if (!PHONE_DIGITS.test(digits)) return false;

  return !normalized.slice(1).includes('+');
}

@ValidatorConstraint({ name: 'isPhoneNumberLike', async: false })
export class IsPhoneNumberLikeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (value === null || value === undefined) return true;
    return isPhoneNumberLike(value);
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a valid phone number`;
  }
}

export function IsPhoneNumberLike(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isPhoneNumberLike',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsPhoneNumberLikeConstraint,
    });
  };
}
