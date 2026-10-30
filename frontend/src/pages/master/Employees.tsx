import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock3, Edit, Search, Trash2, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import DeleteConfirmationModal from '../../components/DeleteConfirmationModal';

type Employee = {
  id: number;
  employeeCode: string;
  name: string;
  role: string;
  phone: string | null;
  status: 'Active' | 'Inactive';
};

type EmployeeForm = Omit<Employee, 'id' | 'phone'> & { phone: string };
const blankForm: EmployeeForm = { employeeCode: '', name: '', role: '', phone: '', status: 'Active' };
const inputClass = 'w-full rounded-sm border border-[#ccc] px-3 py-2 text-[13px] focus:border-[#3B82F6] focus:outline-none';

export default function Employees() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EmployeeForm>(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Employee | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const employeesQuery = useQuery({
    queryKey: ['employees', search, statusFilter],
    queryFn: async () => (await api.get<Employee[]>('/employees', {
      params: { search: search || undefined, status: statusFilter },
    })).data,
  });
  const nextCodeQuery = useQuery({
    queryKey: ['employee-next-code'],
    queryFn: async () => {
      const res = await api.get<{ nextCode?: string; code?: string }>('/employees/next-code');
      return res.data.nextCode || res.data.code || '';
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (employee: EmployeeForm) => editingId
      ? api.patch(`/employees/${editingId}`, employee)
      : api.post('/employees', employee),
    onSuccess: () => {
      toast.success(editingId ? 'Employee updated' : 'Employee added');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee-next-code'] });
      setEditingId(null);
      setForm(blankForm);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Unable to save employee'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      toast.success('Employee deleted');
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee-next-code'] });
      setItemToDelete(null);
      if (itemToDelete && editingId === itemToDelete.id) {
        setEditingId(null);
        setForm(blankForm);
      }
    },
    onError: (error: any) => toast.error(error.response?.data?.message || 'Unable to delete employee'),
  });

  useEffect(() => {
    if (!editingId && !form.employeeCode && nextCodeQuery.data) {
      setForm((current) => ({ ...current, employeeCode: nextCodeQuery.data }));
    }
  }, [editingId, form.employeeCode, nextCodeQuery.data]);

  const startNew = async () => {
    setEditingId(null);
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['employee-next-code'],
        queryFn: async () => {
          const res = await api.get<{ nextCode?: string; code?: string }>('/employees/next-code');
          return res.data.nextCode || res.data.code || '';
        },
      });
      setForm({ ...blankForm, employeeCode: result || '' });
    } catch {
      setForm(blankForm);
    }
  };

  const editEmployee = (employee: Employee) => {
    setEditingId(employee.id);
    setForm({
      employeeCode: employee.employeeCode,
      name: employee.name,
      role: employee.role,
      phone: employee.phone ?? '',
      status: employee.status,
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveMutation.mutate({
      ...form,
      employeeCode: form.employeeCode.trim(),
      name: form.name.trim(),
      role: form.role.trim(),
      phone: form.phone.trim(),
    });
  };

  return (
    <main className="min-h-[calc(100vh-100px)] bg-[#F7F7F7] p-3 md:p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#73879C]">People / Master</p>
          <h1 className="mt-1 text-xl font-bold text-[#2A3F54]">Employee</h1>
          <p className="mt-1 text-sm text-[#73879C]">Maintain employee codes, contact details, roles and work status.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/employees/attendance" className="inline-flex items-center gap-2 rounded bg-[#3B82F6] px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-300">
            <Clock3 size={16} /> Employee Attendance
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="h-fit rounded-sm border border-[#E6E9ED] bg-white shadow-sm xl:col-span-1">
          <div className="flex items-center gap-2 rounded-t-sm bg-[#3B82F6] px-4 py-3 text-white">
            <UserRound size={18} />
            <h2 className="text-[14px] font-bold">{editingId ? 'EDIT EMPLOYEE' : 'EMPLOYEE MASTER FORM'}</h2>
          </div>
          <form onSubmit={submit} className="space-y-3 p-4">
            <Field label="Employee code *">
              <input required maxLength={40} className={inputClass} value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
            </Field>
            <Field label="Name *">
              <input required maxLength={120} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Role *">
              <input required maxLength={100} className={inputClass} placeholder="Enter employee role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </Field>
            <Field label="Phone number">
              <input type="tel" maxLength={40} className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EmployeeForm['status'] })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </Field>
            <div className="flex gap-2 pt-1">
              <button disabled={saveMutation.isPending} className="flex items-center justify-center gap-2 rounded bg-[#16A34A] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#15803D] disabled:opacity-50">
                <CheckCircle size={16} />
                {saveMutation.isPending ? 'Saving…' : editingId ? 'UPDATE EMPLOYEE' : 'SAVE EMPLOYEE'}
              </button>
              {editingId && <button type="button" onClick={startNew} className="inline-flex items-center gap-1 border border-[#E6E9ED] px-3 py-2 text-sm font-semibold text-[#2A3F54] hover:bg-gray-50"><X size={14} /> Cancel</button>}
            </div>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-sm border border-[#E6E9ED] bg-white shadow-sm xl:col-span-2">
          <div className="flex flex-col items-stretch justify-between gap-3 border-b border-[#E6E9ED] bg-[#f9f9f9] px-4 py-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="font-bold text-black">EMPLOYEE LIST</h2>
              <p className="mt-1 text-xs text-[#73879C]">{employeesQuery.data?.length ?? 0} Employees</p>
            </div>
            <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:max-w-[440px]">
              <label className="relative min-w-0">
                <Search size={15} className="absolute left-3 top-2.5 text-[#73879C]" />
                <input aria-label="Search employees" placeholder="Search code, name, role…" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputClass} min-w-0 bg-white pl-9 focus:bg-white ${search ? 'pr-9' : ''}`} />
                {search && (
                  <button type="button" aria-label="Clear employee search" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#73879C] transition-colors hover:bg-blue-50 hover:text-[#3B82F6]">
                    <X size={14} />
                  </button>
                )}
              </label>
              <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputClass} w-[138px]`}>
                <option value="ALL">All statuses</option>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>

          {employeesQuery.isLoading ? <div className="p-8 text-center text-sm text-[#73879C]">Loading employees…</div> : employeesQuery.isError ? (
            <div role="alert" className="p-8 text-center text-sm text-red-600">Could not load employees. Refresh to try again.</div>
          ) : !employeesQuery.data?.length ? (
            <div className="p-10 text-center">
              <UserRound size={28} className="mx-auto text-[#9CA3AF]" />
              <p className="mt-2 font-semibold text-[#2A3F54]">No employees found</p>
              <p className="mt-1 text-sm text-[#73879C]">Add an employee or change your search and status filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[690px] whitespace-nowrap text-left text-[13px]">
                <thead><tr className="bg-[#2A2A2A] font-bold text-white">
                  {['#', 'Employee Code', 'Name', 'Role', 'Mobile', 'Status', 'Actions'].map((column) => <th key={column} className="border-r border-[#444] px-3 py-2.5 last:border-r-0">{column}</th>)}
                </tr></thead>
                <tbody>
                  {employeesQuery.data.map((employee, index) => (
                    <tr key={employee.id} className={`border-b border-[#E5E7EB] ${index % 2 === 0 ? 'bg-white' : 'bg-[#F9F9F9]'} hover:bg-blue-50`}>
                      <td className="border-r border-[#E5E7EB] px-3 py-3 text-center font-bold text-black">{index + 1}</td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold text-[#3B82F6]">{employee.employeeCode}</td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold text-black">{employee.name}</td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold text-black">{employee.role}</td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold text-black">{employee.phone || '-'}</td>
                      <td className="border-r border-[#E5E7EB] px-3 py-3 font-bold text-black">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${employee.status === 'Active' ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>
                          {employee.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button type="button" aria-label={`Edit ${employee.name}`} onClick={() => editEmployee(employee)} className="rounded border border-[#3B82F6] p-1 text-[#3B82F6] transition-colors hover:bg-[#3B82F6] hover:text-white" title="Edit Employee">
                            <Edit size={12} />
                          </button>
                          <button type="button" aria-label={`Delete ${employee.name}`} onClick={() => setItemToDelete(employee)} className="rounded border border-[#EF4444] p-1 text-[#EF4444] transition-colors hover:bg-[#EF4444] hover:text-white" title="Delete Employee">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <DeleteConfirmationModal
        isOpen={!!itemToDelete}
        itemName={itemToDelete ? `${itemToDelete.name} (${itemToDelete.employeeCode})` : undefined}
        isDeleting={deleteMutation.isPending}
        onConfirm={() => {
          if (itemToDelete) {
            deleteMutation.mutate(itemToDelete.id);
          }
        }}
        onCancel={() => setItemToDelete(null)}
      />
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-bold text-[#2A3F54]">{label}<span className="mt-1 block">{children}</span></label>;
}
