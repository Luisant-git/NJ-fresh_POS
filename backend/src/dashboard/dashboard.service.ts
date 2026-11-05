import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerReceiptsService } from '../customer-receipts/customer-receipts.service';
import { SupplierPaymentsService } from '../supplier-payments/supplier-payments.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private customerReceiptsService: CustomerReceiptsService,
    private supplierPaymentsService: SupplierPaymentsService
  ) {}

  async getDashboardSummary(startDateStr?: string, endDateStr?: string) {
    const start = startDateStr ? new Date(startDateStr) : new Date();
    if (isNaN(start.getTime())) {
      start.setTime(Date.now());
    }
    start.setHours(0, 0, 0, 0);

    const end = endDateStr ? new Date(endDateStr) : new Date(start);
    if (isNaN(end.getTime())) {
      end.setTime(start.getTime());
    }
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1); // Exclusive upper bound for the end date

    const firstDayOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);

    // Cash Sales
    const cashSalesAggregate = await this.prisma.sale.aggregate({
      _sum: { grandTotal: true },
      where: { 
        date: { gte: start, lt: end },
        paymentMode: { name: { not: 'Credit' } }
      },
    });
    const cashSalesToday = cashSalesAggregate._sum.grandTotal ? Number(cashSalesAggregate._sum.grandTotal) : 0;

    // Credit Sales
    const creditSalesAggregate = await this.prisma.sale.aggregate({
      _sum: { grandTotal: true },
      where: { 
        date: { gte: start, lt: end },
        paymentMode: { name: 'Credit' }
      },
    });
    const creditSalesToday = creditSalesAggregate._sum.grandTotal ? Number(creditSalesAggregate._sum.grandTotal) : 0;

    // Cash Purchases
    const cashPurchasesAggregate = await this.prisma.purchase.aggregate({
      _sum: { grandTotal: true },
      where: { 
        date: { gte: start, lt: end },
        paymentMode: { name: { not: 'Credit' } }
      },
    });
    const cashPurchasesToday = cashPurchasesAggregate._sum.grandTotal ? Number(cashPurchasesAggregate._sum.grandTotal) : 0;

    // Credit Purchases
    const creditPurchasesAggregate = await this.prisma.purchase.aggregate({
      _sum: { grandTotal: true },
      where: { 
        date: { gte: start, lt: end },
        paymentMode: { name: 'Credit' }
      },
    });
    const creditPurchasesToday = creditPurchasesAggregate._sum.grandTotal ? Number(creditPurchasesAggregate._sum.grandTotal) : 0;

    const supplierReport = await this.supplierPaymentsService.getConsolidationReport();
    const pendingPayables = supplierReport.reduce((sum, s) => sum + (s.netPending > 0 ? s.netPending : 0), 0);

    const customerReport = await this.customerReceiptsService.getConsolidationReport();
    const pendingReceivables = customerReport.reduce((sum, c) => sum + (c.netPending > 0 ? c.netPending : 0), 0);

    // Today's Expenses
    const expensesAggregate = await this.prisma.expense.aggregate({
      _sum: { amount: true },
      where: { date: { gte: start, lt: end } },
    });
    const expensesToday = expensesAggregate._sum.amount ? Number(expensesAggregate._sum.amount) : 0;

    // Collections received from customers in the selected period (Due Collections)
    const collectionsAggregate = await this.prisma.customerReceipt.aggregate({
      _sum: { amount: true },
      where: { date: { gte: start, lt: end } },
    });
    const collectionsInPeriod = collectionsAggregate._sum.amount ? Number(collectionsAggregate._sum.amount) : 0;

    // Products Count
    const productsCount = await this.prisma.product.count();

    // Low Stock Count
    const lowStockResult: any[] = await this.prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "Product" WHERE "currentStock" <= "minStock"
    `;
    const lowStockCount = Number(lowStockResult[0]?.count || 0);

    // Today's Bills
    const billsToday = await this.prisma.sale.count({
      where: { date: { gte: start, lt: end } },
    });

    // Low Stock Products Details
    const lowStockProductsRaw: any[] = await this.prisma.$queryRaw`
      SELECT id, name, code, "currentStock", "minStock" 
      FROM "Product" 
      WHERE "currentStock" <= "minStock" 
      ORDER BY "currentStock" ASC 
      LIMIT 10
    `;
    const lowStockProducts = lowStockProductsRaw.map((p) => ({
      id: Number(p.id),
      name: p.name,
        code: p.code,
      currentStock: Number(p.currentStock),
      minStock: Number(p.minStock),
    }));

    // Monthly Chart Data (group by date)
    const chartDataRaw: any[] = await this.prisma.$queryRaw`
      SELECT DATE(s."date" + interval '8 hours') as "name", SUM(s."grandTotal") as "sales"
      FROM "Sale" s
      WHERE s."date" >= ${firstDayOfMonth}
      GROUP BY DATE(s."date" + interval '8 hours')
      ORDER BY DATE(s."date" + interval '8 hours') ASC
    `;
    const chartData = chartDataRaw.map((d) => {
      const dateObj = new Date(d.name);
      return {
        name: dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        sales: Number(d.sales),
      };
    });
    // Recent Bank Deposits
    const recentBankDeposits = await this.prisma.bankDeposit.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: 'desc' },
      take: 15
    });

    return {
      cashSalesToday,
      creditSalesToday,
      cashPurchasesToday,
      creditPurchasesToday,
      pendingPayables,
      pendingReceivables,
      expensesToday,
      collectionsInPeriod,
      productsCount,
      lowStockCount,
      billsToday,
      lowStockProducts,
      chartData,
      recentBankDeposits,
      unpaidCustomerBills: await this.getTopUnpaidCustomerBills(15, start, end),
      unpaidSupplierBills: await this.getTopUnpaidSupplierBills(15, start, end)
    };
  }

  private async getTopUnpaidCustomerBills(limit: number, start: Date, end: Date) {
    const customers = await this.prisma.customer.findMany();
    let allUnpaidBills: any[] = [];
    
    // Process all customers to find unpaid bills
    for (const customer of customers) {
      try {
        const { balance } = await this.customerReceiptsService.getBalance(customer.id);
        if (balance > 0) {
          const unpaid = await this.customerReceiptsService.getUnpaidBills(customer.id);
          let pendingBills = unpaid.filter(b => b.pending > 0).map(b => ({
            ...b,
            entityName: customer.name,
            entityId: customer.id
          }));
          
          pendingBills = pendingBills.filter(b => {
            const bDate = new Date(b.date);
            return bDate >= start && bDate < end;
          });
          
          allUnpaidBills.push(...pendingBills);
        }
      } catch(e) {
        // Skip on error
      }
    }
    
    // Sort by date (oldest first)
    allUnpaidBills.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return allUnpaidBills.slice(0, limit);
  }

  private async getTopUnpaidSupplierBills(limit: number, start: Date, end: Date) {
    const suppliers = await this.prisma.supplier.findMany();
    let allUnpaidBills: any[] = [];
    
    // Process all suppliers to find unpaid bills
    for (const supplier of suppliers) {
      try {
        const { balance } = await this.supplierPaymentsService.getBalance(supplier.id);
        if (balance > 0) {
          const unpaid = await this.supplierPaymentsService.getUnpaidBills(supplier.id);
          let pendingBills = unpaid.filter(b => b.pending > 0).map(b => ({
            ...b,
            entityName: supplier.name,
            entityId: supplier.id
          }));

          pendingBills = pendingBills.filter(b => {
            const bDate = new Date(b.date);
            return bDate >= start && bDate < end;
          });

          allUnpaidBills.push(...pendingBills);
        }
      } catch(e) {
        // Skip on error
      }
    }
    
    // Sort by date (oldest first)
    allUnpaidBills.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return allUnpaidBills.slice(0, limit);
  }
}
