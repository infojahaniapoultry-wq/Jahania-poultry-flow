import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
  IsInt,
  IsEnum,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OnlineProvider, PaymentMode } from '@prisma/client';

export class InvoiceItemDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantityKg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  firstWeight?: number; // Legacy gross weight

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  secondWeight?: number; // Legacy empty crates weight

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ratePerKg?: number;
}

export class CreateInvoiceDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  customerId: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  driverId: number;

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
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  manualRateOverride?: boolean;
}

export class UpdateInvoiceDto extends CreateInvoiceDto {}
