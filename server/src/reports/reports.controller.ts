import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  @Get('dashboard')
  getDashboardSummary(@Query('date') date: string) {
    return this.reportsService.getDashboardSummary(
      date ?? new Date().toISOString().split('T')[0],
    );
  }

  @Get('daily-pnl')
  getDailyPnL(@Query('date') date: string) {
    return this.reportsService.getDailyPnL(
      date ?? new Date().toISOString().split('T')[0],
    );
  }

  @Get('daily-performance')
  getDailyPerformance(@Query('date') date: string) {
    return this.reportsService.getDailyPerformance(
      date ?? new Date().toISOString().split('T')[0],
    );
  }

  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  @Get('stock-summary')
  getStockSummary() {
    return this.reportsService.getStockSummary();
  }

  @Get('customer-statement')
  getCustomerStatement(
    @Query('customerId') customerId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getCustomerStatement(
      Number(customerId),
      startDate,
      endDate,
    );
  }

  @Get('vendor-statement')
  getVendorStatement(
    @Query('vendorId') vendorId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getVendorStatement(
      Number(vendorId),
      startDate,
      endDate,
    );
  }

  @Get('cash-book')
  getCashBookReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getCashBookReport(startDate, endDate);
  }

  @Get('recovery')
  getRecoveryReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getRecoveryReport(startDate, endDate);
  }

  @Get('expense-summary')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  getExpenseSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getExpenseSummary(startDate, endDate);
  }
}
