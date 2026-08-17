import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { MarketRatesModule } from '../market-rates/market-rates.module';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  imports: [MarketRatesModule],
  exports: [InvoicesService],
})
export class InvoicesModule {}
