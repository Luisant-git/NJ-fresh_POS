import { Controller, Get, Post, Put, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { SupplierPaymentsService } from './supplier-payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('supplier-payments')
@UseGuards(JwtAuthGuard)
export class SupplierPaymentsController {
  constructor(private readonly supplierPaymentsService: SupplierPaymentsService) {}

  @Get('next-payment-no')
  async getNextPaymentNo() {
    return { paymentNo: await this.supplierPaymentsService.generatePaymentNo() };
  }

  @Get('balance/:id')
  async getBalance(
    @Param('id') id: string,
    @Query('excludePaymentId') excludePaymentId?: string
  ) {
    return this.supplierPaymentsService.getBalance(Number(id), excludePaymentId ? Number(excludePaymentId) : undefined);
  }

  @Get('consolidation-report')
  async getConsolidationReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.supplierPaymentsService.getConsolidationReport(startDate, endDate);
  }

  @Get('unpaid-bills/:id')
  async getUnpaidBills(
    @Param('id') id: string,
    @Query('excludePaymentId') excludePaymentId?: string
  ) {
    return this.supplierPaymentsService.getUnpaidBills(Number(id), excludePaymentId ? Number(excludePaymentId) : undefined);
  }

  @Post()
  async create(@Body() createSupplierPaymentDto: any, @Request() req: any) {
    // req.user from JwtAuthGuard contains the user payload
    const userId = req.user?.userId;
    return this.supplierPaymentsService.create(createSupplierPaymentDto, userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateData: any, @Request() req: any) {
    const userId = req.user?.userId;
    return this.supplierPaymentsService.update(Number(id), updateData, userId);
  }

  @Get()
  async findAll() {
    return this.supplierPaymentsService.findAll();
  }
}
