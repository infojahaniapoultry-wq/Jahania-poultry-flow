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

export class CreateTransportAdvanceDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  driverId: number;

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
  purpose?: string;

  @IsOptional()
  @IsString()
  voucherRef?: string;
}
