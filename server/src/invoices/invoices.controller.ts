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
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto, UpdateInvoiceDto } from './invoices.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: { role: Role }) {
    return this.invoicesService.create(dto, user.role);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: { role: Role },
  ) {
    return this.invoicesService.update(id, dto, user.role);
  }

  @Get()
  findAll(
    @Query('date') date?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.invoicesService.findAll(
      date,
      customerId ? Number(customerId) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.invoicesService.findOne(id);
  }

  @Patch(':id/void')
  @Roles(Role.ADMIN)
  voidEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason?: string,
  ) {
    return this.invoicesService.voidInvoice(id, reason);
  }
}
