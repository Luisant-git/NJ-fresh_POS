import { BadRequestException } from '@nestjs/common';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  const prisma = {
    employee: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    employeeAttendance: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      count: jest.fn(),
    },
  };
  let service: EmployeesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmployeesService(prisma as any);
  });

  it('creates an employee using only the supported master fields', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);
    prisma.employee.create.mockResolvedValue({ id: 1 });

    await service.create({
      employeeCode: ' E-12 ',
      name: ' Alex Doe ',
      role: ' Store Manager ',
      phone: ' 555-0101 ',
    });

    expect(prisma.employee.create).toHaveBeenCalledWith({
      data: {
        employeeCode: 'E-12',
        name: 'Alex Doe',
        role: 'Store Manager',
        phone: '555-0101',
        status: 'Active',
      },
    });
  });

  it('rejects duplicate employee codes', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 1 });

    await expect(service.create({
      employeeCode: 'E-12',
      name: 'Alex Doe',
      role: 'Cashier',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.employee.create).not.toHaveBeenCalled();
  });

  it('returns an active employee roster with an unmarked attendance default', async () => {
    prisma.employee.findMany.mockResolvedValue([{
      id: 3,
      employeeCode: 'E-03',
      name: 'Taylor',
      role: 'Cashier',
      phone: null,
    }]);
    prisma.employeeAttendance.findMany.mockResolvedValue([]);

    const roster = await service.getAttendanceRoster('2026-10-29');

    expect(roster).toEqual([expect.objectContaining({
      employeeId: 3,
      date: '2026-10-29',
      status: 'Not Marked',
      checkInTime: '',
      checkOutTime: '',
    })]);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'Active' },
    }));
  });

  it('upserts one attendance record per employee and date', async () => {
    prisma.employee.findUnique.mockResolvedValue({ id: 3 });
    prisma.employeeAttendance.upsert.mockResolvedValue({ id: 8 });

    await service.saveAttendance({
      employeeId: 3,
      date: '2026-10-29',
      checkInTime: '08:30',
      checkOutTime: '17:00',
      status: 'Present',
      remarks: '  On time  ',
    });

    expect(prisma.employeeAttendance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_date: { employeeId: 3, date: new Date('2026-10-29T00:00:00.000Z') } },
      create: expect.objectContaining({ checkInTime: '08:30', checkOutTime: '17:00', remarks: 'On time' }),
    }));
  });

  it('generates the next sequential employee code', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { employeeCode: 'EMP-001' },
      { employeeCode: 'EMP-005' },
    ]);

    const result = await service.getNextCode();
    expect(result).toEqual({ nextCode: 'EMP-006', code: 'EMP-006' });
  });

  it('generates EMP-001 when no existing employee codes are present', async () => {
    prisma.employee.findMany.mockResolvedValue([]);

    const result = await service.getNextCode();
    expect(result).toEqual({ nextCode: 'EMP-001', code: 'EMP-001' });
  });
});
