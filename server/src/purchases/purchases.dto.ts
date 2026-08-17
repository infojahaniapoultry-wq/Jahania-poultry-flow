import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OnlineProvider, PaymentMode } from '@prisma/client';

export class CreatePurchaseDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  vendorId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  driverId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  driverCharge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  settledAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  ratePerKg: number;

  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  paymentReference?: string;

  @IsOptional()
  @IsEnum(OnlineProvider)
  paymentProvider?: OnlineProvider;

  @IsOptional()
  @IsString()
  chequeNo?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsDateString()
  chequeDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  existingChequeId?: number;
}

export class UpdatePurchaseDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ratePerKg?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
