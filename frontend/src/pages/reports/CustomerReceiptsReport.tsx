import { formatMalaysiaDate } from '../../utils/date';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Users, FileText, RefreshCw, DollarSign, AlertCircle, CheckCircle2, Printer, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { exportTableToPdf, type PdfColumn } from '../../utils/exportPdf';
import { exportToExcel } from '../../utils/exportExcel';
import { useSettings } from '../../contexts/SettingsContext';
import api from '../../services/api';
import ReportTabs from '../../components/ReportTabs';
import PaginationControls from '../../components/PaginationControls';
import SearchableSelect from '../../components/SearchableSelect';
import TableLoader from '../../components/TableLoader';
import { generateBillByBillPdf } from '../../utils/pdfGenerator';
import PdfViewerModal from '../../components/PdfViewerModal';

const CustomerReceiptsReport = () => {
  const { formatCurrency, settings } = useSettings();
  const [reportMode, setReportMode] = useState<'consolidation' | 'history'>('consolidation');
  const showClearedOnly = false; // const [showClearedOnly, setShowClearedOnly] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [entriesPerPage] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('Bill-by-Bill Breakdown');
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Fetch Consolidation Data
  const { data: consolidationData = [], isLoading: consolidationLoading } = useQuery({
    queryKey: ['customerReceiptsConsolidation', startDate, endDate],
    queryFn: async () => {
      let url = '/customer-receipts/consolidation-report';
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (params.toString()) url += `?${params.toString()}`;
      return (await api.get(url)).data;
    }
  });

  // Fetch Receipts History Data
  const { data: receiptsHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['customerReceiptsHistory'],
    queryFn: async () => (await api.get('/customer-receipts')).data
  });

  // Build search options
  const searchOptions = React.useMemo(() => {
    const optionsMap = new Map();
    
    // Add all customers and phones from consolidation data
    consolidationData.forEach((item: any) => {
      if (item.customerName && item.customerName !== 'Counter Sale') {
        const phoneStr = item.phone ? ` - ${item.phone}` : '';
        optionsMap.set(`cust_${item.customerName}`, { 
          value: item.customerName, 
          label: `${item.customerName}${phoneStr}` 
        });
      }
    });

    return [{ value: '', label: 'All / Clear Search' }, ...Array.from(optionsMap.values())];
  }, [consolidationData, receiptsHistory]);

  // Pre-filter for search (Totals are based on this, regardless of 0 pending)
  const searchFilteredConsolidation = consolidationData.filter((item: any) => {
    if (searchTerm && !item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) && !item.phone.includes(searchTerm)) {
      return false;
    }
    return true;
  });

  // Filter Consolidation List for table display
  const filteredConsolidation = searchFilteredConsolidation.filter((item: any) => {
    const hasPending = Math.abs(Number(item.netPending || 0)) >= 0.005;
    
    if (showClearedOnly && hasPending) return false;
    if (!showClearedOnly && !hasPending) return false;

    if (startDate || endDate) {
      const hasActivity = Number(item.totalSales || 0) > 0 || Number(item.totalReceipts || 0) > 0 || Number(item.totalReturns || 0) > 0;
      return hasActivity;
    }

    return true;
  });

  // Filter Receipts History List
  const filteredHistory = receiptsHistory.filter((item: any) => {
    if (searchTerm && !item.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) && !item.receiptNo?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (startDate || endDate) {
      const d = new Date(item.date);
      const tzDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
      const dateStr = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}-${String(tzDate.getDate()).padStart(2, '0')}`;
      if (startDate && dateStr < startDate) return false;
      if (endDate && dateStr > endDate) return false;
    }
    return true;
  });

  // Summary Totals (Based on search results, not hiding 0 pending dues)
  const totalSales = searchFilteredConsolidation.reduce((sum: number, i: any) => sum + Number(i.totalSales || 0), 0);
  const totalCollected = reportMode === 'consolidation' 
    ? searchFilteredConsolidation.reduce((sum: number, i: any) => sum + Number(i.totalReceipts || 0), 0)
    : filteredHistory.reduce((sum: number, item: any) => sum + Number(item.amount), 0);
  const totalPendingDues = searchFilteredConsolidation.reduce((sum: number, i: any) => sum + Number(i.netPending > 0 ? i.netPending : 0), 0);

  const activeList = reportMode === 'consolidation' ? filteredConsolidation : filteredHistory;
  const totalPages = Math.ceil(activeList.length / entriesPerPage);
  const paginatedList = activeList.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage);

  const isReset = !searchTerm && !startDate && !endDate;



  const handlePdfExport = () => {
    if (reportMode === 'consolidation') {
      const cols: PdfColumn[] = [
        { header: 'S.No', dataKey: '_sno' },
        { header: 'Customer Name', dataKey: 'customerName' },
        { header: 'Phone', dataKey: 'phone' },
        { header: 'Opening Balance', dataKey: '_opening' },
        { header: 'Total Invoiced', dataKey: 'totalSales' },
        { header: 'Total Collected', dataKey: 'totalReceipts' },
        { header: 'Total Returns', dataKey: 'totalReturns' },
        { header: 'Net Pending Due', dataKey: 'netPending' },
      ];
      const rows = filteredConsolidation.map((c: any, idx: number) => ({
        _sno: idx + 1,
        customerName: c.customerName,
        phone: c.phone,
        _opening: `${c.openingBalance} (${c.openingBalanceType})`,
        totalSales: c.totalSales,
        totalReceipts: c.totalReceipts,
        totalReturns: c.totalReturns,
        netPending: c.netPending,
      }));
      const totalReturnsAll = searchFilteredConsolidation.reduce((sum: number, i: any) => sum + Number(i.totalReturns || 0), 0);
      rows.push({
        _sno: '',
        customerName: 'TOTAL',
        phone: '',
        _opening: '',
        totalSales: formatCurrency(totalSales),
        totalReceipts: formatCurrency(totalCollected),
        totalReturns: formatCurrency(totalReturnsAll),
        netPending: formatCurrency(totalPendingDues),
      });
      const title = `Customer Dues Consolidation Report${startDate || endDate ? ` (${startDate || 'Start'} to ${endDate || 'End'})` : ''}`;
      exportTableToPdf(cols, rows, 'Customer_Dues_Consolidation_Report', title, settings?.shopName, filteredConsolidation.length);
    } else {
      const cols: PdfColumn[] = [
        { header: 'RECEIPT', dataKey: 'receiptNo' },
        { header: 'DATE', dataKey: '_date' },
        { header: 'CUSTOMER NAME', dataKey: '_customer' },
        { header: 'AMT. REC.', dataKey: 'amount' },
        { header: 'OPEN CR', dataKey: 'openCr' },
        { header: 'PAYMENT FOR', dataKey: 'invoiceNo' },
        { header: 'ON', dataKey: 'invoiceDate' },
        { header: 'DAYS', dataKey: 'days' },
        { header: 'ORIG. AMT', dataKey: 'origAmt' },
        { header: 'AMT. PAID', dataKey: 'amtPaid' },
        { header: "OUT'DING", dataKey: 'outstanding' },
      ];
      const rows: any[] = [];
      filteredHistory.forEach((r: any) => {
        const openCr = r.amount - (r.allocations?.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0) || 0);
        if (!r.allocations || r.allocations.length === 0) {
          rows.push({
            receiptNo: r.receiptNo,
            _date: formatMalaysiaDate(r.date),
            _customer: r.customer?.name || '-',
            amount: formatCurrency(r.amount),
            openCr: formatCurrency(openCr > 0 ? openCr : 0),
            invoiceNo: '-',
            invoiceDate: '-',
            days: '-',
            origAmt: '-',
            amtPaid: '-',
            outstanding: '-',
          });
        } else {
          r.allocations.forEach((a: any, idx: number) => {
            const isFirst = idx === 0;
            const isOB = !a.saleId;
            const invNo = isOB ? 'Opening Balance' : (a.sale?.invoiceNo || '-');
            const rawDate = isOB ? r.customer?.createdAt : a.sale?.date;
            const invDate = rawDate ? formatMalaysiaDate(rawDate) : '-';
            const days = rawDate ? Math.max(0, Math.floor((new Date(r.date).getTime() - new Date(rawDate).getTime()) / (1000 * 3600 * 24))).toString() : '-';
            const origAmt = isOB ? Number(r.customer?.openingBalance || a.amount) : Number(a.sale?.grandTotal || 0);
            const amtPaid = Number(a.amount || 0);
            const outstanding = Math.max(0, origAmt - amtPaid);

            rows.push({
              receiptNo: isFirst ? r.receiptNo : '',
              _date: isFirst ? formatMalaysiaDate(r.date) : '',
              _customer: isFirst ? (r.customer?.name || '-') : '',
              amount: isFirst ? formatCurrency(r.amount) : '',
              openCr: isFirst ? formatCurrency(openCr > 0 ? openCr : 0) : '',
              invoiceNo: invNo,
              invoiceDate: invDate,
              days: days,
              origAmt: formatCurrency(origAmt),
              amtPaid: formatCurrency(amtPaid),
              outstanding: formatCurrency(outstanding),
            });
          });
        }
      });
      const historyTotalAmount = filteredHistory.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      rows.push({
        receiptNo: '',
        _date: '',
        _customer: '',
        amount: '',
        openCr: '',
        invoiceNo: '',
        invoiceDate: '',
        days: '',
        origAmt: 'TOTAL AMOUNT:',
        amtPaid: formatCurrency(historyTotalAmount),
        outstanding: '',
      });
      const title = `Customer Receipts History Report${startDate || endDate ? ` (${startDate || 'Start'} to ${endDate || 'End'})` : ''}`;
      exportTableToPdf(cols, rows, 'Customer_Receipts_History_Report', title, settings?.shopName, filteredHistory.length);
    }
  };

  const handleExcelExport = () => {
    if (reportMode === 'consolidation') {
      const exportData = filteredConsolidation.map((c: any, idx: number) => ({
        'S.No': idx + 1,
        'Customer Name': c.customerName,
        'Phone': c.phone,
        'Opening Balance': `${c.openingBalance} (${c.openingBalanceType})`,
        'Total Invoiced': c.totalSales,
        'Total Collected': c.totalReceipts,
        'Total Returns': c.totalReturns,
        'Net Pending Due': c.netPending,
      }));
      exportData.push({
        'S.No': '',
        'Customer Name': '',
        'Phone': '',
        'Opening Balance': '',
        'Total Invoiced': formatCurrency(totalSales) as any,
        'Total Collected': formatCurrency(totalCollected) as any,
        'Total Returns': 'TOTAL:',
        'Net Pending Due': formatCurrency(totalPendingDues) as any,
      });
      exportToExcel(exportData, 'Customer_Dues_Consolidation', {
        shopName: settings?.shopName || 'MY SHOP',
        title: 'Customer Dues Consolidation Report',
        totalCount: filteredConsolidation.length
      });
    } else {
      const exportData: any[] = [];
      filteredHistory.forEach((r: any) => {
        const openCr = r.amount - (r.allocations?.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0) || 0);
        if (!r.allocations || r.allocations.length === 0) {
          exportData.push({
            'RECEIPT': r.receiptNo,
            'DATE': formatMalaysiaDate(r.date),
            'CUSTOMER NAME': r.customer?.name || '-',
            'AMT. REC.': formatCurrency(r.amount),
            'OPEN CR': formatCurrency(openCr > 0 ? openCr : 0),
            'PAYMENT FOR': '-',
            'ON': '-',
            'DAYS': '-',
            'ORIG. AMT': '-',
            'AMT. PAID': '-',
            "OUT'DING": '-',
          });
        } else {
          r.allocations.forEach((a: any, idx: number) => {
            const isFirst = idx === 0;
            const isOB = !a.saleId;
            const invNo = isOB ? 'Opening Balance' : (a.sale?.invoiceNo || '-');
            const rawDate = isOB ? r.customer?.createdAt : a.sale?.date;
            const invDate = rawDate ? formatMalaysiaDate(rawDate) : '-';
            const days = rawDate ? Math.max(0, Math.floor((new Date(r.date).getTime() - new Date(rawDate).getTime()) / (1000 * 3600 * 24))).toString() : '-';
            const origAmt = isOB ? Number(r.customer?.openingBalance || a.amount) : Number(a.sale?.grandTotal || 0);
            const amtPaid = Number(a.amount || 0);
            const outstanding = Math.max(0, origAmt - amtPaid);

            exportData.push({
              'RECEIPT': isFirst ? r.receiptNo : '',
              'DATE': isFirst ? formatMalaysiaDate(r.date) : '',
              'CUSTOMER NAME': isFirst ? (r.customer?.name || '-') : '',
              'AMT. REC.': isFirst ? formatCurrency(r.amount) : '',
              'OPEN CR': isFirst ? formatCurrency(openCr > 0 ? openCr : 0) : '',
              'PAYMENT FOR': invNo,
              'ON': invDate,
              'DAYS': days,
              'ORIG. AMT': formatCurrency(origAmt),
              'AMT. PAID': formatCurrency(amtPaid),
              "OUT'DING": formatCurrency(outstanding),
            });
          });
        }
      });
      const historyTotalAmount = filteredHistory.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      exportData.push({
        'RECEIPT': '',
        'DATE': '',
        'CUSTOMER NAME': '',
        'AMT. REC.': '',
        'OPEN CR': '',
        'PAYMENT FOR': '',
        'ON': '',
        'DAYS': '',
        'ORIG. AMT': 'TOTAL AMOUNT:',
        'AMT. PAID': formatCurrency(historyTotalAmount),
        "OUT'DING": '',
      });
      exportToExcel(exportData, 'Customer_Receipts_History', {
        shopName: settings?.shopName || 'MY SHOP',
        title: 'Customer Receipts History Report',
        totalCount: filteredHistory.length
      });
    }
  };

  const handlePrintBreakdown = async (customerId: number, customerName: string) => {
    if (!customerId) return;
    try {
      setPrintingId(customerId);
      const res = await api.get(`/customer-receipts/unpaid-bills/${customerId}`);
      // Only print bills that still carry an outstanding (pending) balance
      const unpaidBills = (res.data || []).filter((bill: any) => Number(bill.pending || 0) >= 0.01);
      const totals = unpaidBills.reduce((acc: any, bill: any) => {
        acc.total += Number(bill.total || 0);
        acc.returned += Number(bill.returned || 0);
        acc.received += Number(bill.received || 0);
        acc.pending += Number(bill.pending || 0);
        return acc;
      }, { total: 0, returned: 0, received: 0, pending: 0 });
      const companyName = settings?.shopName || 'NJ FRESH AND FROZEN SDN BHD';
      const url = generateBillByBillPdf(companyName, customerName, 'Customer', unpaidBills, totals) as unknown as string;
      setPdfUrl(url);
      setPdfTitle(`${customerName} - Bill by Bill`);
      setPdfModalOpen(true);
    } catch (err) {
      console.error(err);
    } finally {
      setPrintingId(null);
    }
  };

  return (
    <>
    <div className={`${isExpanded ? 'fixed inset-0 z-[9999]' : 'absolute inset-0 z-10'} bg-[#F8FAFC] flex flex-col font-sans overflow-y-auto lg:overflow-hidden p-2 sm:p-4`}>
      
      {!isExpanded && <ReportTabs />}

      {/* Top Header Card with Summary Stats */}
      <div className="bg-white border border-[#E2E8F0] shadow-sm rounded-md mb-2 p-2 sm:p-3 sm:mb-3 shrink-0">
        <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${isExpanded ? '' : 'mb-3 border-b border-[#E2E8F0] pb-3'}`}>
          
          <div className={`flex items-center gap-2 ${isExpanded ? 'hidden' : ''}`}>
            <div className="bg-[#3B82F6] text-white p-2 rounded-lg shadow-sm shrink-0">
              <Users size={18} />
            </div>
            <div>
              <h1 className="font-bold text-[13px] sm:text-[15px] text-[#0F172A] uppercase tracking-wide">
                CUSTOMER RECEIPTS & OVERDUE REPORT
              </h1>
              <p className="text-xs text-black font-bold hidden sm:block">Complete overview of customer pending balances, total receipts, and ledger dues</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="bg-gray-100 p-1 rounded-md flex items-center gap-1 border border-gray-200 flex-1 sm:flex-none">
              <button
                type="button"
                onClick={() => { setReportMode('consolidation'); setCurrentPage(1); }}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-bold rounded transition-colors ${
                  reportMode === 'consolidation' ? 'bg-[#0F172A] text-white shadow-sm' : 'text-black hover:text-black'
                }`}
              >
                Pending Dues
              </button>
              <button
                type="button"
                onClick={() => { setReportMode('history'); setCurrentPage(1); }}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 text-[11px] sm:text-[12px] font-bold rounded transition-colors ${
                  reportMode === 'history' ? 'bg-[#0F172A] text-white shadow-sm' : 'text-black hover:text-black'
                }`}
              >
                Receipts History
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={handleExcelExport} className="bg-[#10B981] hover:bg-[#059669] text-white px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Download size={14} /> <span className="hidden sm:inline">Excel</span>
              </button>
              <button type="button" onClick={handlePdfExport} className="bg-[#EF4444] hover:bg-[#DC2626] text-white px-3 py-1.5 rounded text-[12px] font-bold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <Download size={14} /> <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stat Summary Cards */}
        <div className={`flex overflow-x-auto md:grid md:grid-cols-3 gap-2 sm:gap-3 snap-x scrollbar-hide ${isExpanded ? 'hidden' : 'mb-3 pb-1'}`}>
          <div className="min-w-[220px] md:min-w-0 snap-start bg-[#EFF6FF] border border-[#BFDBFE] p-2.5 rounded-md flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[#1E40AF] uppercase">Total Credit Invoiced</p>
              <p className="text-base font-bold text-[#1E3A8A]">{formatCurrency(totalSales)}</p>
            </div>
            <DollarSign className="text-[#3B82F6]" size={20} />
          </div>
          <div className="min-w-[220px] md:min-w-0 snap-start bg-[#ECFDF5] border border-[#A7F3D0] p-2.5 rounded-md flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[#065F46] uppercase">Total Receipts Collected</p>
              <p className="text-base font-bold text-[#047857]">{formatCurrency(totalCollected)}</p>
            </div>
            <CheckCircle2 className="text-[#10B981]" size={20} />
          </div>
          <div className="min-w-[220px] md:min-w-0 snap-start bg-[#FEF2F2] border border-[#FECACA] p-2.5 rounded-md flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-[#991B1B] uppercase">Overall Outstanding Dues</p>
              <p className="text-base font-bold text-[#DC2626]">{formatCurrency(totalPendingDues)}</p>
            </div>
            <AlertCircle className="text-[#EF4444]" size={20} />
          </div>
        </div>
      </div>

      {/* Filters - always visible, fully responsive */}
      <div className="bg-white p-2 sm:p-3 border-b border-[#E6E9ED] shrink-0">
          <div className="flex flex-col gap-2">
            {/* Row 1: Search + Reset */}
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <SearchableSelect
                  options={searchOptions}
                  value={searchTerm}
                  onChange={(val) => setSearchTerm(val || '')}
                  placeholder="Search customer..."
                  className="w-full"
                />
              </div>
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setStartDate(''); setEndDate(''); }}
                className={`shrink-0 px-3 py-[9px] rounded flex items-center gap-1 transition-colors border text-[12px] font-bold h-[38px] ${!isReset ? "bg-white text-red-600 border-red-200 hover:bg-red-50" : "bg-white text-black border-[#E5E7EB] hover:bg-gray-50"}`}
              >
                <RefreshCw size={13} /> <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
            {/* Row 2: Dates */}
            <div className="grid grid-cols-2 sm:flex sm:gap-2 gap-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full sm:w-[150px] px-2 py-1.5 border border-[#E5E7EB] rounded text-[12px] outline-none focus:border-[#3B82F6] h-[38px]" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-[150px] px-2 py-1.5 border border-[#E5E7EB] rounded text-[12px] outline-none focus:border-[#3B82F6] h-[38px]" />
              <div className="hidden sm:flex items-center gap-1.5 ml-1">
                {(() => {
                  const d = new Date();
                  const pad = (n: number) => n.toString().padStart(2, '0');
                  const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                  const firstDay = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
                  const lastDayDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                  const lastDay = `${lastDayDate.getFullYear()}-${pad(lastDayDate.getMonth() + 1)}-${pad(lastDayDate.getDate())}`;
                  
                  const isToday = startDate === todayStr && endDate === todayStr;
                  const isMonth = startDate === firstDay && endDate === lastDay;

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate(todayStr);
                          setEndDate(todayStr);
                        }}
                        className={`px-3 py-1.5 flex items-center gap-1.5 text-[12px] font-bold rounded h-[38px] transition-colors border ${isToday ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-black'}`}
                      >
                        {isToday && <CheckCircle2 size={14} className="text-blue-600" />} Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStartDate(firstDay);
                          setEndDate(lastDay);
                        }}
                        className={`px-3 py-1.5 flex items-center gap-1.5 text-[12px] font-bold rounded h-[38px] transition-colors border ${isMonth ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-sm' : 'bg-gray-100 hover:bg-gray-200 border-gray-200 text-black'}`}
                      >
                        {isMonth && <CheckCircle2 size={14} className="text-blue-600" />} This Month
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      {/* Main Content Area */}
      <div className="bg-white border border-[#E2E8F0] shadow-sm rounded-md overflow-hidden flex flex-col min-h-0 min-w-0 flex-1">
        <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-3 py-2 flex justify-between items-center shrink-0 gap-2">
          <div className="flex items-center gap-1.5 text-black font-bold min-w-0">
            <FileText size={14} className="shrink-0" />
            <h2 className="font-bold text-[11px] sm:text-[13px] tracking-wide text-black uppercase truncate">
              {reportMode === 'consolidation' ? 'OVERALL CUSTOMER DUES CONSOLIDATION' : 'CUSTOMER RECEIPTS HISTORY'}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* {reportMode === 'consolidation' && (
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-gray-600 bg-white border border-gray-200 px-2 py-1.5 rounded transition-colors hover:bg-gray-50 shrink-0">
                <input 
                  type="checkbox" 
                  checked={showClearedOnly} 
                  onChange={(e) => setShowClearedOnly(e.target.checked)} 
                  className="rounded text-[#3B82F6] focus:ring-[#3B82F6] w-3.5 h-3.5 cursor-pointer" 
                />
                Show Cleared Bills Only
              </label>
            )} */}
            <span className="text-[11px] font-bold text-gray-600 whitespace-nowrap shrink-0">{activeList.length} Records Found</span>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-[12px] font-bold rounded transition-colors ${
                isExpanded 
                  ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' 
                  : 'bg-[#1E293B] text-white hover:bg-[#0F172A] shadow-sm'
              }`}
            >
              {isExpanded ? (
                <><Minimize2 size={14} /> <span className="hidden sm:inline">Exit Full View</span></>
              ) : (
                <><Maximize2 size={14} /> <span className="hidden sm:inline">Full View</span></>
              )}
            </button>
          </div>
        </div>

        <div id="customer-receipts-report-export" className="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
          
          {/* Printable Header */}
          <div className="pdf-header hidden mb-4 border-b border-black pb-3">
            <div className="text-center">
              <h1 className="text-xl font-bold uppercase">{settings?.shopName || 'MY SHOP'}</h1>
              <h2 className="text-sm font-bold uppercase">
                {reportMode === 'consolidation' ? 'CUSTOMER DUES CONSOLIDATION REPORT' : 'CUSTOMER RECEIPTS HISTORY REPORT'}
              </h2>
              <p className="text-xs text-black font-bold mt-1">Generated: {new Date().toLocaleString()}</p>
            </div>
          </div>

          <div className="flex-1 overflow-auto overflow-x-auto">
            {reportMode === 'consolidation' ? (
              <table className="w-full text-left text-[12px] whitespace-nowrap">
                <thead>
                  <tr className="bg-[#0F172A] text-white font-bold">
                    <th className="px-3 py-2.5 border-r border-[#1E293B] text-center w-12">S.No</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B]">Customer Name</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B]">Phone</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B] text-right">Opening Bal</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B] text-right">Total Invoiced</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B] text-right">Total Collected</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B] text-right">Returns</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B] text-right font-bold">Net Pending Due</th>
                    <th className="px-3 py-2.5 text-center font-bold print:hidden">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidationLoading ? (
                    <TableLoader columns={8} />
                  ) : filteredConsolidation.length === 0 ? (
                    <tr><td colSpan={8} className="text-center p-6 text-black font-bold">No customer records found.</td></tr>
                  ) : (
                    paginatedList.map((c: any, index: number) => (
                      <tr key={c.customerId} className={`border-b border-[#E2E8F0] ${index % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'} hover:bg-[#EFF6FF]`}>
                        <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-center text-black font-bold">{(currentPage - 1) * entriesPerPage + index + 1}</td>
                        <td className="px-3 py-2.5 border-r border-[#E2E8F0] font-bold text-[#0F172A]">{c.customerName}</td>
                        <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black font-bold">{c.phone}</td>
                        <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right text-black font-bold">{formatCurrency(c.openingBalance)} ({c.openingBalanceType})</td>
                        <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right font-bold text-[#1E3A8A]">{formatCurrency(c.totalSales)}</td>
                        <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right font-bold text-[#047857]">{formatCurrency(c.totalReceipts)}</td>
                        <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right text-black font-bold">{formatCurrency(c.totalReturns)}</td>
                        <td className={`px-3 py-2.5 border-r border-[#E2E8F0] text-right font-bold ${c.netPending > 0 ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
                          {formatCurrency(c.netPending)}
                        </td>
                        <td className="px-3 py-2.5 text-center print:hidden">
                          <button type="button" onClick={() => handlePrintBreakdown(c.customerId, c.customerName)} disabled={printingId === c.customerId} className="text-[#3B82F6] hover:bg-blue-50 p-1.5 rounded disabled:opacity-50 transition-colors" title="Print Bill-by-Bill Breakdown">
                            {printingId === c.customerId ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-[12px] whitespace-nowrap">
                <thead>
                  <tr className="bg-[#0F172A] text-white font-bold">
                    <th className="px-3 py-2.5 border-r border-[#1E293B]">RECEIPT</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B]">DATE</th>
                    {/* <th className="px-3 py-2.5 border-r border-[#1E293B]">DEBTOR #</th> */}
                    <th className="px-3 py-2.5 border-r border-[#1E293B]">CUSTOMER NAME</th>
                    <th className="px-3 py-2.5 text-right border-r border-[#1E293B]">AMT. REC.</th>
                    <th className="px-3 py-2.5 text-right border-r border-[#1E293B]">OPEN CR</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B]">PAYMENT FOR</th>
                    <th className="px-3 py-2.5 border-r border-[#1E293B]">ON</th>
                    <th className="px-3 py-2.5 text-center border-r border-[#1E293B]">DAYS</th>
                    <th className="px-3 py-2.5 text-right border-r border-[#1E293B]">ORIG. AMT</th>
                    <th className="px-3 py-2.5 text-right border-r border-[#1E293B]">AMT. PAID</th>
                    <th className="px-3 py-2.5 text-right border-r border-[#1E293B]">OUT'DING</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLoading ? (
                    <TableLoader columns={12} />
                  ) : filteredHistory.length === 0 ? (
                    <tr><td colSpan={12} className="text-center p-6 text-black font-bold">No receipt vouchers found.</td></tr>
                  ) : (
                    paginatedList.map((r: any, idx: number) => {
                      const rowSpan = Math.max(r.allocations?.length || 1, 1);
                      const openCr = r.amount - (r.allocations?.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0) || 0);
                      
                      return (
                        <React.Fragment key={r.id}>
                          <tr className={`border-b ${r.allocations && r.allocations.length > 1 ? 'border-dashed border-[#CBD5E1]' : 'border-[#E2E8F0]'} ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                            <td rowSpan={rowSpan} className="px-3 py-2.5 border-r border-[#E2E8F0] font-bold text-[#059669] align-top">{r.receiptNo}</td>
                            <td rowSpan={rowSpan} className="px-3 py-2.5 border-r border-[#E2E8F0] text-black font-bold align-top">{formatMalaysiaDate(r.date)}</td>
                            {/* <td rowSpan={rowSpan} className="px-3 py-2.5 border-r border-[#E2E8F0] font-bold text-black align-top">{r.customer?.code || r.customerId}</td> */}
                            <td rowSpan={rowSpan} className="px-3 py-2.5 border-r border-[#E2E8F0] font-bold text-black align-top">{r.customer?.name}</td>
                            <td rowSpan={rowSpan} className="px-3 py-2.5 text-right font-bold text-[#059669] border-r border-[#E2E8F0] align-top">{formatCurrency(r.amount)}</td>
                            <td rowSpan={rowSpan} className="px-3 py-2.5 text-right font-bold text-black border-r border-[#E2E8F0] align-top">{formatCurrency(openCr > 0 ? openCr : 0)}</td>
                            
                            {r.allocations && r.allocations.length > 0 ? (
                              (() => {
                                const a = r.allocations[0];
                                const isOB = !a.saleId;
                                const invNo = isOB ? 'Opening Balance' : (a.sale?.invoiceNo || '-');
                                const rawDate = isOB ? r.customer?.createdAt : a.sale?.date;
                                const invDate = rawDate ? formatMalaysiaDate(rawDate) : '-';
                                const days = rawDate ? Math.max(0, Math.floor((new Date(r.date).getTime() - new Date(rawDate).getTime()) / (1000 * 3600 * 24))) : '-';
                                const origAmt = isOB ? Number(r.customer?.openingBalance || a.amount) : Number(a.sale?.grandTotal || 0);
                                const amtPaid = Number(a.amount || 0);
                                const outstanding = Math.max(0, origAmt - amtPaid);

                                return (
                                  <>
                                    <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black font-bold">{invNo}</td>
                                    <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black">{invDate}</td>
                                    <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-center text-black">
                                      {days}
                                    </td>
                                    <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right text-black">{formatCurrency(origAmt)}</td>
                                    <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right font-bold text-[#059669]">{formatCurrency(amtPaid)}</td>
                                    <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right text-black">
                                      {formatCurrency(outstanding)}
                                    </td>
                                  </>
                                );
                              })()
                            ) : (
                              <>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black text-center">-</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black text-center">-</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black text-center">-</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black text-center">-</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black text-center">-</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black text-center">-</td>
                              </>
                            )}
                          </tr>
                          
                          {r.allocations && r.allocations.slice(1).map((a: any, i: number) => {
                            const isOB = !a.saleId;
                            const invNo = isOB ? 'Opening Balance' : (a.sale?.invoiceNo || '-');
                            const rawDate = isOB ? r.customer?.createdAt : a.sale?.date;
                            const invDate = rawDate ? formatMalaysiaDate(rawDate) : '-';
                            const days = rawDate ? Math.max(0, Math.floor((new Date(r.date).getTime() - new Date(rawDate).getTime()) / (1000 * 3600 * 24))) : '-';
                            const origAmt = isOB ? Number(r.customer?.openingBalance || a.amount) : Number(a.sale?.grandTotal || 0);
                            const amtPaid = Number(a.amount || 0);
                            const outstanding = Math.max(0, origAmt - amtPaid);

                            return (
                              <tr key={i} className={`border-b ${i === r.allocations.length - 2 ? 'border-[#E2E8F0]' : 'border-dashed border-[#CBD5E1]'} ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black font-bold">{invNo}</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-black">{invDate}</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-center text-black">
                                  {days}
                                </td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right text-black">{formatCurrency(origAmt)}</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right font-bold text-[#059669]">{formatCurrency(amtPaid)}</td>
                                <td className="px-3 py-2.5 border-r border-[#E2E8F0] text-right text-black">
                                  {formatCurrency(outstanding)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Printable Footer */}
          <div className="pdf-footer hidden mt-6 text-right border-t border-black pt-4">
            <p className="text-xs font-bold text-black">Overall Pending Customer Dues: {formatCurrency(totalPendingDues)}</p>
          </div>

        </div>

        
      </div>
      {!consolidationLoading && !historyLoading && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalEntries={activeList.length}
            entriesPerPage={entriesPerPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
      <PdfViewerModal 
        isOpen={pdfModalOpen} 
        onClose={() => setPdfModalOpen(false)} 
        pdfUrl={pdfUrl} 
        title={pdfTitle} 
      />
    </>
  );
};

export default CustomerReceiptsReport;

















