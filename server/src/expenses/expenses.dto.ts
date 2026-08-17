import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsDateString,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OnlineProvider, PaymentMode } from '@prisma/client';

export class CreateExpenseAccountDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class CreateExpenseEntryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  expenseAccountId: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;

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

  @IsOptional()
  @IsString()
  voucherRef?: string;
}
