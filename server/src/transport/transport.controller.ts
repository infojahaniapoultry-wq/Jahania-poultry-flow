import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { TransportService } from './transport.service';
import { CreateTransportAdvanceDto } from './transport.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transport')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post('advances')
  @Roles(Role.ADMIN, Role.DATA_ENTRY)
  create(@Body() dto: CreateTransportAdvanceDto) {
    return this.transportService.create(dto);
  }

  @Get('advances')
  findAll(
    @Query('driverId') driverId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.transportService.findAll(
      driverId ? Number(driverId) : undefined,
      startDate,
      endDate,
    );
  }
}
