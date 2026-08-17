import { IsDateString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertMarketRateDto {
  @IsNotEmpty()
  @IsDateString()
  effectiveDate: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  farmRate: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  finalRate: number;
}
