import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BankDepositsService {
  constructor(private prisma: PrismaService) {}

  create(createBankDepositDto: any) {
    let dateToSave = new Date();
    if (createBankDepositDto.date) {
      dateToSave = new Date(`${createBankDepositDto.date}T00:00:00+08:00`);
    }
    
    return this.prisma.bankDeposit.create({
      data: {
        date: dateToSave,
        amount: createBankDepositDto.amount,
        depositType: createBankDepositDto.depositType,
        remarks: createBankDepositDto.remarks?.trim?.() ? createBankDepositDto.remarks.trim() : null,
      },
    });
  }

  findAll(fromDate?: string, toDate?: string) {
    const where: any = {};
    if (fromDate && toDate) {
      where.date = {
        gte: new Date(`${fromDate}T00:00:00+08:00`),
        lte: new Date(`${toDate}T23:59:59.999+08:00`),
      };
    }
    return this.prisma.bankDeposit.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  findOne(id: number) {
    return this.prisma.bankDeposit.findUnique({
      where: { id },
    });
  }

  remove(id: number) {
    return this.prisma.bankDeposit.delete({
      where: { id },
    });
  }
}
