import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateSaleDto } from './dto/create-sale.dto';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionType } from '@prisma/client';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) { }

  async create(createSaleDto: CreateSaleDto, userId: number) {
    // Execute in a transaction to guarantee data integrity between sale and stock ledger
    return this.prisma.$transaction(async (tx) => {

      // 0. Auto-generate the correct invoice number safely inside the transaction
      const settings = await tx.settings.findUnique({ where: { id: 1 } });
      const prefix = settings?.invoicePrefix || 'INV-';

      let whereCondition: any = {};
      if (settings?.yearlyInvoiceReset) {
        const startOfYear = new Date(new Date().getFullYear(), 0, 1);
        whereCondition = { date: { gte: startOfYear } };
      }

      const lastSale = await tx.sale.findFirst({
        where: {
          ...whereCondition,
          invoiceNo: { startsWith: prefix }
        },
        orderBy: { id: 'desc' },
        select: { invoiceNo: true },
      });

      let nextNumber = 1;
      if (lastSale && lastSale.invoiceNo.startsWith(prefix)) {
        const remainingStr = lastSale.invoiceNo.substring(prefix.length);
        const match = remainingStr.match(/^(\d+)/);
        if (match && !isNaN(parseInt(match[1], 10))) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      const finalInvoiceNo = `${prefix}${String(nextNumber).padStart(5, '0')}`;

      // 1. Create Sale and SaleItems
      const sale = await tx.sale.create({
        data: {
          invoiceNo: finalInvoiceNo,
          date: new Date(`${createSaleDto.date}T00:00:00+08:00`),
          customerId: createSaleDto.customerId,
          userId: userId,
          paymentModeId: createSaleDto.paymentModeId,
          subtotal: createSaleDto.subtotal,
          tax: createSaleDto.tax || 0,
          discount: createSaleDto.discount || 0,
          grandTotal: createSaleDto.grandTotal,
          items: {
            create: createSaleDto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              noOfBirds: item.noOfBirds || 0,
              rate: item.rate,
              discount: item.discount || 0,
              tax: item.tax || 0,
              amount: item.amount,
            })),
          },
        },
        include: { items: true },
      });

      // 2. Update stock and ledger for each item
      for (const item of createSaleDto.items) {
        // Decrement current stock (allow negative stock to let checkout proceed)
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { decrement: item.quantity },
            ...(item.rate > 0 && { sellingRate: item.rate }),
          },
        });

        // Add ledger entry
        await tx.stockTransaction.create({
          data: {
            date: new Date(`${createSaleDto.date}T00:00:00+08:00`),
            productId: item.productId,
            type: TransactionType.SALE,
            quantityIn: 0,
            quantityOut: item.quantity,
            balance: updatedProduct.currentStock,
            reference: sale.invoiceNo,
          },
        });
      }
      return sale;
    }).catch(err => {
      console.error('PRISMA ERROR IN SALE CREATE:', err);
      throw new BadRequestException(err.message || 'Error creating sale');
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
    if (query?.customerId) {
      where.customerId = Number(query.customerId);
    }
    if (query?.invoiceNo) {
      where.invoiceNo = { contains: query.invoiceNo, mode: 'insensitive' };
    }
    if (query?.paymentModeId) {
      where.paymentModeId = Number(query.paymentModeId);
    }

    return this.prisma.sale.findMany({
      where,
      include: {
        customer: true,
        paymentMode: true,
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { id: 'desc' }
      ],
    });
  }

  findOne(id: number) {
    return this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        paymentMode: true,
        user: {
          select: { id: true, name: true, username: true }
        },
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

  async getNextInvoiceNo() {
    const settings = await this.prisma.settings.findUnique({ where: { id: 1 } });
    const prefix = settings?.invoicePrefix || 'INV-';

    let whereCondition: any = {};
    if (settings?.yearlyInvoiceReset) {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      whereCondition = { date: { gte: startOfYear } };
    }

    const lastSale = await this.prisma.sale.findFirst({
      where: {
        ...whereCondition,
        invoiceNo: { startsWith: prefix }
      },
      orderBy: { id: 'desc' },
      select: { invoiceNo: true },
    });

    let nextNumber = 1;
    if (lastSale && lastSale.invoiceNo.startsWith(prefix)) {
      const remainingStr = lastSale.invoiceNo.substring(prefix.length);
      const match = remainingStr.match(/^(\d+)/);
      if (match && !isNaN(parseInt(match[1], 10))) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(5, '0')}`;
  }

  async remove(id: number) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: true }
      });

      if (!sale) {
        throw new BadRequestException('Sale not found');
      }

      // 1. Reverse stock and ledger
      for (const item of sale.items) {
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantity },
          },
        });

        // Add reverting ledger entry
        await tx.stockTransaction.create({
          data: {
            date: new Date(),
            productId: item.productId,
            type: TransactionType.SALE_RETURN,
            quantityIn: item.quantity,
            quantityOut: 0,
            balance: updatedProduct.currentStock,
            reference: `Reverted ${sale.invoiceNo}`,
          },
        });
      }

      // 2. Delete Sale Items
      await tx.saleItem.deleteMany({
        where: { saleId: id },
      });

      // 3. Delete Sale
      return tx.sale.delete({
        where: { id },
      });
    });
  }

  async update(id: number, createSaleDto: CreateSaleDto, userId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Lock this sale row to prevent concurrent edits.
      await tx.$queryRaw`
        SELECT id
        FROM "Sale"
        WHERE id = ${id}
        FOR UPDATE
      `;

      const existingSale = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingSale) {
        throw new BadRequestException(`Sale invoice not found: ${id}`);
      }

      // 1. Reverse stock from old items
      for (const oldItem of existingSale.items) {
        const updatedProduct = await tx.product.update({
          where: { id: oldItem.productId },
          data: {
            currentStock: { increment: oldItem.quantity },
          },
        });

        await tx.stockTransaction.create({
          data: {
            date: new Date(),
            productId: oldItem.productId,
            type: TransactionType.SALE_RETURN,
            quantityIn: oldItem.quantity,
            quantityOut: 0,
            balance: updatedProduct.currentStock,
            reference: `Reverted for Edit ${existingSale.invoiceNo}`,
          },
        });
      }

      // 2. Delete old Sale items
      await tx.saleItem.deleteMany({
        where: { saleId: id },
      });

      // 3. Update Sale and insert new items
      const updatedSale = await tx.sale.update({
        where: { id },
        data: {
          invoiceNo: createSaleDto.invoiceNo || existingSale.invoiceNo,
          date: new Date(`${createSaleDto.date}T00:00:00+08:00`),
          customerId: createSaleDto.customerId,
          userId: userId,
          paymentModeId: createSaleDto.paymentModeId,
          subtotal: createSaleDto.subtotal,
          tax: createSaleDto.tax || 0,
          discount: createSaleDto.discount || 0,
          grandTotal: createSaleDto.grandTotal,
          items: {
            create: createSaleDto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              noOfBirds: item.noOfBirds || 0,
              rate: item.rate,
              discount: item.discount || 0,
              tax: item.tax || 0,
              amount: item.amount,
            })),
          },
        },
        include: { items: true },
      });

      // 4. Update stock and ledger for new items
      for (const item of createSaleDto.items) {
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { decrement: item.quantity },
            ...(item.rate > 0 && { sellingRate: item.rate }),
          },
        });

        await tx.stockTransaction.create({
          data: {
            date: new Date(`${createSaleDto.date}T00:00:00+08:00`),
            productId: item.productId,
            type: TransactionType.SALE,
            quantityIn: 0,
            quantityOut: item.quantity,
            balance: updatedProduct.currentStock,
            reference: updatedSale.invoiceNo,
          },
        });
      }

      return updatedSale;
    }).catch(err => {
      console.error('PRISMA ERROR IN SALE UPDATE:', err);
      throw new BadRequestException(err.message || 'Error updating sale');
    });
  }
}
