import { Injectable, BadRequestException } from '@nestjs/common';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}

  async create(createPurchaseDto: CreatePurchaseDto, userId: number = 1) {
    // Execute in a transaction to guarantee data integrity between purchase and stock ledger
    return this.prisma.$transaction(async (tx) => {
      // 1. Create Purchase and PurchaseItems
      const purchase = await tx.purchase.create({
        data: {
          invoiceNo: createPurchaseDto.invoiceNo,
          supplierInvoiceNo: createPurchaseDto.supplierInvoiceNo,
          date: new Date(`${createPurchaseDto.date}T00:00:00+08:00`),
          supplierId: createPurchaseDto.supplierId,
          paymentModeId: createPurchaseDto.paymentModeId,
          subtotal: createPurchaseDto.subtotal,
          tax: createPurchaseDto.tax || 0,
          discount: createPurchaseDto.discount || 0,
          grandTotal: createPurchaseDto.grandTotal,
          items: {
            create: createPurchaseDto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              rate: item.rate,
              tax: item.tax || 0,
              amount: item.amount,
            })),
          },
        },
        include: { items: true },
      });

      // 2. Update stock, rates, and ledger for each item
      for (const item of createPurchaseDto.items) {
        // Fetch current product to compare rates
        const currentProduct = await tx.product.findUnique({ where: { id: item.productId } });
        if (!currentProduct) {
          throw new BadRequestException(`Product not found: ${item.productId}`);
        }

        let newPurchaseRate = Number(currentProduct.purchaseRate);
        let newWholesaleRate = Number(currentProduct.wholesaleRate);
        let newSellingRate = Number(currentProduct.sellingRate);
        let newMrp = Number(currentProduct.mrp);

        if (item.rate && item.rate > newPurchaseRate) newPurchaseRate = item.rate;
        if (item.wRate && item.wRate > newWholesaleRate) newWholesaleRate = item.wRate;
        if (item.sRate !== undefined && item.sRate > 0) newSellingRate = item.sRate;
        if (item.mrp && item.mrp > newMrp) newMrp = item.mrp;

        // Increment current stock and update rates
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantity },
            purchaseRate: newPurchaseRate,
            wholesaleRate: newWholesaleRate,
            sellingRate: newSellingRate,
            mrp: newMrp,
          },
        });

        // Add ledger entry
        await tx.stockTransaction.create({
          data: {
            date: new Date(`${createPurchaseDto.date}T00:00:00+08:00`),
            productId: item.productId,
            type: TransactionType.PURCHASE,
            quantityIn: item.quantity,
            quantityOut: 0,
            balance: updatedProduct.currentStock,
            reference: purchase.invoiceNo,
          },
        });
      }

      return purchase;
    }).catch(err => {
      console.error('PRISMA ERROR IN PURCHASE CREATE:', err);
      throw new BadRequestException(err.message || 'Error creating purchase');
    });
  }

  findAll(query?: any) {
    const where: any = {};
    if (query?.fromDate || query?.toDate) {
      where.date = {};
      if (query.fromDate) where.date.gte = new Date(`${query.fromDate}T00:00:00+08:00`);
      if (query.toDate) {
        where.date.lte = new Date(`${query.toDate}T23:59:59.999+08:00`);
      }
    }
    if (query?.supplierId) {
      where.supplierId = Number(query.supplierId);
    }
    if (query?.invoiceNo) {
      where.OR = [
        { invoiceNo: { contains: query.invoiceNo, mode: 'insensitive' } },
        { supplierInvoiceNo: { contains: query.invoiceNo, mode: 'insensitive' } }
      ];
    }
    if (query?.paymentModeId) {
      where.paymentModeId = Number(query.paymentModeId);
    }

    return this.prisma.purchase.findMany({
      where,
      include: {
        supplier: true,
        paymentMode: true,
        items: {
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                name: true,
                code: true,
                unit: { select: { id: true, name: true, shortCode: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { date: 'desc' },
        { id: 'desc' },
      ],
    });
  }

  findOne(id: number) {
    return this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        paymentMode: true,
        items: {
          include: {
            product: {
              include: {
                unit: true
              }
            },
          },
        },
      },
    });
  }

  async getLatestRate(productId: number) {
    const latestItem = await this.prisma.purchaseItem.findFirst({
      where: { productId },
      orderBy: { id: 'desc' }, // Order by id desc to get the most recent insertion
    });
    return latestItem || null;
  }

  async getNextEntryNo() {
    const lastPurchase = await this.prisma.purchase.findFirst({
      orderBy: { id: 'desc' },
      select: { invoiceNo: true },
    });

    let nextNumber = 1;
    if (lastPurchase && lastPurchase.invoiceNo.startsWith('PUR-')) {
      const match = lastPurchase.invoiceNo.match(/PUR-(\d+)/);
      if (match && !isNaN(parseInt(match[1], 10))) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }
    
    return `PUR-${String(nextNumber).padStart(5, '0')}`;
  }

  async remove(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!purchase) {
        throw new BadRequestException('Purchase not found');
      }

      // 1. Reverse stock and ledger
      for (const item of purchase.items) {
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { decrement: item.quantity },
          },
        });

        // Add reverting ledger entry
        await tx.stockTransaction.create({
          data: {
            date: new Date(),
            productId: item.productId,
            type: TransactionType.PURCHASE_RETURN,
            quantityIn: 0,
            quantityOut: item.quantity,
            balance: updatedProduct.currentStock,
            reference: `Reverted ${purchase.invoiceNo}`,
          },
        });
      }

      // 2. Delete Purchase Items
      await tx.purchaseItem.deleteMany({
        where: { purchaseId: id },
      });

      // 3. Delete Purchase
      return tx.purchase.delete({
        where: { id },
      });
    });
  }

  async update(id: number, createPurchaseDto: CreatePurchaseDto, userId: number = 1) {
    return this.prisma.$transaction(async (tx) => {
      const existingPurchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingPurchase) {
        throw new BadRequestException(`Purchase invoice not found: ${id}`);
      }

      // 1. Reverse stock from old items
      for (const oldItem of existingPurchase.items) {
        const updatedProduct = await tx.product.update({
          where: { id: oldItem.productId },
          data: {
            currentStock: { decrement: oldItem.quantity },
          },
        });

        await tx.stockTransaction.create({
          data: {
            date: new Date(),
            productId: oldItem.productId,
            type: TransactionType.PURCHASE_RETURN,
            quantityIn: 0,
            quantityOut: oldItem.quantity,
            balance: updatedProduct.currentStock,
            reference: `Reverted for Edit ${existingPurchase.invoiceNo}`,
          },
        });
      }

      // 2. Delete old Purchase items
      await tx.purchaseItem.deleteMany({
        where: { purchaseId: id },
      });

      // 3. Update Purchase and insert new items
      const updatedPurchase = await tx.purchase.update({
        where: { id },
        data: {
          invoiceNo: createPurchaseDto.invoiceNo || existingPurchase.invoiceNo,
          supplierInvoiceNo: createPurchaseDto.supplierInvoiceNo,
          date: new Date(`${createPurchaseDto.date}T00:00:00+08:00`),
          supplierId: createPurchaseDto.supplierId,
          paymentModeId: createPurchaseDto.paymentModeId,
          subtotal: createPurchaseDto.subtotal,
          tax: createPurchaseDto.tax || 0,
          discount: createPurchaseDto.discount || 0,
          grandTotal: createPurchaseDto.grandTotal,
          items: {
            create: createPurchaseDto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              rate: item.rate,
              tax: item.tax || 0,
              amount: item.amount,
            })),
          },
        },
        include: { items: true },
      });

      // 4. Update stock, rates, and ledger for new items
      for (const item of createPurchaseDto.items) {
        const currentProduct = await tx.product.findUnique({ where: { id: item.productId } });
        if (!currentProduct) {
          throw new BadRequestException(`Product not found: ${item.productId}`);
        }

        let newPurchaseRate = Number(currentProduct.purchaseRate);
        let newWholesaleRate = Number(currentProduct.wholesaleRate);
        let newSellingRate = Number(currentProduct.sellingRate);
        let newMrp = Number(currentProduct.mrp);

        if (item.rate && item.rate > newPurchaseRate) newPurchaseRate = item.rate;
        if (item.wRate && item.wRate > newWholesaleRate) newWholesaleRate = item.wRate;
        if (item.sRate !== undefined && item.sRate > 0) newSellingRate = item.sRate;
        if (item.mrp && item.mrp > newMrp) newMrp = item.mrp;

        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantity },
            purchaseRate: newPurchaseRate,
            wholesaleRate: newWholesaleRate,
            sellingRate: newSellingRate,
            mrp: newMrp,
          },
        });

        await tx.stockTransaction.create({
          data: {
            date: new Date(`${createPurchaseDto.date}T00:00:00+08:00`),
            productId: item.productId,
            type: TransactionType.PURCHASE,
            quantityIn: item.quantity,
            quantityOut: 0,
            balance: updatedProduct.currentStock,
            reference: updatedPurchase.invoiceNo,
          },
        });
      }

      return updatedPurchase;
    }).catch(err => {
      console.error('PRISMA ERROR IN PURCHASE UPDATE:', err);
      throw new BadRequestException(err.message || 'Error updating purchase');
    });
  }
}
