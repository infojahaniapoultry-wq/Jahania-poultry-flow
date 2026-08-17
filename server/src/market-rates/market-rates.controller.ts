import {
  Body,
  Controller,
  Get,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MarketRatesService } from './market-rates.service';
import { UpsertMarketRateDto } from './market-rates.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('market-rates')
export class MarketRatesController {
  constructor(private readonly marketRatesService: MarketRatesService) {}

  @Get('effective')
  getEffective(@Query('date') date?: string) {
    return this.marketRatesService.getEffective(date);
  }

  @Put()
  @Roles(Role.ADMIN)
  upsert(@Body() dto: UpsertMarketRateDto) {
    return this.marketRatesService.upsert(dto);
  }
}
