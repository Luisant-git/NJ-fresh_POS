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

    // --- COGS CALCULATION: OPENING STOCK + PURCHASES - PURCHASE RETURNS - CLOSING STOCK ---
    
    // Get all products and their current purchase rate to value stock
    const allProducts = await this.prisma.product.findMany({
      select: { id: true, purchaseRate: true }
    });
    const productRates = Object.fromEntries(allProducts.map(p => [p.id, Number(p.purchaseRate || 0)]));

    // A. Opening Stock Value (Stock balance before fromDate)
    let openingStockValue = 0;
    if (fromDateStr) {
      const fromDate = new Date(`${fromDateStr}T00:00:00+08:00`);
      const openingTxs = await this.prisma.stockTransaction.groupBy({
        by: ['productId'],
        where: { date: { lt: fromDate } },
        _sum: { quantityIn: true, quantityOut: true }
      });
      openingTxs.forEach(tx => {
        const qty = Number(tx._sum.quantityIn || 0) - Number(tx._sum.quantityOut || 0);
        const rate = productRates[tx.productId] || 0;
        openingStockValue += Math.max(0, qty) * rate;
      });
      openingStockValue = Number(openingStockValue.toFixed(2));
    }

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

    // D. Closing Stock Value (Stock balance up to toDate)
    let closingStockValue = 0;
    const closingTxWhere: any = {};
    if (toDateStr) {
      const toDate = new Date(`${toDateStr}T23:59:59.999+08:00`);
      closingTxWhere.date = { lte: toDate };
    }
    const closingTxs = await this.prisma.stockTransaction.groupBy({
      by: ['productId'],
      where: closingTxWhere,
      _sum: { quantityIn: true, quantityOut: true }
    });
    closingTxs.forEach(tx => {
      const qty = Number(tx._sum.quantityIn || 0) - Number(tx._sum.quantityOut || 0);
      const rate = productRates[tx.productId] || 0;
      closingStockValue += Math.max(0, qty) * rate;
    });
    closingStockValue = Number(closingStockValue.toFixed(2));

    const netCogs = Number((openingStockValue + grossPurchases - totalPurchaseReturns - closingStockValue).toFixed(2));

    // ----------------------------------------------------------------

    const grossProfit = Number((netOperatingRevenue - netCogs).toFixed(2));

    // 5. Operating Expenses (Itemized by Category & Classified)
    const expenses = await this.prisma.expense.findMany({
      where: whereDate,
      include: { category: true },
    });

    const expensesByCategory: Record<string, { amount: number; isOperating: boolean; nature: string }> = {};
    let totalExpenses = 0;
    let operatingExpensesTotal = 0;
    let nonOperatingExpensesTotal = 0;

    for (const exp of expenses) {
      const amount = Number(exp.amount || 0);
      totalExpenses += amount;
      const catName = exp.category?.name || 'Uncategorized';

      const isDrawingOrTransfer = /boss|drawing|fund|pinjam|loan|advance/i.test(catName);
      let nature = 'Operating Expense';
      if (/boss|drawing/i.test(catName)) nature = 'Owner Personal Drawings';
      else if (/fund/i.test(catName)) nature = 'Fund / Reserve Transfer';
      else if (/pinjam|loan|advance/i.test(catName)) nature = 'Staff Loan / Advance';

      if (!expensesByCategory[catName]) {
        expensesByCategory[catName] = {
          amount: 0,
          isOperating: !isDrawingOrTransfer,
          nature,
        };
      }
      expensesByCategory[catName].amount += amount;

      if (isDrawingOrTransfer) {
        nonOperatingExpensesTotal += amount;
      } else {
        operatingExpensesTotal += amount;
      }
    }

    const itemizedExpenses = Object.keys(expensesByCategory).map(name => ({
      name,
      amount: Number(expensesByCategory[name].amount.toFixed(2)),
      isOperating: expensesByCategory[name].isOperating,
      nature: expensesByCategory[name].nature,
    })).sort((a, b) => b.amount - a.amount);

    totalExpenses = Number(totalExpenses.toFixed(2));
    operatingExpensesTotal = Number(operatingExpensesTotal.toFixed(2));
    nonOperatingExpensesTotal = Number(nonOperatingExpensesTotal.toFixed(2));

    const operatingNetProfit = Number((grossProfit - operatingExpensesTotal).toFixed(2));
    const netRetainedCash = Number((operatingNetProfit - nonOperatingExpensesTotal).toFixed(2));
    const netProfit = netRetainedCash;

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
      operatingExpensesTotal,
      nonOperatingExpensesTotal,
      operatingNetProfit,
      netRetainedCash,
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
