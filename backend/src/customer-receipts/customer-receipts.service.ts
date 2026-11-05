import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerReceiptsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, userId: number) {
    if (!data.receiptNo || !data.customerId || !data.amount || !data.paymentTypeId) {
      throw new BadRequestException('Missing required fields');
    }

    const totalAllocated = data.allocations && Array.isArray(data.allocations)
      ? data.allocations.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0)
      : 0;
    if (totalAllocated > Number(data.amount) + 0.009) {
      throw new BadRequestException(`Allocations total (${totalAllocated.toFixed(2)}) cannot exceed receipt amount (${Number(data.amount).toFixed(2)})`);
    }

    try {
      return await this.prisma.customerReceipt.create({
        data: {
          receiptNo: data.receiptNo,
          date: data.date ? new Date(`${data.date}T00:00:00+08:00`) : new Date(),
          customerId: Number(data.customerId),
          amount: Number(data.amount),
          paymentTypeId: Number(data.paymentTypeId),
          reference: data.reference,
          remarks: data.remarks,
          userId: userId,
          allocations: data.allocations && Array.isArray(data.allocations) ? {
            create: data.allocations.filter((a: any) => Number(a.amount) > 0).map((a: any) => ({
              saleId: a.saleId ? Number(a.saleId) : null,
              amount: Number(a.amount)
            }))
          } : undefined,
        },
        include: {
          customer: true,
          paymentType: true,
        },
      });
    } catch (error) {
      console.error('Error creating customer receipt:', error);
      throw new BadRequestException('Failed to record receipt. ' + (error.message || ''));
    }
  }

  async update(id: number, data: any, userId: number) {
    if (!data.customerId || !data.amount || !data.paymentTypeId) {
      throw new BadRequestException('Missing required fields');
    }

    const totalAllocated = data.allocations && Array.isArray(data.allocations)
      ? data.allocations.reduce((sum: number, a: any) => sum + (Number(a.amount) || 0), 0)
      : 0;
    if (totalAllocated > Number(data.amount) + 0.009) {
      throw new BadRequestException(`Allocations total (${totalAllocated.toFixed(2)}) cannot exceed receipt amount (${Number(data.amount).toFixed(2)})`);
    }

    try {
      return await this.prisma.customerReceipt.update({
        where: { id },
        data: {
          date: data.date ? new Date(`${data.date}T00:00:00+08:00`) : new Date(),
          customerId: Number(data.customerId),
          amount: Number(data.amount),
          paymentTypeId: Number(data.paymentTypeId),
          reference: data.reference,
          remarks: data.remarks,
          userId: userId,
          allocations: data.allocations && Array.isArray(data.allocations) ? {
            deleteMany: {},
            create: data.allocations.filter((a: any) => Number(a.amount) > 0).map((a: any) => ({
              saleId: a.saleId ? Number(a.saleId) : null,
              amount: Number(a.amount)
            }))
          } : undefined,
        },
        include: {
          customer: true,
          paymentType: true,
        },
      });
    } catch (error) {
      console.error('Error updating customer receipt:', error);
      throw new BadRequestException('Failed to update receipt. ' + (error.message || ''));
    }
  }

  async findAll() {
    return this.prisma.customerReceipt.findMany({
      orderBy: [
        { date: 'desc' },
        { id: 'desc' }
      ],
      include: {
        customer: true,
        paymentType: true,
        paymentMode: true,
        allocations: {
          include: { sale: true }
        }
      },
    });
  }

  async getBalance(customerId: number, excludeReceiptId?: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const creditMode = await this.prisma.paymentMode.findFirst({
      where: { name: { equals: 'Credit', mode: 'insensitive' } }
    });
    const creditModeId = creditMode?.id || -1;

    // Sum of all CREDIT sales
    const sales = await this.prisma.sale.aggregate({
      where: { 
        customerId,
        paymentModeId: creditModeId
      },
      _sum: { grandTotal: true },
    });

    // Sum of all receipts
    const receipts = await this.prisma.customerReceipt.aggregate({
      where: { 
        customerId,
        ...(excludeReceiptId ? { id: { not: excludeReceiptId } } : {})
      },
      _sum: { amount: true },
    });

    // Sum of all sales returns
    const salesReturns = await this.prisma.salesReturn.aggregate({
      where: { customerId },
      _sum: { totalAmount: true },
    });
    const totalReturns = Number(salesReturns._sum.totalAmount) || 0;

    const openingBalance = Number(customer.openingBalance) || 0;
    const isOpeningCredit = customer.openingBalanceType === 'Cr'; // Cr means we owe them
    const isOpeningDebit = customer.openingBalanceType === 'Dr'; // Dr means they owe us
    
    let totalOwed = 0;
    if (isOpeningDebit) totalOwed += openingBalance;
    if (isOpeningCredit) totalOwed -= openingBalance;

    const totalSales = Number(sales._sum.grandTotal) || 0;
    const totalCollected = Number(receipts._sum.amount) || 0;

    const balance = Number((totalOwed + totalSales - totalCollected - totalReturns).toFixed(2));

    return { balance, totalReturns };
  }

  async generateReceiptNo() {
    const lastReceipt = await this.prisma.customerReceipt.findFirst({
      orderBy: { id: 'desc' },
    });

    let nextNo = 1;
    if (lastReceipt && lastReceipt.receiptNo.startsWith('REC-')) {
      const parts = lastReceipt.receiptNo.split('-');
      if (parts.length === 2) {
        nextNo = parseInt(parts[1], 10) + 1;
      }
    }

    return `REC-${nextNo.toString().padStart(6, '0')}`;
  }

  async getUnpaidBills(customerId: number, excludeReceiptId?: number) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new BadRequestException('Customer not found');
    }

    const allReceipts = await this.prisma.customerReceipt.findMany({
      where: { customerId },
      include: { allocations: true }
    });

    let excludedAllocations: Record<string | number, number> = {};
    if (excludeReceiptId) {
      const exAlloc = await this.prisma.customerReceiptAllocation.findMany({
        where: { customerReceiptId: excludeReceiptId }
      });
      exAlloc.forEach(a => {
        if (a.saleId) {
          excludedAllocations[a.saleId] = Number(a.amount);
        } else {
          excludedAllocations['OB'] = Number(a.amount);
        }
      });
    }
    
    // 2. Fetch Opening Balance & Sales (in chronological order)
    const openingBalance = Number(customer.openingBalance) || 0;
    const isOpeningDebit = customer.openingBalanceType === 'Dr'; // Dr means they owe us
    const isOpeningCredit = customer.openingBalanceType === 'Cr';

    let totalOldUnallocatedCollected = 0;
    const mappedAllocations: Record<string | number, number> = {};

    for (const r of allReceipts) {
      if (excludeReceiptId && r.id === excludeReceiptId) continue;
      const receiptAmount = Number(r.amount) || 0;
      if (!r.allocations || r.allocations.length === 0) {
        totalOldUnallocatedCollected += receiptAmount;
      } else {
        const rawAllocSum = r.allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
        const factor = rawAllocSum > receiptAmount && rawAllocSum > 0 ? (receiptAmount / rawAllocSum) : 1;
        let effectiveAllocSum = 0;

        for (const a of r.allocations) {
          const amt = (Number(a.amount) || 0) * factor;
          effectiveAllocSum += amt;

          if (a.saleId) {
            mappedAllocations[a.saleId] = (mappedAllocations[a.saleId] || 0) + amt;
          } else {
            if (isOpeningDebit && openingBalance > 0) {
              mappedAllocations['OB'] = (mappedAllocations['OB'] || 0) + amt;
            } else {
              totalOldUnallocatedCollected += amt;
            }
          }
        }

        const unallocated = receiptAmount - effectiveAllocSum;
        if (unallocated > 0.009) {
          totalOldUnallocatedCollected += unallocated;
        }
      }
    }

    const salesReturns = await this.prisma.salesReturn.findMany({
      where: { customerId },
    });
    
    const mappedReturns: Record<number, number> = {};
    let unmappedReturns = 0;
    
    salesReturns.forEach(sr => {
      const amt = Number(sr.totalAmount) || 0;
      if (sr.saleId) {
        mappedReturns[sr.saleId] = (mappedReturns[sr.saleId] || 0) + amt;
      } else {
        unmappedReturns += amt;
      }
    });

    // We add unmapped returns to the total pool of unallocated payments
    totalOldUnallocatedCollected += unmappedReturns;
    
    let bills: any[] = [];
    
    // If they owe us an opening balance, treat it as the first bill
    if (isOpeningDebit && openingBalance > 0) {
      const obAllocated = mappedAllocations['OB'] || 0;
      bills.push({
        id: 'OB', // Special ID for opening balance
        entryNo: 'Opening Balance',
        date: customer.createdAt, // Or a specific OB date if available
        total: openingBalance,
        returned: 0,
        allocated: obAllocated,
        received: obAllocated,
        pending: Math.max(0, Number((openingBalance - obAllocated).toFixed(2))),
        isOpeningBalance: true
      });
    } else if (isOpeningCredit && openingBalance > 0) {
      // If we owe them, this effectively increases their "totalCollected" pool
      totalOldUnallocatedCollected += openingBalance;
    }

    const creditMode = await this.prisma.paymentMode.findFirst({
      where: { name: { equals: 'Credit', mode: 'insensitive' } }
    });
    const creditModeId = creditMode?.id || -1;

    const sales = await this.prisma.sale.findMany({
      where: { 
        customerId,
        paymentModeId: creditModeId
      },
      orderBy: { date: 'asc' },
    });

    for (const sale of sales) {
      const billTotal = Number(sale.grandTotal) || 0;
      const returnedAmt = mappedReturns[sale.id] || 0;
      const allocatedAmt = mappedAllocations[sale.id] || 0;
      const initialPending = Math.max(0, Number((billTotal - returnedAmt - allocatedAmt).toFixed(2)));
      
      bills.push({
        id: sale.id,
        entryNo: sale.invoiceNo,
        date: sale.date,
        total: billTotal,
        returned: returnedAmt,
        allocated: allocatedAmt,
        received: allocatedAmt,
        pending: initialPending,
        isOpeningBalance: false
      });
    }

    // 3. Apply FIFO for the old unallocated receipts over the remaining pending balances
    for (const bill of bills) {
      const remainingPending = bill.pending;
      
      // Calculate total received initially from specific allocations
      bill.received = bill.allocated;

      if (remainingPending <= 0.009) {
         bill.pending = 0;
         continue;
      }

      // DO NOT apply FIFO to bills that were specifically allocated by the receipt we are editing.
      // This ensures they appear in the edit screen with their true pending balance so the user can modify them.
      if (excludedAllocations[bill.id] !== undefined) {
         continue;
      }

      const currentTotalCollected = Number(totalOldUnallocatedCollected.toFixed(2));

      if (remainingPending <= 0.009) {
         bill.pending = 0;
         continue;
      }

      if (currentTotalCollected >= remainingPending) {
        // Fully paid by FIFO
        bill.received = Number((bill.received + remainingPending).toFixed(2));
        bill.pending = 0;
        totalOldUnallocatedCollected = Number((totalOldUnallocatedCollected - remainingPending).toFixed(2));
      } else if (currentTotalCollected > 0 && currentTotalCollected < remainingPending) {
        // Partially paid by FIFO
        bill.received = Number((bill.received + currentTotalCollected).toFixed(2));
        bill.pending = Number((remainingPending - currentTotalCollected).toFixed(2));
        totalOldUnallocatedCollected = 0;
      }
    }

    return bills;
  }

  async getConsolidationReport(startDate?: string, endDate?: string) {
    const customers = await this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
    });

    const creditMode = await this.prisma.paymentMode.findFirst({
      where: { name: { equals: 'Credit', mode: 'insensitive' } }
    });
    const creditModeId = creditMode?.id || -1;

    const report = [];

    const start = startDate ? new Date(`${startDate}T00:00:00+08:00`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999+08:00`) : null;

    for (const c of customers) {
      let forwardingBalance = 0;
      const openingBal = Number(c.openingBalance) || 0;
      if (c.openingBalanceType === 'Dr') forwardingBalance += openingBal;
      if (c.openingBalanceType === 'Cr') forwardingBalance -= openingBal;

      if (start) {
        const preSales = await this.prisma.sale.aggregate({
          where: { customerId: c.id, paymentModeId: creditModeId, date: { lt: start } },
          _sum: { grandTotal: true },
        });
        const preReceipts = await this.prisma.customerReceipt.aggregate({
          where: { customerId: c.id, date: { lt: start } },
          _sum: { amount: true },
        });
        const preReturns = await this.prisma.salesReturn.aggregate({
          where: { customerId: c.id, date: { lt: start } },
          _sum: { totalAmount: true },
        });

        forwardingBalance += (Number(preSales._sum.grandTotal) || 0);
        forwardingBalance -= (Number(preReceipts._sum.amount) || 0);
        forwardingBalance -= (Number(preReturns._sum.totalAmount) || 0);
      }

      const displayOpeningBalance = Math.abs(forwardingBalance);
      const displayOpeningBalanceType = forwardingBalance >= 0 ? 'Dr' : 'Cr';

      const dateFilter: any = {};
      if (start) dateFilter.gte = start;
      if (end) dateFilter.lte = end;
      const hasDateFilter = start || end;

      const sales = await this.prisma.sale.aggregate({
        where: { 
          customerId: c.id, 
          paymentModeId: creditModeId,
          ...(hasDateFilter ? { date: dateFilter } : {})
        },
        _sum: { grandTotal: true },
      });
      const receipts = await this.prisma.customerReceipt.aggregate({
        where: { 
          customerId: c.id,
          ...(hasDateFilter ? { date: dateFilter } : {})
        },
        _sum: { amount: true },
      });
      const returns = await this.prisma.salesReturn.aggregate({
        where: { 
          customerId: c.id,
          ...(hasDateFilter ? { date: dateFilter } : {})
        },
        _sum: { totalAmount: true },
      });

      const totalSales = Number(sales._sum.grandTotal) || 0;
      const totalReceipts = Number(receipts._sum.amount) || 0;
      const totalReturns = Number(returns._sum.totalAmount) || 0;

      const netPending = forwardingBalance + totalSales - totalReceipts - totalReturns;

      report.push({
        customerId: c.id,
        customerName: c.name,
        phone: c.phone || '-',
        openingBalance: Number(displayOpeningBalance.toFixed(2)),
        openingBalanceType: displayOpeningBalanceType,
        totalSales: Number(totalSales.toFixed(2)),
        totalReceipts: Number(totalReceipts.toFixed(2)),
        totalReturns: Number(totalReturns.toFixed(2)),
        netPending: Number(netPending.toFixed(2)),
      });
    }

    return report;
  }
}
