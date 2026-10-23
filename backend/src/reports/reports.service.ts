import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

    async getProfitLoss(fromDateStr?: string, toDateStr?: string) {
    const whereDate: any = {};
    if (fromDateStr || toDateStr) {
      whereDate.date = {};
      if (fromDateStr) {
        whereDate.date.gte = new Date(`${fromDateStr}T00:00:00+08:00`);
      }
      if (toDateStr) {
        whereDate.date.lte = new Date(`${toDateStr}T23:59:59.999+08:00`);
      }
    }

    // 1. Gross Sales Revenue
    const sales = await this.prisma.sale.aggregate({
      where: whereDate,
      _sum: { grandTotal: true },
    });
    const grossSales = Number(sales._sum.grandTotal || 0);

    // 2. Sales Returns
    const salesReturns = await this.prisma.salesReturn.aggregate({
      where: whereDate,
      _sum: { totalAmount: true },
    });
    const totalSalesReturns = Number(salesReturns._sum.totalAmount || 0);

    const netOperatingRevenue = grossSales - totalSalesReturns;

    // --- COGS CALCULATION: PURCHASES ONLY ---
    
    // B. Purchases during period
    const purchases = await this.prisma.purchase.aggregate({
      where: whereDate,
      _sum: { grandTotal: true },
    });
    const grossPurchases = Number(purchases._sum.grandTotal || 0);

    // C. Purchase Returns during period
    const purchaseReturns = await this.prisma.purchaseReturn.aggregate({
      where: whereDate,
      _sum: { totalAmount: true },
    });
    const totalPurchaseReturns = Number(purchaseReturns._sum.totalAmount || 0);

    const netCogs = grossPurchases - totalPurchaseReturns;
    const openingStockValue = 0;
    const closingStockValue = 0;

    // ----------------------------------------------------------------

    const grossProfit = netOperatingRevenue - netCogs;

    // 5. Operating Expenses (Itemized by Category)
    const expenses = await this.prisma.expense.findMany({
      where: whereDate,
      include: { category: true },
    });

    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;

    for (const exp of expenses) {
      const amount = Number(exp.amount || 0);
      totalExpenses += amount;
      const catName = exp.category?.name || 'Uncategorized';
      if (!expensesByCategory[catName]) {
        expensesByCategory[catName] = 0;
      }
      expensesByCategory[catName] += amount;
    }

    const itemizedExpenses = Object.keys(expensesByCategory).map(name => ({
      name,
      amount: expensesByCategory[name],
    }));

    const netProfit = grossProfit - totalExpenses;

    return {
      grossSales,
      totalSalesReturns,
      netOperatingRevenue,
      openingStockValue,
      grossPurchases,
      totalPurchaseReturns,
      closingStockValue,
      netCogs,
      grossProfit,
      itemizedExpenses,
      totalExpenses,
      netProfit,
    };
  }

  async getProductWiseSales(fromDate?: string, toDate?: string, productId?: number) {
    const whereDate: any = {};
    if (fromDate || toDate) {
      whereDate.date = {};
      if (fromDate) {
        whereDate.date.gte = new Date(`${fromDate}T00:00:00+08:00`);
      }
      if (toDate) {
        whereDate.date.lte = new Date(`${toDate}T23:59:59.999+08:00`);
      }
    }

    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: whereDate,
        ...(productId ? { productId } : {}),
      },
      include: {
        sale: true,
        product: true
      }
    });

    const productGroups: any = {};

    for (const item of saleItems) {
      if (!item.product) continue;
      
      const productKey = `${item.product.code ? item.product.code + ' - ' : ''}${item.product.name}`;
      
      if (!productGroups[productKey]) {
        productGroups[productKey] = {
          productName: productKey,
          items: [],
          totalQty: 0,
          totalValue: 0
        };
      }

      const qty = Number(item.quantity) || 0;
      const value = Number(item.amount) || 0;
      const safeQty = Number(qty.toFixed(2));
      const safeValue = Number(value.toFixed(2));

      productGroups[productKey].items.push({
        invoiceNo: item.sale?.invoiceNo || '-',
        date: item.sale?.date || new Date(),
        qty: safeQty,
        value: safeValue,
        saleId: item.saleId
      });
      productGroups[productKey].totalQty = Number((productGroups[productKey].totalQty + safeQty).toFixed(2));
      productGroups[productKey].totalValue = Number((productGroups[productKey].totalValue + safeValue).toFixed(2));
    }

    return Object.values(productGroups).sort((a: any, b: any) => a.productName.localeCompare(b.productName));
  }
}
