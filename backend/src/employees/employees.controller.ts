import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { SaveEmployeeAttendanceDto } from './dto/save-employee-attendance.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('next-code')
  getNextCode() {
    return this.employeesService.getNextCode();
  }

  @Get('attendance/roster')
  getAttendanceRoster(@Query('date') date?: string) {
    return this.employeesService.getAttendanceRoster(date);
  }

  @Get('attendance/history')
  getAttendanceHistory(
    @Query('employeeId') employeeId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.employeesService.getAttendanceHistory({
      employeeId,
      fromDate,
      toDate,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('attendance')
  saveAttendance(@Body() dto: SaveEmployeeAttendanceDto) {
    return this.employeesService.saveAttendance(dto);
  }

  @Get()
  findAll(@Query('search') search?: string, @Query('status') status?: string) {
    return this.employeesService.findAll({ search, status });
  }

  @Post()
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.remove(id);
  }
}
