import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseAccountDto, CreateExpenseEntryDto } from './expenses.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  // Accounts
  @Post('accounts')
  @Roles(Role.ADMIN)
  createAccount(@Body() dto: CreateExpenseAccountDto) {
    return this.expensesService.createAccount(dto);
  }

  @Get('accounts')
  findAllAccounts() {
    return this.expensesService.findAllAccounts();
  }

  // Entries
  @Post()
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  createEntry(@Body() dto: CreateExpenseEntryDto) {
    return this.expensesService.createEntry(dto);
  }

  @Get()
  findAllEntries(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.expensesService.findAllEntries(
      startDate,
      endDate,
      accountId ? Number(accountId) : undefined,
    );
  }

  @Get('summary')
  @Roles(Role.ADMIN)
  getSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.expensesService.getSummary(startDate, endDate);
  }
}
