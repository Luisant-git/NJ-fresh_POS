import { Injectable } from '@nestjs/common';
import { CreateChequeEntryDto } from './dto/create-cheque-entry.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChequeEntriesService {
  constructor(private prisma: PrismaService) {}

  create(createChequeEntryDto: CreateChequeEntryDto) {
    return this.prisma.chequeEntry.create({
      data: {
        chequeDate: new Date(`${createChequeEntryDto.chequeDate}T00:00:00+08:00`),
        amount: createChequeEntryDto.amount,
        chequeFrom: createChequeEntryDto.chequeFrom,
        chequeTo: createChequeEntryDto.chequeTo,
      },
    });
  }

  findAll(query?: any) {
    const where: any = {};
    if (query?.startDate || query?.endDate) {
      where.chequeDate = {};
      if (query.startDate) where.chequeDate.gte = new Date(`${query.startDate}T00:00:00+08:00`);
      if (query.endDate) {
        where.chequeDate.lte = new Date(`${query.endDate}T23:59:59.999+08:00`);
      }
    }
    if (query?.search) {
      where.OR = [
        { chequeFrom: { contains: query.search, mode: 'insensitive' } },
        { chequeTo: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.chequeEntry.findMany({
      where,
      orderBy: [
        { chequeDate: 'desc' },
        { id: 'desc' }
      ],
    });
  }

  findOne(id: number) {
    return this.prisma.chequeEntry.findUnique({
      where: { id },
    });
  }

  update(id: number, updateData: any) {
    return this.prisma.chequeEntry.update({
      where: { id },
      data: {
        chequeDate: updateData.chequeDate ? new Date(`${updateData.chequeDate}T00:00:00+08:00`) : undefined,
        amount: updateData.amount,
        chequeFrom: updateData.chequeFrom,
        chequeTo: updateData.chequeTo,
      },
    });
  }

  remove(id: number) {
    return this.prisma.chequeEntry.delete({
      where: { id },
    });
  }
}
