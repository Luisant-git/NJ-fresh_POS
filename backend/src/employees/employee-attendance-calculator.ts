export type EmployeeAttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'On Leave' | 'Not Marked';

export function calculateAttendanceStatus(
  checkInTime: string | null | undefined,
  checkOutTime: string | null | undefined,
  requestedStatus: EmployeeAttendanceStatus,
): EmployeeAttendanceStatus {
  // If no check-in and no check-out, only explicit Absent or On Leave are permitted
  if (!checkInTime && !checkOutTime) {
    if (requestedStatus === 'Absent' || requestedStatus === 'On Leave') return requestedStatus;
    return 'Not Marked';
  }

  // Without checkout time entered, do not update attendance status to Present or Half Day
  if (!checkOutTime || !checkInTime) {
    return 'Not Marked';
  }

  if (requestedStatus === 'Absent' || requestedStatus === 'On Leave') return requestedStatus;

  const checkIn = parseTime(checkInTime);
  const checkOut = parseTime(checkOutTime);
  if (checkIn === null || checkOut === null) return 'Not Marked';

  const minutesWorked = checkOut >= checkIn
    ? checkOut - checkIn
    : 1440 - checkIn + checkOut;

  if (minutesWorked >= 480) return 'Present';
  if (minutesWorked >= 240) return 'Half Day';
  return 'Absent';
}

function parseTime(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
