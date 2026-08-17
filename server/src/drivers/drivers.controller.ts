import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import {
  CreateDriverDto,
  CreateDriverSettlementDto,
  UpdateDriverDto,
} from './drivers.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get()
  findAll() {
    return this.driversService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.driversService.findOne(id);
  }

  @Get(':id/ledger')
  getLedger(
    @Param('id', ParseIntPipe) id: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.driversService.getLedger(id, startDate, endDate);
  }

  @Post(':id/settle-balance')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  settleBalance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDriverSettlementDto,
  ) {
    return this.driversService.settleBalance(id, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDriverDto) {
    return this.driversService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.driversService.remove(id);
  }
}
