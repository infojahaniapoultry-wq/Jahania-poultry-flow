import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  CreateBankLedgerDto,
  CreateEasypaisaLedgerDto,
  CreateChequeLogDto,
  CreateOnlinePaymentLogDto,
  UpdateChequeStatusDto,
  UpdateOnlinePaymentStatusDto,
} from './payments.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Cash Book
  @Get('cash-book')
  getCashBook(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getCashBook(startDate, endDate);
  }

  @Get('transactions')
  getTransactions(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    return this.paymentsService.getTransactions(startDate, endDate, type);
  }

  // Bank Ledger
  @Post('bank')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  addBankEntry(@Body() dto: CreateBankLedgerDto) {
    return this.paymentsService.addBankEntry(dto);
  }

  @Get('bank')
  getBankLedger(
    @Query('bankName') bankName?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getBankLedger(bankName, startDate, endDate);
  }

  // Easypaisa
  @Post('easypaisa')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  addEasypaisaEntry(@Body() dto: CreateEasypaisaLedgerDto) {
    return this.paymentsService.addEasypaisaEntry(dto);
  }

  @Get('easypaisa')
  getEasypaisaLedger(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getEasypaisaLedger(startDate, endDate);
  }

  // Cheques
  @Post('cheques')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  createCheque(@Body() dto: CreateChequeLogDto) {
    return this.paymentsService.createCheque(dto);
  }

  @Get('cheques')
  getCheques(
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
  ) {
    return this.paymentsService.getCheques(status, sourceType);
  }

  @Patch('cheques/:id/status')
  @Roles(Role.ADMIN)
  updateChequeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChequeStatusDto,
  ) {
    return this.paymentsService.updateChequeStatus(id, dto);
  }

  @Post('online')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  createOnline(@Body() dto: CreateOnlinePaymentLogDto) {
    return this.paymentsService.createOnlinePayment(dto);
  }

  @Get('online')
  getOnline(
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('sourceType') sourceType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getOnlinePayments(
      provider,
      status,
      sourceType,
      startDate,
      endDate,
    );
  }

  @Patch('online/:id/status')
  @Roles(Role.ADMIN)
  updateOnlineStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOnlinePaymentStatusDto,
  ) {
    return this.paymentsService.updateOnlineStatus(id, dto);
  }
}
