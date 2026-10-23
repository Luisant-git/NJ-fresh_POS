import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Building, RefreshCw, FileText, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSettings } from '../../contexts/SettingsContext';
import api from '../../services/api';
import ReportTabs from '../../components/ReportTabs';
import { exportToExcel } from '../../utils/exportExcel';
import { exportTableToPdf, type PdfColumn } from '../../utils/exportPdf';
import PaginationControls from '../../components/PaginationControls';
import TableLoader from '../../components/TableLoader';

const BankDepositReport = () => {
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
  
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  
  // Fetch Report Data
  const { data: deposits = [], isLoading } = useQuery({
    queryKey: ['bankDepositReport', fromDate, toDate],
    queryFn: async () => {
      const { data } = await api.get(`/bank-deposits`, { 
        params: { 
          fromDate, 
          toDate,
        } 
      });
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/bank-deposits/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankDepositReport'] });
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

  const filteredDeposits = deposits.filter((d: any) => filterType === 'ALL' || d.depositType === filterType);
  const totalDepositAmount = filteredDeposits.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

  const [entriesPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(filteredDeposits.length / entriesPerPage);
  const paginatedDeposits = filteredDeposits.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage);

  const todayStr = getMalaysiaDateStr();
  const startOfMonthStr = todayStr.substring(0, 8) + '01';
  
  const isAllTime = !fromDate && !toDate;
  const isToday = fromDate === todayStr && toDate === todayStr;
  const isMonth = fromDate === startOfMonthStr && toDate === todayStr && !isToday;

  const getBadgeColor = (type: string) => {
    if (type === 'BANK') return 'bg-blue-100 text-blue-800 border-blue-200';
    if (type === 'ATM MACHINE') return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="absolute inset-0 bg-[#F7F7F7] flex flex-col font-sans overflow-y-auto lg:overflow-hidden z-10 p-2 sm:p-4">
      
      <ReportTabs />

      <div className="flex flex-col flex-1 overflow-hidden mt-4">
        <div className="bg-white border border-[#E6E9ED] shadow-sm rounded-sm flex flex-col flex-1 overflow-hidden">
          
          {/* Header */}
          <div className="bg-[#F8F9FA] border-b border-[#E6E9ED] px-3 py-2 sm:px-4 sm:py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[#2563EB]">
              <div className="flex items-center gap-2">
                <Building size={18} className="shrink-0" />
                <h2 className="font-bold text-[13px] md:text-[14px] uppercase tracking-wide">Bank Deposit Report</h2>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="bg-[#2563EB] text-white font-bold text-[11px] px-3 py-1.5 rounded shadow-sm whitespace-nowrap flex items-center h-[30px]">
                  {filteredDeposits.length} Records
                </div>
                <button type="button" 
                  onClick={() => {
                    const exportData = filteredDeposits.map((d: any) => ({
                      'Date': formatMalaysiaDate(d.date),
                      'Type': d.depositType,
                      'Amount': d.amount,
                      'Remarks': d.remarks || ''
                    }));
                    exportData.push({
                      'Date': '',
                      'Type': 'TOTAL:',
                      'Amount': formatCurrency(totalDepositAmount) as any,
                      'Remarks': ''
                    });
                    exportToExcel(exportData, `Bank_Deposit_Report_${fromDate}_to_${toDate}`, {
                      shopName: settings?.shopName || 'MY SHOP',
                      title: 'Bank Deposit Report',
                      totalCount: filteredDeposits.length
                    });
                  }}
                  className="bg-[#10B981] hover:bg-[#059669] text-white px-3 py-1.5 rounded flex items-center justify-center gap-1.5 text-[12px] font-bold whitespace-nowrap transition-colors shrink-0"
                >
                  <Download size={13} /> <span className="hidden sm:inline">Export Excel</span>
                </button>
                <button type="button"
                  onClick={() => {
                    const cols: PdfColumn[] = [
                      { header: 'Date', dataKey: 'date' },
                      { header: 'Deposit Type', dataKey: 'depositType' },
                      { header: 'Amount', dataKey: 'amount' },
                      { header: 'Remarks', dataKey: 'remarks' },
                    ];
                    const pdfData = [...filteredDeposits.map((d:any) => ({
                      ...d, 
                      date: formatMalaysiaDate(d.date),
                      amount: formatCurrency(d.amount),
                      remarks: d.remarks || '-'
                    })), {
                      date: '',
                      depositType: 'TOTAL:',
                      amount: formatCurrency(totalDepositAmount),
                      remarks: ''
                    }];
                    exportTableToPdf(cols, pdfData, `Bank_Deposit_Report_${fromDate}_to_${toDate}`, 'Bank Deposit Report', settings?.shopName, filteredDeposits.length);
                  }}
                  className="bg-[#EF4444] hover:bg-[#DC2626] text-white px-3 py-1.5 rounded flex items-center justify-center gap-1.5 text-[12px] font-bold whitespace-nowrap transition-colors shrink-0"
                >
                  <FileText size={13} /> <span className="hidden sm:inline">Export PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white p-2 sm:p-3 border-b border-[#E6E9ED] shrink-0">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full sm:w-[130px] px-2 py-1.5 border border-[#E5E7EB] rounded text-[12px] font-bold outline-none focus:border-[#2563EB]" />
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full sm:w-[130px] px-2 py-1.5 border border-[#E5E7EB] rounded text-[12px] font-bold outline-none focus:border-[#2563EB]" />
                
                <select 
                  value={filterType} 
                  onChange={(e) => setFilterType(e.target.value)} 
                  className="w-full sm:w-[150px] px-2 py-1.5 border border-[#E5E7EB] rounded text-[12px] font-bold outline-none focus:border-[#2563EB]"
                >
                  <option value="ALL">All Types</option>
                  <option value="BANK">BANK</option>
                  <option value="ATM MACHINE">ATM MACHINE</option>
                </select>

                <div className="flex gap-2 shrink-0 ml-1">
                  <button 
                    onClick={() => { setFromDate(todayStr); setToDate(todayStr); }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded border transition-colors ${isToday ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-white text-black border-[#E5E7EB] hover:bg-gray-50'}`}
                  >
                    Today
                  </button>
                  <button 
                    onClick={() => { setFromDate(startOfMonthStr); setToDate(todayStr); }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded border transition-colors ${isMonth ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-white text-black border-[#E5E7EB] hover:bg-gray-50'}`}
                  >
                    This Month
                  </button>
                  <button 
                    onClick={() => { setFromDate(''); setToDate(''); }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded border transition-colors ${isAllTime ? 'bg-[#3B82F6] text-white border-[#3B82F6]' : 'bg-white text-black border-[#E5E7EB] hover:bg-gray-50'}`}
                  >
                    All Time
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={() => { setFromDate(''); setToDate(''); setFilterType('ALL'); }}
                  className={`ml-auto shrink-0 px-3 py-1.5 rounded flex items-center gap-1 transition-colors border text-[12px] font-bold ${(!isAllTime || filterType !== 'ALL') ? 'bg-white text-[#2563EB] border-blue-200 hover:bg-blue-50' : 'bg-white text-black border-[#E5E7EB] hover:bg-gray-50'}`}
                >
                  <RefreshCw size={13} /> <span className="hidden sm:inline">Reset</span>
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-[#F8FAFC]">
            <table className="w-full text-left border-collapse text-[12px] lg:text-[13px] whitespace-nowrap">
              <thead className="bg-[#1E293B] text-white sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 border-r border-[#334155] font-bold uppercase tracking-wider text-[11px] text-center w-12">#</th>
                  <th className="px-4 py-3 border-r border-[#334155] font-bold uppercase tracking-wider text-[11px]">Date</th>
                  <th className="px-4 py-3 border-r border-[#334155] font-bold uppercase tracking-wider text-[11px]">Deposit Type</th>
                  <th className="px-4 py-3 border-r border-[#334155] font-bold uppercase tracking-wider text-[11px] text-right">Amount</th>
                  <th className="px-4 py-3 border-r border-[#334155] font-bold uppercase tracking-wider text-[11px]">Remarks</th>
                  <th className="px-4 py-3 font-bold uppercase tracking-wider text-[11px] text-center w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <TableLoader columns={6} />
                ) : filteredDeposits.length === 0 ? (
                  <tr><td colSpan={6} className="text-center p-6 text-black font-bold">No deposit records found.</td></tr>
                ) : (
                  paginatedDeposits.map((d: any, index: number) => (
                    <tr key={d.id} className={`border-b border-[#E2E8F0] ${index % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'} hover:bg-[#EFF6FF]`}>
                      <td className="px-4 py-3 border-r border-[#E2E8F0] text-center text-black font-bold">{(currentPage - 1) * entriesPerPage + index + 1}</td>
                      <td className="px-4 py-3 border-r border-[#E2E8F0] text-black font-bold">{formatMalaysiaDate(d.date)}</td>
                      <td className="px-4 py-3 border-r border-[#E2E8F0] font-bold text-black">
                        <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase border ${getBadgeColor(d.depositType)}`}>
                          {d.depositType}
                        </span>
                      </td>
                      <td className="px-4 py-3 border-r border-[#E2E8F0] text-right text-black font-bold">{formatCurrency(d.amount)}</td>
                      <td className="px-4 py-3 border-r border-[#E2E8F0] text-black max-w-[260px] truncate" title={d.remarks || ''}>
                        {d.remarks || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-md bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                          title="Delete Deposit"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white border-t border-[#E2E8F0] shrink-0">
            <div className="px-4 py-3 flex justify-end items-center bg-[#F8FAFC] border-b border-[#E2E8F0]">
              <div className="flex items-center gap-4">
                <span className="text-[12px] font-bold text-black uppercase">Total Deposited:</span>
                <span className="text-[16px] font-bold text-[#10B981]">{formatCurrency(totalDepositAmount)}</span>
              </div>
            </div>
            
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              entriesPerPage={entriesPerPage}
              totalEntries={filteredDeposits.length}
              onPageChange={setCurrentPage}
            />
          </div>

        </div>
      </div>
    </div>
  );
};

export default BankDepositReport;
