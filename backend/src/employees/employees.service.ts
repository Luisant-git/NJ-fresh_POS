import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { SaveEmployeeAttendanceDto } from './dto/save-employee-attendance.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { calculateAttendanceStatus, EmployeeAttendanceStatus } from './employee-attendance-calculator';

const EMPLOYEE_STATUSES = ['Active', 'Inactive'];
const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Half Day', 'On Leave', 'Not Marked'];

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(date: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('Date must use YYYY-MM-DD format');
    }
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('Invalid date');
    }
    return parsed;
  }

  async getNextCode(): Promise<{ nextCode: string; code: string }> {
    const codes = await this.prisma.employee.findMany({ select: { employeeCode: true } });
    const max = codes.reduce((current, employee) => {
      const match = /^EMP-(\d+)$/.exec(employee.employeeCode);
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    const nextCode = `EMP-${String(max + 1).padStart(3, '0')}`;
    return { nextCode, code: nextCode };
  }

  findAll(query: { search?: string; status?: string } = {}) {
    const search = query.search?.trim();
    const status = query.status?.trim();
    return this.prisma.employee.findMany({
      where: {
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(search
          ? {
              OR: [
                { employeeCode: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { role: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ employeeCode: 'asc' }, { id: 'asc' }],
    });
  }

  async findOne(id: number) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    const employeeCode = dto.employeeCode.trim();
    if (!employeeCode || !dto.name.trim() || !dto.role.trim()) {
      throw new BadRequestException('Employee code, name, and role are required');
    }
    const existing = await this.prisma.employee.findUnique({ where: { employeeCode } });
    if (existing) throw new BadRequestException('Employee code is already in use');
    return this.prisma.employee.create({
      data: {
        employeeCode,
        name: dto.name.trim(),
        role: dto.role.trim(),
        phone: dto.phone?.trim() || null,
        status: dto.status ?? 'Active',
      },
    });
  }

  async update(id: number, dto: UpdateEmployeeDto) {
    await this.findOne(id);
    if (dto.status && !EMPLOYEE_STATUSES.includes(dto.status)) {
      throw new BadRequestException('Status must be Active or Inactive');
    }
    const employeeCode = dto.employeeCode?.trim();
    if (
      (employeeCode !== undefined && !employeeCode) ||
      (dto.name !== undefined && !dto.name.trim()) ||
      (dto.role !== undefined && !dto.role.trim())
    ) {
      throw new BadRequestException('Employee code, name, and role cannot be blank');
    }
    if (employeeCode) {
      const existing = await this.prisma.employee.findUnique({ where: { employeeCode } });
      if (existing && existing.id !== id) {
        throw new BadRequestException('Employee code is already in use');
      }
    }
    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(employeeCode !== undefined ? { employeeCode } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.employeeAttendance.deleteMany({ where: { employeeId: id } });
    return this.prisma.employee.delete({ where: { id } });
  }

  async getAttendanceRoster(dateString?: string) {
    const date = this.parseDate(dateString ?? new Date().toISOString().slice(0, 10));
    const dateStr = date.toISOString().slice(0, 10);
    const [employees, records] = await Promise.all([
      this.prisma.employee.findMany({
        where: { status: 'Active' },
        orderBy: [{ employeeCode: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.employeeAttendance.findMany({ where: { date } }),
    ]);
    const byEmployee = new Map(records.map((record) => [record.employeeId, record]));
    return employees.map((employee) => {
      const attendance = byEmployee.get(employee.id);
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        name: employee.name,
        role: employee.role,
        phone: employee.phone,
        date: dateStr,
        attendanceId: attendance?.id ?? null,
        checkInTime: attendance?.checkInTime ?? '',
        checkOutTime: attendance?.checkOutTime ?? '',
        status: attendance?.status ?? 'Not Marked',
        remarks: attendance?.remarks ?? '',
      };
    });
  }

  async saveAttendance(dto: SaveEmployeeAttendanceDto) {
    await this.findOne(dto.employeeId);
    if (!ATTENDANCE_STATUSES.includes(dto.status)) {
      throw new BadRequestException('Invalid attendance status');
    }
    const date = this.parseDate(dto.date);
    const status = calculateAttendanceStatus(dto.checkInTime, dto.checkOutTime, dto.status as EmployeeAttendanceStatus);
    return this.prisma.employeeAttendance.upsert({
      where: { employeeId_date: { employeeId: dto.employeeId, date } },
      create: {
        employeeId: dto.employeeId,
        date,
        checkInTime: dto.checkInTime || null,
        checkOutTime: dto.checkOutTime || null,
        status,
        remarks: dto.remarks?.trim() || null,
      },
      update: {
        checkInTime: dto.checkInTime || null,
        checkOutTime: dto.checkOutTime || null,
        status,
        remarks: dto.remarks?.trim() || null,
      },
    });
  }

  async getAttendanceHistory(filters: {
    employeeId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 25));
    const employeeId = filters.employeeId ? Number(filters.employeeId) : undefined;
    if (employeeId !== undefined && (!Number.isInteger(employeeId) || employeeId < 1)) {
      throw new BadRequestException('Invalid employee ID');
    }
    const from = filters.fromDate ? this.parseDate(filters.fromDate) : undefined;
    const to = filters.toDate ? this.parseDate(filters.toDate) : undefined;
    if (from && to && from > to) throw new BadRequestException('From date must not be after to date');
    const search = filters.search?.trim();
    const where = {
      ...(employeeId ? { employeeId } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            employee: {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { employeeCode: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    };
    const [records, total, allStatuses] = await Promise.all([
      this.prisma.employeeAttendance.findMany({
        where,
        include: { employee: { select: { id: true, employeeCode: true, name: true, role: true } } },
        orderBy: [{ date: 'desc' }, { employeeId: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAttendance.count({ where }),
      this.prisma.employeeAttendance.findMany({ where, select: { status: true } }),
    ]);
    const summary = allStatuses.reduce(
      (counts, record) => {
        if (record.status === 'Present') counts.present += 1;
        else if (record.status === 'Absent') counts.absent += 1;
        else if (record.status === 'Half Day') counts.halfDay += 1;
        else if (record.status === 'On Leave') counts.onLeave += 1;
        return counts;
      },
      { present: 0, absent: 0, halfDay: 0, onLeave: 0 },
    );
    return { records, total, page, limit, totalPages: Math.ceil(total / limit) || 1, summary };
  }
}
