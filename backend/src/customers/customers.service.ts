import { Injectable } from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  create(createCustomerDto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: createCustomerDto,
    });
  }

  findAll() {
    return this.prisma.customer.findMany({
      orderBy: { id: 'desc' },
    });
  }

  findOne(id: number) {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  update(id: number, updateCustomerDto: UpdateCustomerDto) {
    return this.prisma.customer.update({
      where: { id },
      data: updateCustomerDto,
    });
  }

  remove(id: number) {
    return this.prisma.customer.delete({
      where: { id },
    });
  }

  async getCustomerRates(customerId: number) {
    return this.prisma.customerProductRate.findMany({
      where: { customerId },
      include: { product: true },
      orderBy: { productId: 'asc' },
    });
  }

  async upsertCustomerRate(customerId: number, productId: number, rate: number) {
    if (rate <= 0) {
      return this.prisma.customerProductRate.deleteMany({
        where: { customerId, productId },
      });
    }
    return this.prisma.customerProductRate.upsert({
      where: {
        customerId_productId: { customerId, productId },
      },
      update: { rate },
      create: { customerId, productId, rate },
    });
  }

  async setCustomerRates(customerId: number, rates: { productId: number, rate: number }[]) {
    const validPositiveRates = (rates || []).filter(item => item.productId > 0 && Number(item.rate) > 0);
    const activeProductIds = validPositiveRates.map(item => item.productId);

    if (activeProductIds.length === 0) {
      await this.prisma.customerProductRate.deleteMany({
        where: { customerId },
      });
      return [];
    }

    await this.prisma.customerProductRate.deleteMany({
      where: {
        customerId,
        productId: { notIn: activeProductIds },
      },
    });

    const results = [];
    for (const item of validPositiveRates) {
      const res = await this.upsertCustomerRate(customerId, item.productId, Number(item.rate));
      results.push(res);
    }
    return results;
  }
}
