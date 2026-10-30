import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { getMalaysiaDateStr } from '../../utils/date';

type AttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'On Leave' | 'Not Marked';
type RosterRow = {
  employeeId: number;
  employeeCode: string;
  name: string;
  role: string;
  phone: string | null;
  date: string;
  checkInTime: string;
  checkOutTime: string;
  status: AttendanceStatus;
  remarks: string;
};
type AttendanceDraft = Pick<RosterRow, 'checkInTime' | 'checkOutTime' | 'status' | 'remarks'>;
type HistoryData = {
  records: Array<{
    id: number;
    date: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    status: string;
    remarks: string | null;
    employee: { id: number; employeeCode: string; name: string; role: string };
  }>;
  total: number;
  page: number;
  totalPages: number;
  summary: { present: number; absent: number; halfDay: number; onLeave: number };
};
type Employee = { id: number; employeeCode: string; name: string; status: string };
type AttendancePayload = Omit<AttendanceDraft, 'checkInTime' | 'checkOutTime'> & {
  employeeId: number;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
};

const fieldClass = 'h-10 rounded-sm border border-[#CCC] bg-white px-3 text-sm font-bold text-black shadow-inner outline-none transition focus:border-[#3B82F6] focus:bg-[#EBF5FF] focus:ring-0';
const statuses: AttendanceStatus[] = ['Present', 'Absent', 'Half Day', 'On Leave', 'Not Marked'];
const pageSizes = [10, 25, 50, 100, 99999];
const malaysiaDateString = (date = new Date()) => getMalaysiaDateStr(date);
const formatDate = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC' });
const getCurrentTime = (now = new Date()) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}).format(now);
const formatTime12Hour = (value: string | null | undefined) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || '');
  if (!match) return value || '--:--';
  const hours = Number(match[1]);
  return `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
};
const timeInputParts = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return { display: '', meridiem: 'AM' as const };
  const hours = Number(match[1]);
  return {
    display: `${String(hours % 12 || 12).padStart(2, '0')}:${match[2]}`,
    meridiem: (hours < 12 ? 'AM' : 'PM') as 'AM' | 'PM',
  };
};
const to24HourTime = (value: string, meridiem: 'AM' | 'PM') => {
  const match = /^(0?[1-9]|1[0-2]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  let hours = Number(match[1]) % 12;
  if (meridiem === 'PM') hours += 12;
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
};
const getMinutesFromTime = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const getWorkedMinutes = (checkIn: string, checkOut: string) => {
  const start = getMinutesFromTime(checkIn);
  const end = getMinutesFromTime(checkOut);
  if (start === null || end === null) return null;
  return end >= start ? end - start : 1440 - start + end;
};
const getDurationStatus = (minutes: number) => {
  if (minutes >= 480) return 'Present';
  if (minutes >= 240) return 'Half Day';
  return 'Absent';
};
const toInputTime = (value: string | null | undefined) => {
  if (!value || value === '--:--') return '';
  const twentyFourHour = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHour) return `${twentyFourHour[1].padStart(2, '0')}:${twentyFourHour[2]}`;
  const twelveHour = value.match(/^(\d{1,2}):(\d{2})(?:\:\d{2})?\s*(AM|PM)$/i);
  if (!twelveHour) return '';
  let hours = Number(twelveHour[1]) % 12;
  if (twelveHour[3].toUpperCase() === 'PM') hours += 12;
  return `${String(hours).padStart(2, '0')}:${twelveHour[2]}`;
};
const statusClass = (status: string) => {
  if (status === 'Present') return 'border-green-200 bg-green-50 text-green-700';
  if (status === 'Absent') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'Half Day') return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'On Leave') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-[#D1D5DB] bg-[#F3F4F6] text-[#4B5563]';
};

export default function EmployeeAttendance() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'daily' | 'history'>('daily');
  const [date, setDate] = useState(malaysiaDateString);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedEmployee, setSelectedEmployee] = useState<RosterRow | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceDraft | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [historyEmployee, setHistoryEmployee] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(25);

  const rosterQuery = useQuery({
    queryKey: ['employee-attendance-roster', date],
    queryFn: async () => (await api.get<RosterRow[]>('/employees/attendance/roster', { params: { date } })).data,
  });
  const employeesQuery = useQuery({
    queryKey: ['employees', 'ALL'],
    queryFn: async () => (await api.get<Employee[]>('/employees', { params: { status: 'ALL' } })).data,
  });
  const historyQuery = useQuery({
    queryKey: ['employee-attendance-history', historyEmployee, fromDate, toDate, historySearch, historyPage, historyLimit],
    enabled: activeTab === 'history',
    queryFn: async () => (await api.get<HistoryData>('/employees/attendance/history', {
      params: {
        employeeId: historyEmployee === 'ALL' ? undefined : historyEmployee,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: historySearch.trim() || undefined,
        page: historyPage,
        limit: historyLimit,
      },
    })).data,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: AttendancePayload) => api.post('/employees/attendance', payload),
    onSuccess: () => {
      toast.success('Attendance saved');
      setSelectedEmployee(null);
      setAttendanceDraft(null);
      queryClient.invalidateQueries({ queryKey: ['employee-attendance-roster', date] });
      queryClient.invalidateQueries({ queryKey: ['employee-attendance-history'] });
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Unable to save attendance'),
  });

  const filteredRoster = useMemo(() => (rosterQuery.data || []).filter((row) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [row.employeeCode, row.name, row.role, row.phone || ''].some((value) => value.toLowerCase().includes(term));
    return matchesSearch && (statusFilter === 'ALL' || row.status === statusFilter);
  }), [rosterQuery.data, search, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredRoster.length / pageSize));
  const paginatedRoster = useMemo(() => {
    if (pageSize === 99999) return filteredRoster;
    const start = (page - 1) * pageSize;
    return filteredRoster.slice(start, start + pageSize);
  }, [filteredRoster, page, pageSize]);
  const isWorkingInProgress = Boolean(selectedEmployee && attendanceDraft && !attendanceDraft.checkOutTime && date === malaysiaDateString(clockNow));
  const durationEndTime = attendanceDraft?.checkOutTime || (isWorkingInProgress ? getCurrentTime(clockNow) : '');
  const startMinutes = attendanceDraft?.checkInTime ? getMinutesFromTime(attendanceDraft.checkInTime) : null;
  const endMinutes = durationEndTime ? getMinutesFromTime(durationEndTime) : null;
  const workedMinutes = isWorkingInProgress && startMinutes !== null && endMinutes !== null && endMinutes < startMinutes
    ? null
    : attendanceDraft?.checkInTime && durationEndTime
      ? getWorkedMinutes(attendanceDraft.checkInTime, durationEndTime)
      : null;
  const durationRange = workedMinutes === null ? '' : workedMinutes >= 480 ? ' (8+ hrs)' : workedMinutes >= 240 ? ' (4-8 hrs)' : ' (< 4 hrs)';

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!selectedEmployee || attendanceDraft?.checkOutTime) return;
    const timer = window.setInterval(() => setClockNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [selectedEmployee, attendanceDraft?.checkOutTime]);

  const counts = useMemo(() => {
    const rows = rosterQuery.data || [];
    return {
      present: rows.filter((row) => row.status === 'Present').length,
      halfDay: rows.filter((row) => row.status === 'Half Day').length,
      absent: rows.filter((row) => row.status === 'Absent').length,
      onLeave: rows.filter((row) => row.status === 'On Leave').length,
    };
  }, [rosterQuery.data]);
  const summary = activeTab === 'history' && historyQuery.data ? historyQuery.data.summary : counts;

  const openAttendanceModal = (row: RosterRow) => {
    setClockNow(new Date());
    setSelectedEmployee(row);
    const inTime = toInputTime(row.checkInTime) || (row.status === 'Not Marked' ? getCurrentTime() : '');
    const outTime = toInputTime(row.checkOutTime);
    let computedStatus: AttendanceStatus = row.status;
    if (inTime && outTime) {
      const worked = getWorkedMinutes(inTime, outTime);
      if (worked !== null) computedStatus = getDurationStatus(worked);
    } else if (!outTime) {
      computedStatus = (row.status === 'Absent' || row.status === 'On Leave') && !inTime ? row.status : 'Not Marked';
    }
    setAttendanceDraft({
      checkInTime: inTime,
      checkOutTime: outTime,
      status: computedStatus,
      remarks: row.remarks || '',
    });
  };

  const handleCheckInChange = (newInTime: string) => {
    setAttendanceDraft((draft) => {
      if (!draft) return draft;
      let nextStatus = draft.status;
      if (newInTime && draft.checkOutTime) {
        const worked = getWorkedMinutes(newInTime, draft.checkOutTime);
        if (worked !== null) nextStatus = getDurationStatus(worked);
      } else if (!draft.checkOutTime) {
        nextStatus = (draft.status === 'Absent' || draft.status === 'On Leave') && !newInTime
          ? draft.status
          : 'Not Marked';
      }
      return { ...draft, checkInTime: newInTime, status: nextStatus };
    });
  };

  const handleCheckOutChange = (newOutTime: string) => {
    setAttendanceDraft((draft) => {
      if (!draft) return draft;
      let nextStatus = draft.status;
      if (draft.checkInTime && newOutTime) {
        const worked = getWorkedMinutes(draft.checkInTime, newOutTime);
        if (worked !== null) nextStatus = getDurationStatus(worked);
      } else if (!newOutTime) {
        nextStatus = (draft.status === 'Absent' || draft.status === 'On Leave') && !draft.checkInTime
          ? draft.status
          : 'Not Marked';
      }
      return { ...draft, checkOutTime: newOutTime, status: nextStatus };
    });
  };

  const closeAttendanceModal = () => {
    if (!saveMutation.isPending) {
      setSelectedEmployee(null);
      setAttendanceDraft(null);
    }
  };

  const handleSaveAttendance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmployee || !attendanceDraft) return;

    let finalStatus = attendanceDraft.status;
    if (attendanceDraft.checkInTime && attendanceDraft.checkOutTime) {
      const worked = getWorkedMinutes(attendanceDraft.checkInTime, attendanceDraft.checkOutTime);
      if (worked !== null) finalStatus = getDurationStatus(worked);
    } else if (!attendanceDraft.checkOutTime) {
      if (finalStatus === 'Present' || finalStatus === 'Half Day') {
        finalStatus = 'Not Marked';
      }
    }

    saveMutation.mutate({
      employeeId: selectedEmployee.employeeId,
      date,
      ...(attendanceDraft.checkInTime ? { checkInTime: attendanceDraft.checkInTime } : {}),
      ...(attendanceDraft.checkOutTime ? { checkOutTime: attendanceDraft.checkOutTime } : {}),
      status: finalStatus,
      remarks: attendanceDraft.remarks.trim(),
    });
  };
  const updateHistoryFilter = (setter: (value: string) => void) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(event.target.value);
    setHistoryPage(1);
  };
  const clearDailyFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setPage(1);
  };
  const clearHistoryFilters = () => {
    setHistoryEmployee('ALL');
    setFromDate('');
    setToDate('');
    setHistorySearch('');
    setHistoryPage(1);
  };

  return (
    <main className="min-h-full bg-[#F7F7F7] p-3 md:p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#555]">People / Timekeeping</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-black">Employee Attendance</h1>
          <p className="mt-1 text-sm text-[#555]">Manage daily employee check-in and check-out records.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/master/employees" className="inline-flex h-10 items-center justify-center gap-2 rounded border border-[#3B82F6] bg-white px-4 text-sm font-bold text-[#3B82F6] shadow-sm transition-colors hover:bg-[#3B82F6] hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-200">
            <Users size={16} /> Employee Master
          </Link>
          <div className="inline-flex h-10 items-center gap-2 rounded-sm border border-[#E5E7EB] bg-white px-3 text-sm font-bold text-black shadow-sm">
            <CalendarDays size={16} className="text-[#3B82F6]" />
            {date === malaysiaDateString() ? "Today's roster" : formatDate(date)}
          </div>
        </div>
      </header>

      <section aria-label="Attendance summary" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={<CheckCircle2 size={19} />} label="Present" value={summary.present} tone="green" />
        <SummaryCard icon={<Clock3 size={19} />} label="Half Day" value={summary.halfDay} tone="amber" />
        <SummaryCard icon={<AlertCircle size={19} />} label="Absent" value={summary.absent} tone="red" />
        <SummaryCard icon={<CalendarDays size={19} />} label="On Leave" value={summary.onLeave} tone="blue" />
      </section>

      <nav aria-label="Attendance views" className="mb-4 flex border-b border-[#E5E7EB] bg-white">
        <button
          type="button"
          onClick={() => setActiveTab('daily')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${activeTab === 'daily' ? 'border-[#3B82F6] text-[#3B82F6]' : 'border-transparent text-[#555] hover:text-[#3B82F6]'}`}
        >
          <ClipboardCheck size={16} /> Daily Roster
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors ${activeTab === 'history' ? 'border-[#3B82F6] text-[#3B82F6]' : 'border-transparent text-[#555] hover:text-[#3B82F6]'}`}
        >
          <History size={16} /> Logs History
        </button>
      </nav>

      {activeTab === 'daily' ? (
        <section className="overflow-hidden rounded-sm border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#E5E7EB] bg-[#F9F9F9] p-3">
            <label className="flex items-center gap-2 text-xs font-bold text-black">
              Show
              <select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className={`${fieldClass} h-9 focus:bg-white`}>
                {pageSizes.map((size) => <option key={size} value={size}>{size === 99999 ? 'All' : size}</option>)}
              </select>
              entries
            </label>
            <span className="hidden h-7 w-px bg-[#E5E7EB] sm:block" />
            <label className="flex items-center gap-2 text-xs font-bold text-black">
              <CalendarDays size={15} className="text-[#555]" />
              <span className="sr-only">Attendance date</span>
              <input aria-label="Attendance date" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} className={`${fieldClass} h-9`} />
            </label>
            <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search size={15} className="absolute left-3 top-2.5 text-[#555]" />
              <input aria-label="Search daily roster" placeholder="Search employee, code, role…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className={`${fieldClass} h-9 w-full bg-white pl-9 focus:bg-white`} />
            </label>
            <select aria-label="Filter by attendance status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as AttendanceStatus | 'ALL'); setPage(1); }} className={`${fieldClass} h-9 focus:bg-white`}>
              <option value="ALL">All statuses</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            {(search || statusFilter !== 'ALL') && (
              <button type="button" onClick={clearDailyFilters} className="inline-flex h-10 min-w-[88px] shrink-0 items-center justify-center gap-2 rounded border border-[#3B82F6] bg-white px-4 text-[13px] font-bold text-[#3B82F6] shadow-sm transition-colors hover:bg-[#3B82F6] hover:text-white">
                <X size={14} /> Clear
              </button>
            )}
            <button type="button" onClick={() => void rosterQuery.refetch()} className="ml-auto inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded border border-[#3B82F6] bg-white px-4 text-[13px] font-bold text-[#3B82F6] shadow-sm transition-colors hover:bg-[#3B82F6] hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0" disabled={rosterQuery.isFetching}>
              <RefreshCw size={14} className={rosterQuery.isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {rosterQuery.isLoading ? (
            <div className="p-12 text-center text-sm text-[#555]">Loading employee roster…</div>
          ) : rosterQuery.isError ? (
            <div role="alert" className="p-10 text-center text-sm text-red-600">Could not load the daily roster. Refresh to try again.</div>
          ) : !rosterQuery.data?.length ? (
            <EmptyState icon={<Users size={30} />} title="No active employees to mark" detail="Add or activate employees in Employee master first." />
          ) : !filteredRoster.length ? (
            <EmptyState icon={<Search size={28} />} title="No matching employees" detail="Adjust your search or clear the selected filters." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-[13px] text-black">
                  <thead>
                    <tr className="bg-[#2A2A2A] font-bold text-white">
                      <th className="border-r border-[#444] px-3 py-2.5">Employee Code</th>
                      <th className="border-r border-[#444] px-3 py-2.5">Employee Name</th>
                      <th className="border-r border-[#444] px-3 py-2.5">Role</th>
                      <th className="border-r border-[#444] px-3 py-2.5">Check-in</th>
                      <th className="border-r border-[#444] px-3 py-2.5">Check-out</th>
                      <th className="border-r border-[#444] px-3 py-2.5">Attendance Status</th>
                      <th className="border-r border-[#444] px-3 py-2.5">Remarks</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRoster.map((row, index) => (
                      <tr key={row.employeeId} className={`border-b border-[#E5E7EB] transition-colors hover:bg-blue-50 ${index % 2 ? 'bg-[#F9F9F9]' : 'bg-white'}`}>
                        <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold">{row.employeeCode}</td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3">
                          <div className="font-bold text-black">{row.name}</div>
                          {row.phone && <div className="mt-0.5 text-xs font-semibold text-[#555]">{row.phone}</div>}
                        </td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold">{row.role}</td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3"><TimeValue value={row.checkInTime} tone="in" /></td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3"><TimeValue value={row.checkOutTime} tone="out" /></td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3"><StatusBadge status={row.status} /></td>
                        <td className="max-w-56 truncate border-r border-[#E5E7EB] px-3 py-3 text-xs font-medium text-[#40516B]" title={row.remarks || undefined}>{row.remarks || '—'}</td>
                        <td className="px-3 py-3 text-right">
                          <button type="button" onClick={() => openAttendanceModal(row)} className="inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded border border-[#3B82F6] bg-white px-3 py-2 text-xs font-bold text-[#3B82F6] transition-colors hover:bg-[#3B82F6] hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-200">
                            <Clock3 size={14} /> Update / Mark
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                totalPages={totalPages}
                from={(page - 1) * pageSize + 1}
                to={pageSize === 99999 ? filteredRoster.length : Math.min(page * pageSize, filteredRoster.length)}
                total={filteredRoster.length}
                onPageChange={setPage}
                noun="employees"
              />
            </>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-sm border border-[#E5E7EB] bg-white shadow-sm">
          <div className="border-b border-[#E5E7EB] bg-[#F9F9F9] p-3">
            <div className="mb-4">
              <h2 className="font-bold text-black">Attendance Logs History</h2>
              <p className="mt-1 text-xs text-[#555]">Review saved employee attendance by employee and date range.</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-bold text-black">Show
                <select value={historyLimit} onChange={(event) => { setHistoryLimit(Number(event.target.value)); setHistoryPage(1); }} className={`${fieldClass} mt-1 block h-9 focus:bg-white`}>
                  {pageSizes.map((size) => <option key={size} value={size}>{size === 99999 ? 'All' : size}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-black">Employee
                <select value={historyEmployee} onChange={updateHistoryFilter(setHistoryEmployee)} className={`${fieldClass} mt-1 block min-w-48 h-9 focus:bg-white`}>
                  <option value="ALL">All employees</option>
                  {(employeesQuery.data || []).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.employeeCode})</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-black">From date
                <input type="date" value={fromDate} onChange={updateHistoryFilter(setFromDate)} className={`${fieldClass} mt-1 block h-9`} />
              </label>
              <label className="text-xs font-bold text-black">To date
                <input type="date" value={toDate} onChange={updateHistoryFilter(setToDate)} className={`${fieldClass} mt-1 block h-9`} />
              </label>
              <label className="relative text-xs font-bold text-black">Employee search
                <Search size={14} className="absolute left-3 top-[34px] text-[#555]" />
                <input aria-label="Search attendance history" placeholder="Code or name" value={historySearch} onChange={updateHistoryFilter(setHistorySearch)} className={`${fieldClass} mt-1 block h-9 min-w-48 bg-white pl-9 focus:bg-white`} />
              </label>
              {(historyEmployee !== 'ALL' || fromDate || toDate || historySearch) && (
                <button type="button" onClick={clearHistoryFilters} className="inline-flex h-10 min-w-[88px] shrink-0 items-center justify-center gap-2 rounded border border-[#3B82F6] bg-white px-4 text-[13px] font-bold text-[#3B82F6] shadow-sm transition-colors hover:bg-[#3B82F6] hover:text-white"><X size={14} /> Clear</button>
              )}
              <button type="button" onClick={() => void historyQuery.refetch()} disabled={historyQuery.isFetching} className="ml-auto inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded border border-[#3B82F6] bg-white px-4 text-[13px] font-bold text-[#3B82F6] shadow-sm transition-colors hover:bg-[#3B82F6] hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-0">
                <RefreshCw size={14} className={historyQuery.isFetching ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {historyQuery.isLoading ? (
            <div className="p-10 text-center text-sm text-[#555]">Loading attendance history…</div>
          ) : historyQuery.isError ? (
            <div role="alert" className="p-10 text-center text-sm text-red-600">Could not load attendance history.</div>
          ) : !historyQuery.data?.records.length ? (
            <EmptyState icon={<History size={30} />} title="No attendance logs found" detail="Try adjusting the date range or employee filter." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-[13px] text-black">
                  <thead>
                    <tr className="bg-[#2A2A2A] font-bold text-white">
                      {['Date', 'Employee Code', 'Employee Name', 'Role', 'Check-in', 'Check-out', 'Status', 'Remarks'].map((column) => <th key={column} className="border-r border-[#444] px-3 py-2.5 last:border-r-0">{column}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {historyQuery.data.records.map((record, index) => (
                      <tr key={record.id} className={`border-b border-[#E5E7EB] transition-colors hover:bg-blue-50 ${index % 2 ? 'bg-[#F9F9F9]' : 'bg-white'}`}>
                        <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold">{formatDate(record.date)}</td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold">{record.employee.employeeCode}</td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold">{record.employee.name}</td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold">{record.employee.role}</td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3"><TimeValue value={record.checkInTime} tone="in" /></td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3"><TimeValue value={record.checkOutTime} tone="out" /></td>
                        <td className="border-r border-[#E5E7EB] px-3 py-3"><StatusBadge status={record.status} /></td>
                        <td className="max-w-56 truncate px-3 py-3 font-bold" title={record.remarks || undefined}>{record.remarks || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={historyQuery.data.page}
                totalPages={historyQuery.data.totalPages}
                from={(historyQuery.data.page - 1) * historyLimit + 1}
                to={Math.min(historyQuery.data.page * historyLimit, historyQuery.data.total)}
                total={historyQuery.data.total}
                onPageChange={setHistoryPage}
                noun="records"
              />
            </>
          )}
        </section>
      )}

      {selectedEmployee && attendanceDraft && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#172B3D]/55 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeAttendanceModal(); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="attendance-modal-title" className="my-auto w-full max-w-[430px] overflow-hidden rounded-xl border border-[#D8DEE8] bg-white shadow-xl">
            <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-[#3867E8] to-[#4969E8] px-5 py-3.5 text-white">
              <div>
                <h2 id="attendance-modal-title" className="text-sm font-bold">Employee Attendance: {selectedEmployee.name}</h2>
                <p className="mt-0.5 text-xs font-medium text-blue-100">{selectedEmployee.employeeCode} · {selectedEmployee.role}</p>
              </div>
              <button type="button" aria-label="Close dialog" onClick={closeAttendanceModal} className="rounded-full bg-white/20 p-1.5 text-white transition-colors hover:bg-white/35 disabled:opacity-50" disabled={saveMutation.isPending}><X size={17} /></button>
            </header>
            <form onSubmit={handleSaveAttendance}>
              <div className="space-y-3.5 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TimeInput
                    label="Check-in time"
                    value={attendanceDraft.checkInTime}
                    onChange={handleCheckInChange}
                    onNow={() => handleCheckInChange(getCurrentTime())}
                  />
                  <TimeInput
                    label="Check-out time"
                    value={attendanceDraft.checkOutTime}
                    onChange={handleCheckOutChange}
                    onNow={() => handleCheckOutChange(getCurrentTime())}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E1E7F0] bg-[#F7F9FC] px-3 py-2.5 text-xs">
                  <p className="font-semibold text-[#8792A5]">
                    Total Working Duration: <span className="font-bold text-[#273449]">{workedMinutes === null ? '—' : `${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`}</span>
                  </p>
                  <span className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                    !attendanceDraft.checkOutTime
                      ? 'border border-amber-200 bg-amber-50 text-amber-700'
                      : statusClass(attendanceDraft.status)
                  }`}>
                    {!attendanceDraft.checkOutTime
                      ? 'Check-out time required to update status'
                      : `Auto: ${attendanceDraft.status}${durationRange}`}
                  </span>
                </div>
                <label className="block text-sm font-bold text-black">
                  Attendance Status
                  <select
                    value={attendanceDraft.status}
                    disabled={Boolean(attendanceDraft.checkInTime && !attendanceDraft.checkOutTime) || Boolean(attendanceDraft.checkInTime && attendanceDraft.checkOutTime)}
                    onChange={(event) => {
                      const newStatus = event.target.value as AttendanceStatus;
                      if (!attendanceDraft.checkOutTime && (newStatus === 'Present' || newStatus === 'Half Day')) {
                        toast.error('Check-out time is required to update attendance status to Present or Half Day');
                        return;
                      }
                      setAttendanceDraft((draft) => draft ? { ...draft, status: newStatus } : draft);
                    }}
                    className={`mt-1 block w-full appearance-none rounded-xl border border-gray-200 px-4 py-2 text-sm font-normal text-black transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      attendanceDraft.checkInTime
                        ? 'cursor-not-allowed bg-gray-100 text-gray-500'
                        : 'bg-gray-50'
                    }`}
                  >
                    {statuses.map((status) => (
                      <option
                        key={status}
                        value={status}
                        disabled={!attendanceDraft.checkOutTime && (status === 'Present' || status === 'Half Day')}
                      >
                        {status} {!attendanceDraft.checkOutTime && (status === 'Present' || status === 'Half Day') ? '(Requires Check-out)' : ''}
                      </option>
                    ))}
                  </select>
                  {attendanceDraft.checkInTime && !attendanceDraft.checkOutTime && (
                    <p className="mt-1 text-xs font-semibold text-amber-600">
                      Check-out time is not entered. Status will not be updated until check-out time is provided.
                    </p>
                  )}
                  {attendanceDraft.checkInTime && attendanceDraft.checkOutTime && (
                    <p className="mt-1 text-xs font-semibold text-green-600">
                      Attendance status is automatically updated based on working hours.
                    </p>
                  )}
                  {!attendanceDraft.checkInTime && !attendanceDraft.checkOutTime && (
                    <p className="mt-1 text-xs text-[#73879C]">
                      Select Absent or On Leave for employees not on duty.
                    </p>
                  )}
                </label>
                <label className="block text-sm font-bold text-black">
                  Remarks / Duty Note <span className="font-normal text-[#73879C]">(Optional)</span>
                  <textarea maxLength={500} rows={2} value={attendanceDraft.remarks} onChange={(event) => setAttendanceDraft((draft) => draft ? { ...draft, remarks: event.target.value } : draft)} placeholder="e.g. Left early for medical reason, overtime duty..." className="mt-1 block w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-normal text-black transition-colors placeholder:font-normal placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
              </div>
              <footer className="flex justify-end gap-2 border-t border-[#E5EAF1] bg-white px-5 py-3.5">
                <button type="button" onClick={closeAttendanceModal} disabled={saveMutation.isPending} className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs font-bold text-[#52627A] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={saveMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-[#4B6CF6] px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-200 transition-colors hover:bg-[#3F5FE3] focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60">
                  {saveMutation.isPending ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save Attendance</>}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: 'green' | 'amber' | 'red' | 'blue' }) {
  const colors = {
    green: 'bg-[#16A34A]',
    amber: 'bg-[#F59E0B]',
    red: 'bg-[#EF4444]',
    blue: 'bg-[#3B82F6]',
  }[tone];
  return (
    <div className="group flex h-full min-h-[82px] items-center gap-3 rounded-xl border border-[#E6E9ED] bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-inner sm:h-11 sm:w-11 ${colors}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-none text-black sm:text-2xl">{value}</div>
        <div className="mt-1.5 whitespace-nowrap text-[11px] font-bold uppercase leading-tight tracking-wide text-black sm:text-xs">{label}</div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center border border-[#E5E7EB] bg-[#F9F9F9] text-[#555]">{icon}</span>
      <h3 className="mt-3 font-bold text-black">{title}</h3>
      <p className="mt-1 text-sm text-[#555]">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(status)}`}>{status}</span>;
}

function TimeValue({ value, tone }: { value: string | null; tone: 'in' | 'out' }) {
  if (!value || value === '--:--') return <span className="inline-flex rounded-full border border-[#D1D5DB] bg-[#F3F4F6] px-2.5 py-1 font-mono text-xs font-semibold text-[#555]">--:--</span>;
  const timeStyle = tone === 'in'
    ? 'border-green-200 bg-green-50 text-green-700'
    : 'border-blue-200 bg-blue-50 text-blue-700';
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-bold ${timeStyle}`}><Clock3 size={13} />{formatTime12Hour(value)}</span>;
}

function TimeInput({ label, value, onChange, onNow }: { label: string; value: string; onChange: (value: string) => void; onNow: () => void }) {
  const initialParts = timeInputParts(value);
  const [displayTime, setDisplayTime] = useState(initialParts.display);
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(initialParts.meridiem);

  useEffect(() => {
    const parts = timeInputParts(value);
    setDisplayTime(parts.display);
    setMeridiem(parts.meridiem);
  }, [value]);

  const changeTime = (nextTime: string) => {
    setDisplayTime(nextTime);
    const normalized = to24HourTime(nextTime, meridiem);
    if (normalized) onChange(normalized);
    else if (!nextTime) onChange('');
  };
  const changeMeridiem = (nextMeridiem: 'AM' | 'PM') => {
    setMeridiem(nextMeridiem);
    const normalized = to24HourTime(displayTime, nextMeridiem);
    if (normalized) onChange(normalized);
  };

  return (
    <label className="block min-w-0 text-xs font-bold text-[#2A3F54]">
      {label}
      <div className="mt-1 flex h-[38px] min-w-0 items-center overflow-hidden rounded-sm border border-[#CCC] bg-white transition focus-within:border-[#3B82F6]">
        <input aria-label={`${label} (12-hour)`} type="text" inputMode="numeric" placeholder="hh:mm" value={displayTime} onChange={(event) => changeTime(event.target.value)} onBlur={() => {
          if (displayTime && !to24HourTime(displayTime, meridiem)) {
            const parts = timeInputParts(value);
            setDisplayTime(parts.display);
            setMeridiem(parts.meridiem);
          }
        }} className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-[13px] font-normal text-black outline-none focus:bg-transparent" />
        <select aria-label={`${label} AM or PM`} value={meridiem} onChange={(event) => changeMeridiem(event.target.value as 'AM' | 'PM')} className="h-full w-[54px] appearance-none border-0 bg-transparent px-1 text-[13px] font-normal text-black outline-none focus:bg-transparent">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        <Clock3 size={13} className="mr-2 shrink-0 text-[#111827]" />
        <button type="button" onClick={onNow} className="mr-1.5 shrink-0 rounded-md bg-[#EEF2FF] px-2 py-1 text-[10px] font-bold text-[#3B5BDB] transition-colors hover:bg-[#DDE5FF]">Now</button>
      </div>
    </label>
  );
}

function Pagination({ page, totalPages, from, to, total, onPageChange, noun }: { page: number; totalPages: number; from: number; to: number; total: number; onPageChange: (page: number) => void; noun: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] px-4 py-3 text-xs text-[#555]">
      <span>Showing {total ? from : 0}–{to} of {total} {noun}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="rounded border border-[#3B82F6] bg-[#3B82F6] px-3 py-1.5 font-bold text-white transition-colors hover:border-[#2563EB] hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:border-[#D1D5DB] disabled:bg-[#E5E7EB] disabled:text-[#6B7280]">Previous</button>
        <span className="min-w-16 text-center font-semibold text-black">Page {page} / {totalPages}</span>
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded border border-[#3B82F6] bg-[#3B82F6] px-3 py-1.5 font-bold text-white transition-colors hover:border-[#2563EB] hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:border-[#D1D5DB] disabled:bg-[#E5E7EB] disabled:text-[#6B7280]">Next</button>
      </div>
    </div>
  );
}
