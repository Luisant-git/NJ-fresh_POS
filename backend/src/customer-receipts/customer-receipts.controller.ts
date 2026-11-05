import { Controller, Get, Post, Put, Body, UseGuards, Request, Param, Query } from '@nestjs/common';
import { CustomerReceiptsService } from './customer-receipts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('customer-receipts')
@UseGuards(JwtAuthGuard)
export class CustomerReceiptsController {
  constructor(private readonly customerReceiptsService: CustomerReceiptsService) {}

  @Get('next-receipt-no')
  async getNextReceiptNo() {
    return { receiptNo: await this.customerReceiptsService.generateReceiptNo() };
  }

  @Get('balance/:id')
  async getBalance(
    @Param('id') id: string,
    @Query('excludeReceiptId') excludeReceiptId?: string
  ) {
    return this.customerReceiptsService.getBalance(Number(id), excludeReceiptId ? Number(excludeReceiptId) : undefined);
  }

  @Get('consolidation-report')
  async getConsolidationReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    return this.customerReceiptsService.getConsolidationReport(startDate, endDate);
  }

  @Get('unpaid-bills/:id')
  async getUnpaidBills(
    @Param('id') id: string,
    @Query('excludeReceiptId') excludeReceiptId?: string
  ) {
    return this.customerReceiptsService.getUnpaidBills(Number(id), excludeReceiptId ? Number(excludeReceiptId) : undefined);
  }

  @Post()
  async create(@Body() createCustomerReceiptDto: any, @Request() req: any) {
    const userId = req.user?.userId;
    return this.customerReceiptsService.create(createCustomerReceiptDto, userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateData: any, @Request() req: any) {
    const userId = req.user?.userId;
    return this.customerReceiptsService.update(Number(id), updateData, userId);
  }

  @Get()
  async findAll() {
    return this.customerReceiptsService.findAll();
  }
}
