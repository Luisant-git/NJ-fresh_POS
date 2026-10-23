import { useState } from 'react';
import { Briefcase, PlusSquare, Filter, Building, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import TableLoader from '../../components/TableLoader';

const BankDepositEntry = () => {
  const { formatCurrency, settings } = useSettings();
  const queryClient = useQueryClient();

  // Helper for Malaysia date string (YYYY-MM-DD)
  const getMalaysiaDateStr = (date = new Date()) => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  };

  // Helper for Malaysia display date (DD/MM/YYYY)
  const formatMalaysiaDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(dateString));
  };

  // New Deposit Form State
  const [depositDate, setDepositDate] = useState(getMalaysiaDateStr());
  const [amount, setAmount] = useState('');
  const [depositType, setDepositType] = useState('BANK');
  const [remarks, setRemarks] = useState('');
  
  // Date-wise Filter & Search State for History
  const [filterStartDate, setFilterStartDate] = useState(() => {
    return getMalaysiaDateStr().substring(0, 8) + '01';
  });
  const [filterEndDate, setFilterEndDate] = useState(() => getMalaysiaDateStr());
  const [filterType, setFilterType] = useState('ALL');

  // Fetch Deposits List with date filter
  const { data: deposits = [], isLoading: historyLoading } = useQuery({
    queryKey: ['bankDeposits', filterStartDate, filterEndDate],
    queryFn: async () => {
      const res = await api.get('/bank-deposits', {
        params: {
          fromDate: filterStartDate || undefined,
          toDate: filterEndDate || undefined,
        }
      });
      return res.data;
    }
  });

  const filteredDeposits = deposits.filter((d: any) => filterType === 'ALL' || d.depositType === filterType);
  const totalDepositAmount = filteredDeposits.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/bank-deposits', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankDeposits'] });
      queryClient.invalidateQueries({ queryKey: ['bankDepositReport'] });
      toast.success('Bank Deposit saved successfully!');
      setAmount('');
      setDepositType('BANK');
      setRemarks('');
    },
    onError: (err: any) => {
      console.error(err);
      toast.error(`Failed to save bank deposit: ${err.message}`);
    }
  });

  const handleSave = () => {
    if (!amount) {
      toast.error('Please enter the amount');
      return;
    }
    createMutation.mutate({
      date: depositDate,
      amount: Number(amount),
      depositType: depositType,
      remarks: remarks.trim() || undefined,
    });
  };

  const setQuickDate = (type: 'today' | 'thisMonth' | 'all') => {
    const todayStr = getMalaysiaDateStr();
    if (type === 'today') {
      setFilterStartDate(todayStr);
      setFilterEndDate(todayStr);
    } else if (type === 'thisMonth') {
      const start = todayStr.substring(0, 8) + '01';
      setFilterStartDate(start);
      setFilterEndDate(todayStr);
    } else {
      setFilterStartDate('');
      setFilterEndDate('');
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/bank-deposits/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankDeposits'] });
      toast.success('Deposit deleted successfully');
    },
    onError: (err: any) => {
      toast.error('Failed to delete deposit');
      console.error(err);
    }
  });

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this deposit?')) {
      deleteMutation.mutate(id);
    }
  };

  const todayStr = getMalaysiaDateStr();
  const startOfMonthStr = todayStr.substring(0, 8) + '01';
  
  const isAllTime = !filterStartDate && !filterEndDate;
  const isToday = filterStartDate === todayStr && filterEndDate === todayStr;
  const isThisMonth = filterStartDate === startOfMonthStr && filterEndDate === todayStr && !isToday;

  const getBadgeColor = (type: string) => {
    if (type === 'BANK') return 'bg-blue-100 text-blue-800 border-blue-200';
    if (type === 'ATM MACHINE') return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="absolute inset-0 bg-[#F8FAFC] flex flex-col font-sans overflow-hidden z-10">
      
      {/* Top Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 shrink-0 flex items-center justify-between z-10 shadow-sm relative h-[60px]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 flex items-center justify-center rounded-lg shadow-inner">
            <Building className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800 tracking-wide uppercase">BANK DEPOSIT ENTRY</h2>
            <p className="text-[11px] text-gray-500 font-medium">Record and manage bank deposits</p>
          </div>
        </div>
      </div>

      {/* Main Content split */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Side: Entry Form */}
        <div className="w-full md:w-[350px] lg:w-[400px] bg-white border-r border-gray-200 flex flex-col shrink-0 relative z-10 shadow-[4px_0_15px_-3px_rgba(0,0,0,0.05)]">
          <div className="p-4 bg-gray-50/50 border-b border-gray-200">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <PlusSquare className="w-4 h-4 text-blue-600" /> NEW DEPOSIT
            </h3>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold bg-white"
              />
            </div>
            
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">Deposit Type</label>
              <select
                value={depositType}
                onChange={(e) => setDepositType(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold bg-white"
              >
                <option value="BANK">BANK</option>
                <option value="ATM MACHINE">ATM MACHINE</option>
              </select>
            </div>
            
            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">Amount</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
                  <span className="text-gray-600 font-bold text-[14px] leading-none">{settings?.currencySymbol || 'RM'}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-bold bg-white text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-bold text-gray-700 mb-1">Remarks <span className="text-gray-400 font-medium">(optional)</span></label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white resize-none"
                placeholder="Add notes for this deposit"
              />
            </div>
          </div>
          
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={handleSave}
              disabled={createMutation.isPending}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow transition-colors flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? 'Saving...' : 'SAVE DEPOSIT'}
            </button>
          </div>
        </div>

        {/* Right Side: Recent Deposits & Filters */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC]">
          {/* Quick Filters */}
          <div className="p-2 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shadow-sm shrink-0">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setQuickDate('today')} 
                className={`px-3 py-1 rounded text-[11px] font-bold transition-colors shadow-sm border ${isToday ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:text-gray-900'}`}
              >Today</button>
              <button 
                onClick={() => setQuickDate('thisMonth')} 
                className={`px-3 py-1 rounded text-[11px] font-bold transition-colors shadow-sm border ${isThisMonth ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:text-gray-900'}`}
              >This Month</button>
              <button 
                onClick={() => setQuickDate('all')} 
                className={`px-3 py-1 rounded text-[11px] font-bold transition-colors shadow-sm border ${isAllTime ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 hover:text-gray-900'}`}
              >All Time</button>
            </div>
            
            <div className="flex items-center gap-2">
              <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="p-1.5 border border-gray-300 rounded text-[11px] font-bold" title="From Date" />
              <span className="text-gray-400 font-medium text-[11px]">to</span>
              <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="p-1.5 border border-gray-300 rounded text-[11px] font-bold" title="To Date" />
              
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="p-1.5 ml-2 border border-gray-300 rounded text-[11px] font-bold"
                title="Deposit Type"
              >
                <option value="ALL">All Types</option>
                <option value="BANK">BANK</option>
                <option value="ATM MACHINE">ATM MACHINE</option>
              </select>
            </div>
          </div>

          {/* History List */}
          <div className="flex-1 overflow-auto p-4">
            <div className="bg-white rounded shadow-sm border border-gray-200 flex flex-col h-full">
              <div className="p-2 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" /> DEPOSIT HISTORY
                </h3>
                <span className="text-xs font-bold text-black bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{filteredDeposits.length} Records</span>
              </div>
              
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-[#1E293B] text-white sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-2 font-bold uppercase tracking-wider text-[11px] border-r border-[#334155] w-12 text-center">#</th>
                      <th className="p-2 font-bold uppercase tracking-wider text-[11px] border-r border-[#334155]">Date</th>
                      <th className="p-2 font-bold uppercase tracking-wider text-[11px] border-r border-[#334155]">Type</th>
                      <th className="p-2 font-bold uppercase tracking-wider text-[11px] border-r border-[#334155] text-right">Amount</th>
                      <th className="p-2 font-bold uppercase tracking-wider text-[11px] border-r border-[#334155]">Remarks</th>
                      <th className="p-2 font-bold uppercase tracking-wider text-[11px] text-center w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLoading ? (
                      <TableLoader columns={6} />
                    ) : filteredDeposits.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-gray-500 font-bold bg-gray-50/50">
                          <div className="flex flex-col items-center justify-center">
                            <Briefcase className="w-8 h-8 text-gray-300 mb-2" />
                            No deposits found for selected criteria.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredDeposits.map((dep: any, idx: number) => (
                        <tr key={dep.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="p-2 text-center text-gray-500 border-r border-gray-100 text-xs font-bold">{idx + 1}</td>
                          <td className="p-2 border-r border-gray-100 text-gray-800 font-bold">{formatMalaysiaDate(dep.date)}</td>
                          <td className="p-2 border-r border-gray-100 text-gray-700">
                            <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase border ${getBadgeColor(dep.depositType)}`}>
                              {dep.depositType}
                            </span>
                          </td>
                          <td className="p-2 border-r border-gray-100 text-right text-black font-bold text-sm">
                            {formatCurrency(dep.amount)}
                          </td>
                          <td className="p-2 border-r border-gray-100 text-gray-700 max-w-[220px] truncate" title={dep.remarks || ''}>
                            {dep.remarks || '-'}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => handleDelete(dep.id)}
                              className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                              title="Delete Deposit"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Summary Footer */}
              <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center shrink-0">
                <span className="font-bold text-[13px] text-gray-600 uppercase">Total Deposits</span>
                <span className="font-bold text-[18px] text-blue-600">{formatCurrency(totalDepositAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankDepositEntry;
