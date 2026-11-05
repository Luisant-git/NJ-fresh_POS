import { getMalaysiaDateStr, formatMalaysiaDate } from '../../utils/date';
import { useState } from 'react';
import { X, Briefcase, PlusSquare, Download, Filter, RefreshCw, Edit, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { exportTableToPdf, type PdfColumn } from '../../utils/exportPdf';
import { exportToExcel } from '../../utils/exportExcel';
import { useSettings } from '../../contexts/SettingsContext';
import SearchableSelect from '../../components/SearchableSelect';
import TableLoader from '../../components/TableLoader';

const ExpenseEntry = () => {
  const { formatCurrency, settings } = useSettings();
  const queryClient = useQueryClient();

  // New Expense Form State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expenseDate, setExpenseDate] = useState(getMalaysiaDateStr());
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentModeId, setPaymentModeId] = useState('');
  const [notes, setNotes] = useState('');
  
  // Date-wise Filter & Search State for History
  const [filterStartDate, setFilterStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return getMalaysiaDateStr(d);
  });
  const [filterEndDate, setFilterEndDate] = useState(() => getMalaysiaDateStr());
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch Master Data
  const { data: categories = [] } = useQuery({
    queryKey: ['expenseCategories'],
    queryFn: async () => (await api.get('/expense-categories')).data
  });

  const { data: paymentModes = [] } = useQuery({
    queryKey: ['paymentModes'],
    queryFn: async () => (await api.get('/payment-modes')).data
  });

  // Fetch Expenses List with date filter
  const { data: expenses = [], isLoading: historyLoading, refetch } = useQuery({
    queryKey: ['expenses', filterStartDate, filterEndDate, filterCategoryId, searchQuery],
    queryFn: async () => {
      const res = await api.get('/expenses', {
        params: {
          startDate: filterStartDate || undefined,
          endDate: filterEndDate || undefined,
          categoryId: filterCategoryId || undefined,
          search: searchQuery || undefined,
        }
      });
      return res.data;
    }
  });

  const totalExpenseAmount = expenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/expenses', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense saved successfully!');
      resetForm();
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(`Failed to save expense: ${err.message}`);
    }
  });


  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put(`/expenses/${editingId}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense updated successfully!');
      resetForm();
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(`Failed to update expense: ${err.message}`);
    }
  });

  const resetForm = () => {
    setEditingId(null);
    setAmount('');
    setNotes('');
    setCategoryId('');
    setPaymentModeId('');
    setExpenseDate(getMalaysiaDateStr());
  };

  const handleEdit = (exp: any) => {
    setEditingId(exp.id);
    setExpenseDate(exp.date ? getMalaysiaDateStr(exp.date) : getMalaysiaDateStr());
    setCategoryId(exp.expenseCategoryId?.toString() || '');
    setAmount(exp.amount?.toString() || '');
    setPaymentModeId(exp.paymentModeId?.toString() || '');
    setNotes(exp.notes || '');
  };

  const handleSave = () => {
    if (!categoryId || !amount || !paymentModeId) {
      toast.error('Please fill out all required fields');
      return;
    }
    const payload = {
      date: expenseDate,
      expenseCategoryId: Number(categoryId),
      amount: Number(amount),
      paymentModeId: Number(paymentModeId),
      notes
    };
    if (editingId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  const setQuickDate = (type: 'today' | 'thisMonth' | 'all') => {
    const now = new Date();
    if (type === 'today') {
      const todayStr = getMalaysiaDateStr(now);
      setFilterStartDate(todayStr);
      setFilterEndDate(todayStr);
    } else if (type === 'thisMonth') {
      const firstDay = (getMalaysiaDateStr().substring(0, 8) + "01");
      const todayStr = getMalaysiaDateStr(now);
      setFilterStartDate(firstDay);
      setFilterEndDate(todayStr);
    } else if (type === 'all') {
      setFilterStartDate('');
      setFilterEndDate('');
    }
  };

  const handlePdfExport = () => {
    const cols: PdfColumn[] = [
      { header: 'S.No', dataKey: '_sno' },
      { header: 'Date', dataKey: '_date' },
      { header: 'Category', dataKey: '_category' },
      { header: 'Payment Mode', dataKey: '_mode' },
      { header: 'Description', dataKey: '_notes' },
      { header: 'Amount', dataKey: '_amount' },
    ];
    const rows = expenses.map((e: any, i: number) => ({
      _sno: i + 1,
      _date: formatMalaysiaDate(e.date),
      _category: e.category?.name || '-',
      _mode: e.paymentMode?.name || '-',
      _notes: e.notes || '-',
      _amount: Number(e.amount),
    }));
    exportTableToPdf(cols, rows, 'Daily_Expenses_Report', 'Daily Expenses Report');
  };

  const handleExcelExport = () => {
    const exportData = expenses.map((e: any, index: number) => ({
      'S.No': index + 1,
      'Date': formatMalaysiaDate(e.date),
      'Category': e.category?.name || '-',
      'Payment Mode': e.paymentMode?.name || '-',
      'Description': e.notes || '-',
      'Amount': Number(e.amount),
    }));
    exportToExcel(exportData, 'Daily_Expenses_Report');
  };

  return (
    <div className="flex flex-col h-full bg-[#F3F4F6]">
      
      {/* Header */}
      <div className="bg-[#0f172a] text-white px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-md gap-3">
        <div className="flex items-center gap-2">
          <Briefcase size={20} className="text-blue-400" />
          <h2 className="text-base font-bold tracking-wide uppercase">DAILY EXPENSES MANAGEMENT</h2>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button 
            type="button" 
            onClick={handleExcelExport}
            className="bg-[#10B981] hover:bg-[#059669] text-white text-[12px] font-bold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download size={14} /> <span className="hidden lg:inline">Export Excel</span>
          </button>
          <button 
            type="button" 
            onClick={handlePdfExport}
            className="bg-[#EF4444] hover:bg-[#DC2626] text-white text-[12px] font-bold px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download size={14} /> <span className="hidden lg:inline">Export PDF</span>
          </button>
          <Link to="/dashboard" className="bg-red-500 hover:bg-red-600 text-white py-1.5 px-3 rounded text-[12px] font-bold flex items-center gap-1.5 shadow-sm">
            <X size={14} /> Close (Esc)
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 overflow-auto overflow-x-auto">
        <div className="flex flex-col lg:flex-row gap-6 h-full">
          
          {/* Left Panel - Log New Expense */}
          <div className="w-full lg:w-1/3 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col self-start">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h3 className="font-bold text-[#0f172a] text-sm flex items-center gap-2 uppercase">
                {editingId ? 'EDIT EXPENSE' : 'LOG NEW EXPENSE'}
              </h3>
            </div>
            
            <div className="p-4 flex-1 flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Expense Date</label>
                <input 
                  type="date" 
                  value={expenseDate} 
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white" 
                />
              </div>
              
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Expense Category *</label>
                <SearchableSelect
                  options={categories.map((c: any) => ({ value: c.id, label: c.name }))}
                  value={categoryId}
                  onChange={(val) => setCategoryId(val || '')}
                  placeholder="Search Category..."
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Amount *</label>
                <input 
                  type="number" step="any" 
                  value={amount}
                  placeholder="0.00"
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Payment Mode *</label>
                <SearchableSelect
                  options={paymentModes.map((m: any) => ({ value: m.id, label: m.name }))}
                  value={paymentModeId}
                  onChange={(val) => setPaymentModeId(val || '')}
                  placeholder="Search Payment Mode..."
                />
              </div>

              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Description / Notes</label>
                <textarea 
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details..."
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none" 
                ></textarea>
              </div>

              <div className="pt-2 flex gap-2">
                <button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="flex-1 bg-[#0f172a] hover:bg-gray-800 text-white font-bold py-2.5 px-4 rounded shadow-md flex justify-center items-center gap-2 transition-colors disabled:opacity-50">
                  <PlusSquare size={18} /> {editingId ? (updateMutation.isPending ? 'Updating...' : 'Update Expense') : (createMutation.isPending ? 'Saving...' : 'Save Expense')}
                </button>
                {editingId && (
                  <button onClick={resetForm} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 px-4 rounded shadow-md flex justify-center items-center gap-2 transition-colors">
                    <XCircle size={18} /> Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Expense Log History with Date Wise Filter */}
          <div className="w-full lg:w-2/3 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h3 className="font-bold text-[#0f172a] text-sm uppercase">
                EXPENSE LOG HISTORY & DATE WISE FILTER
              </h3>
              <span className="text-xs font-bold text-black font-bold">{expenses.length} Records</span>
            </div>

            {/* Date Wise Filter Controls Bar */}
            <div className="p-4 border-b border-gray-200 bg-[#F8FAFC]">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end mb-2">
                <div>
                  <label className="block text-[11px] font-bold text-black font-bold mb-1">From Date</label>
                  <input 
                    type="date" 
                    value={filterStartDate} 
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-black font-bold mb-1">To Date</label>
                  <input 
                    type="date" 
                    value={filterEndDate} 
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white" 
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-black font-bold mb-1">Category</label>
                  <SearchableSelect
                    options={[{ value: '', label: 'All Categories' }, ...categories.map((c: any) => ({ value: c.id, label: c.name }))]}
                    value={filterCategoryId}
                    onChange={(val) => setFilterCategoryId(val || '')}
                    placeholder="All Categories"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-black font-bold mb-1">Search Description</label>
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes..."
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white" 
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between pt-2 gap-2">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => refetch()} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded flex items-center gap-1 transition-colors">
                    <Filter size={12} /> Apply Filter
                  </button>
                  <button type="button" onClick={() => setQuickDate('today')} className="bg-gray-200 hover:bg-gray-300 text-black font-bold text-xs font-bold px-2.5 py-1 rounded transition-colors">
                    Today
                  </button>
                  <button type="button" onClick={() => setQuickDate('thisMonth')} className="bg-gray-200 hover:bg-gray-300 text-black font-bold text-xs font-bold px-2.5 py-1 rounded transition-colors">
                    This Month
                  </button>
                  <button type="button" onClick={() => { setFilterStartDate(''); setFilterEndDate(''); setFilterCategoryId(''); setSearchQuery(''); }} className="text-black font-bold hover:text-black hover:font-bold text-xs font-bold px-2 py-1 flex items-center gap-1">
                    <RefreshCw size={11} /> Reset
                  </button>
                </div>
              </div>
            </div>

            {/* PDF Printable & Export Container */}
            <div id="daily-expenses-export" className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
              
              {/* Hidden PDF Printable Header */}
              <div className="pdf-header hidden mb-4 border-b border-black pb-3">
                <div className="text-center">
                  <h1 className="text-xl font-bold uppercase">{settings?.shopName || 'MY SHOP'}</h1>
                  <h2 className="text-sm font-bold uppercase">DAILY EXPENSES REPORT</h2>
                  <p className="text-xs text-black font-bold">Date Range: {filterStartDate || 'All Time'} to {filterEndDate || 'All Time'}</p>
                </div>
              </div>

              <div className="flex-1 overflow-auto overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm text-left whitespace-nowrap min-w-[600px]">
                  <thead className="text-xs text-white uppercase bg-[#0f172a]">
                    <tr>
                      <th className="px-4 py-3 font-bold text-center w-28 border-r border-gray-600">Date</th>
                      <th className="px-4 py-3 font-bold border-r border-gray-600 text-left">Category</th>
                      <th className="px-4 py-3 font-bold border-r border-gray-600 text-center w-36">Mode</th>
                      <th className="px-4 py-3 font-bold border-r border-gray-600 text-left">Notes / Remarks</th>
                      <th className="px-4 py-3 font-bold text-right w-36 border-r border-gray-600">Amount (RM)</th>
                      <th className="px-4 py-3 font-bold text-center w-20 print:hidden">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLoading ? (
                      <TableLoader columns={5} />
                    ) : expenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-black font-bold">No expenses found for selected criteria.</td>
                      </tr>
                    ) : (
                      expenses.map((exp: any, idx: number) => (
                        <tr key={exp.id} className={`border-b border-gray-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                          <td className="px-4 py-2.5 text-center text-black font-bold">{formatMalaysiaDate(exp.date)}</td>
                          <td className="px-4 py-2.5 font-bold text-[#16A34A]">{exp.category?.name || '-'}</td>
                          <td className="px-4 py-2.5 text-center text-black font-bold">{exp.paymentMode?.name || '-'}</td>
                          <td className="px-4 py-2.5 text-black font-bold text-xs">{exp.notes || '-'}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-red-600 border-r border-gray-200">{formatCurrency(exp.amount)}</td>
                          <td className="px-4 py-2.5 text-center print:hidden">
                            <button 
                              onClick={() => handleEdit(exp)}
                              className="text-blue-600 hover:bg-blue-100 p-1.5 rounded transition-colors"
                              title="Edit Expense"
                            >
                              <Edit size={16} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total Expenses Summary Footer */}
              <div className="mt-4 pt-3 border-t-2 border-[#0f172a] flex justify-between items-center bg-[#F0F7FF] px-4 py-3 rounded">
                <span className="font-bold text-[13px] text-[#0f172a] uppercase">Total Expenses ({expenses.length} Records)</span>
                <span className="font-bold text-[15px] text-red-600">{formatCurrency(totalExpenseAmount)}</span>
              </div>

              {/* Hidden PDF Printable Footer */}
              <div className="pdf-footer hidden mt-6 pt-2 border-t border-black text-right">
                <p className="text-xs text-black font-bold">Printed on: {new Date().toLocaleString()}</p>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ExpenseEntry;
