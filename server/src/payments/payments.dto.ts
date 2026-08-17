import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsDateString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ChequeStatus,
  LedgerEntryType,
  OnlineProvider,
  PaymentStatus,
} from '@prisma/client';

export class CreateBankLedgerDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsNotEmpty()
  @IsString()
  bankName: string;

  @IsNotEmpty()
  @IsEnum(LedgerEntryType)
  type: LedgerEntryType;

  @IsOptional()
  @IsString()
  refNo?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  narration?: string;
}

export class CreateEasypaisaLedgerDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  mobileNo?: string;

  @IsNotEmpty()
  @IsEnum(LedgerEntryType)
  type: LedgerEntryType;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  narration?: string;
}

export class CreateChequeLogDto {
  @IsNotEmpty()
  @IsString()
  chequeNo: string;

  @IsNotEmpty()
  @IsString()
  bankName: string;

  @IsNotEmpty()
  @IsDateString()
  chequeDate: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  receivedFrom?: string;

  @IsOptional()
  @IsEnum(ChequeStatus)
  status?: ChequeStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sourceId?: number;
}

export class UpdateChequeStatusDto {
  @IsNotEmpty()
  @IsEnum(ChequeStatus)
  status: ChequeStatus;
}

export class CreateOnlinePaymentLogDto {
  @IsNotEmpty()
  @IsEnum(OnlineProvider)
  provider: OnlineProvider;

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsIn([PaymentStatus.PENDING, PaymentStatus.COMPLETED, PaymentStatus.FAILED])
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  receivedFrom?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sourceId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOnlinePaymentStatusDto {
  @IsNotEmpty()
  @IsIn([PaymentStatus.COMPLETED, PaymentStatus.FAILED])
  status: PaymentStatus;
}
