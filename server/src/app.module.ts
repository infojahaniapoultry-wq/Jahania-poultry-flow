import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { CustomersModule } from './customers/customers.module';
import { DriversModule } from './drivers/drivers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { InvoicesModule } from './invoices/invoices.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PaymentsModule } from './payments/payments.module';
import { TransportModule } from './transport/transport.module';
import { ReportsModule } from './reports/reports.module';
import { MarketRatesModule } from './market-rates/market-rates.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    VendorsModule,
    CustomersModule,
    DriversModule,
    PurchasesModule,
    InvoicesModule,
    VouchersModule,
    ExpensesModule,
    PaymentsModule,
    TransportModule,
    ReportsModule,
    MarketRatesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
