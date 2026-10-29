import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class SaveEmployeeAttendanceDto {
  @IsInt()
  @Min(1)
  employeeId: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkInTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  checkOutTime?: string;

  @IsIn(['Present', 'Absent', 'Half Day', 'On Leave', 'Not Marked'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}
