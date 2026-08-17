import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OnlineProvider, PaymentMode } from '@prisma/client';
import { IsPhoneNumberLike } from '../shared/phone-number';

export class CreateDriverDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsPhoneNumberLike({ message: 'Contact number must be a valid phone number' })
  @IsString()
  contact?: string | null;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  advanceBalance?: number;
}

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsPhoneNumberLike({ message: 'Contact number must be a valid phone number' })
  @IsString()
  contact?: string | null;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultCharge?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateDriverSettlementDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @IsOptional()
  @IsEnum(OnlineProvider)
  paymentProvider?: OnlineProvider;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsString()
  narration?: string;
}
