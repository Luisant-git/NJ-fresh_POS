import { calculateAttendanceStatus } from './employee-attendance-calculator';

describe('calculateAttendanceStatus', () => {
  it('marks equal check-in and check-out times Absent', () => {
    expect(calculateAttendanceStatus('14:00', '14:00', 'Present')).toBe('Absent');
  });

  it('marks less than four hours Absent and four to under eight hours Half Day', () => {
    expect(calculateAttendanceStatus('09:00', '12:59', 'Present')).toBe('Absent');
    expect(calculateAttendanceStatus('09:00', '13:00', 'Present')).toBe('Half Day');
    expect(calculateAttendanceStatus('09:00', '16:59', 'Present')).toBe('Half Day');
  });

  it('marks eight or more hours Present', () => {
    expect(calculateAttendanceStatus('09:00', '17:00', 'Half Day')).toBe('Present');
  });

  it('supports overnight shifts', () => {
    expect(calculateAttendanceStatus('22:00', '06:00', 'Present')).toBe('Present');
  });

  it('preserves manual Absent and On Leave statuses', () => {
    expect(calculateAttendanceStatus('09:00', '18:00', 'Absent')).toBe('Absent');
    expect(calculateAttendanceStatus('09:00', '18:00', 'On Leave')).toBe('On Leave');
  });

  it('keeps the selected status while one of the times is missing', () => {
    expect(calculateAttendanceStatus('09:00', undefined, 'Present')).toBe('Present');
  });
});
