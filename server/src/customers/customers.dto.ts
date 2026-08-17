import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsPhoneNumberLike } from '../shared/phone-number';
import { MarketRateBaseType, PricingOffsetDirection } from '@prisma/client';

export class CreateCustomerDto {
  @IsNotEmpty()
  @IsString()
  shopName: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsPhoneNumberLike({ message: 'Contact number must be a valid phone number' })
  @IsString()
  contact?: string | null;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsEnum(MarketRateBaseType)
  pricingBaseRateType: MarketRateBaseType;

  @IsEnum(PricingOffsetDirection)
  pricingOffsetDirection: PricingOffsetDirection;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricingOffsetValue: number;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  shopName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsPhoneNumberLike({ message: 'Contact number must be a valid phone number' })
  @IsString()
  contact?: string | null;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(MarketRateBaseType)
  pricingBaseRateType?: MarketRateBaseType;

  @IsOptional()
  @IsEnum(PricingOffsetDirection)
  pricingOffsetDirection?: PricingOffsetDirection;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricingOffsetValue?: number;
}
