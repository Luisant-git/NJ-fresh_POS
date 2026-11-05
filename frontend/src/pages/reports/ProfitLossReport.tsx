import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Download, Printer, Filter, PieChart as PieChartIcon, Loader2 } from 'lucide-react';
import { format, startOfMonth, startOfYear } from 'date-fns';
import { useSettings } from '../../contexts/SettingsContext';
import api from '../../services/api';
import ReportTabs from '../../components/ReportTabs';
import { exportTableToPdf, type PdfColumn } from '../../utils/exportPdf';

const ProfitLossReport = () => {
  const { formatCurrency, settings } = useSettings();
  const [fromDate, setFromDate] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [activePreset, setActivePreset] = useState<string>('month');

  const { data: pnl, isLoading, refetch } = useQuery({
    queryKey: ['profitLoss', fromDate, toDate],
    queryFn: async () => {
      const res = await api.get('/reports/profit-loss', {
        params: { fromDate, toDate }
      });
      return res.data;
    }
  });

  const handleDatePreset = (preset: string) => {
    setActivePreset(preset);
    const today = new Date();
    setToDate(format(today, 'yyyy-MM-dd'));

    if (preset === 'today') {
      setFromDate(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'month') {
      setFromDate(format(startOfMonth(today), 'yyyy-MM-dd'));
    } else if (preset === 'year') {
      setFromDate(format(startOfYear(today), 'yyyy-MM-dd'));
    } else if (preset === 'all') {
      setFromDate('2000-01-01');
    }
    setTimeout(() => refetch(), 50);
  };

  const handleCustomDateChange = (isStart: boolean, val: string) => {
    setActivePreset('custom');
    if (isStart) setFromDate(val);
    else setToDate(val);
  };

  if (!pnl && !isLoading) return <div className="p-4">Failed to load data.</div>;

  const safePnl = pnl || {
    grossSales: 0,
    totalSalesReturns: 0,
    netOperatingRevenue: 0,
    openingStockValue: 0,
    grossPurchases: 0,
    totalPurchaseReturns: 0,
    closingStockValue: 0,
    netCogs: 0,
    grossProfit: 0,
    itemizedExpenses: [],
    operatingExpensesTotal: 0,
    nonOperatingExpensesTotal: 0,
    operatingNetProfit: 0,
    netRetainedCash: 0,
    totalExpenses: 0,
    netProfit: 0,
  };

  const operatingExpenses = (safePnl.itemizedExpenses || []).filter((e: any) => e.isOperating !== false);
  const nonOperatingExpenses = (safePnl.itemizedExpenses || []).filter((e: any) => e.isOperating === false);

  const grossProfitMargin = safePnl.netOperatingRevenue > 0 ? (safePnl.grossProfit / safePnl.netOperatingRevenue) * 100 : 0;
  const operatingProfitVal = safePnl.operatingNetProfit !== undefined ? safePnl.operatingNetProfit : (safePnl.grossProfit - (safePnl.operatingExpensesTotal ?? safePnl.totalExpenses));
  const operatingProfitMargin = safePnl.netOperatingRevenue > 0 ? (operatingProfitVal / safePnl.netOperatingRevenue) * 100 : 0;
  const netRetainedVal = safePnl.netRetainedCash !== undefined ? safePnl.netRetainedCash : safePnl.netProfit;
  const netRetainedMargin = safePnl.netOperatingRevenue > 0 ? (netRetainedVal / safePnl.netOperatingRevenue) * 100 : 0;
  const isLoss = operatingProfitVal < 0;

  const exportToCsv = () => {
    const rows = [
      ['POS SUITE 360 - Profit & Loss Statement'],
      ['Period:', `${fromDate} to ${toDate}`],
      [],
      ['I. OPERATING REVENUE', 'AMOUNT'],
      ['Gross Sales', safePnl.grossSales],
      ['Sales Returns', `-${safePnl.totalSalesReturns}`],
      ['NET OPERATING REVENUE', safePnl.netOperatingRevenue],
      [],
      ['II. COST OF GOODS SOLD', 'AMOUNT'],
      ...(safePnl.openingStockValue > 0 ? [['Opening Stock Value', safePnl.openingStockValue]] : []),
      ['Add: Gross Purchases', safePnl.grossPurchases],
      ['Less: Purchase Returns', `-${safePnl.totalPurchaseReturns}`],
      ['Less: Closing Stock Value (Inventory)', `-${safePnl.closingStockValue}`],
      ['NET COST OF GOODS SOLD', safePnl.netCogs],
      ['GROSS PROFIT', safePnl.grossProfit],
      [],
      ['III. STORE OPERATING EXPENSES', 'AMOUNT'],
      ...operatingExpenses.map((e: any) => [`  ${e.name}`, e.amount]),
      ['TOTAL OPERATING EXPENSES', safePnl.operatingExpensesTotal ?? safePnl.totalExpenses],
      [],
      ['STORE OPERATING NET PROFIT', operatingProfitVal],
      ...(nonOperatingExpenses.length > 0 ? [
        [],
        ['IV. OWNER DRAWINGS & FUND TRANSFERS', 'AMOUNT'],
        ...nonOperatingExpenses.map((e: any) => [`  ${e.name} (${e.nature || 'Drawings/Transfer'})`, e.amount]),
        ['TOTAL DRAWINGS & TRANSFERS', safePnl.nonOperatingExpensesTotal],
        [],
        ['NET CASH RETAINED AFTER DRAWINGS', netRetainedVal]
      ] : [])
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `PNL_Statement_${fromDate}_to_${toDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = pnl ? [
    { name: 'Gross Sales', value: safePnl.grossSales, color: '#2563EB' },
    { name: 'Purchases', value: safePnl.grossPurchases, color: '#D97706' },
    { name: 'Closing Stock', value: safePnl.closingStockValue, color: '#10B981' },
    { name: 'Operating Exp', value: safePnl.operatingExpensesTotal ?? safePnl.totalExpenses, color: '#EF4444' },
    ...(safePnl.nonOperatingExpensesTotal > 0 ? [
      { name: 'Drawings/Fund', value: safePnl.nonOperatingExpensesTotal, color: '#8B5CF6' }
    ] : [])
  ] : [];

  const barData = pnl ? [
    { name: 'Revenue', amount: safePnl.netOperatingRevenue, fill: '#2563EB' },
    { name: 'COGS', amount: safePnl.netCogs, fill: '#D97706' },
    { name: 'Operating Exp', amount: safePnl.operatingExpensesTotal ?? safePnl.totalExpenses, fill: '#EF4444' },
    { name: 'Store Profit', amount: operatingProfitVal, fill: operatingProfitVal >= 0 ? '#10B981' : '#EF4444' },
  ] : [];

  const presetBtnClass = (preset: string) => 
    `px-2 py-0.5 text-[11px] rounded transition-colors shadow-sm font-bold ${activePreset === preset ? 'bg-[#1F2937] text-white shadow-md' : 'text-black font-bold hover:bg-white bg-transparent'}`;

  return (
    <div className="bg-[#F8FAFC] absolute inset-0 p-3 md:p-4 flex flex-col overflow-y-auto lg:overflow-hidden print:relative print:h-auto print:bg-white print:p-0 print:block">
      <div className="print:hidden shrink-0">
        <ReportTabs />
      </div>

      {/* Toolbar */}
      <div className="bg-white p-2 md:p-3 rounded shadow-sm border border-[#E5E7EB] flex flex-col gap-2 mb-2 shrink-0 print:hidden">
        {/* Row 1: Date inputs + Calculate */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-bold text-black uppercase tracking-wide flex items-center gap-1">
            <PieChartIcon size={14} /> P&L Period:
          </span>
          <div className="flex items-center gap-1 flex-1 min-w-[130px]">
            <span className="text-[12px] text-black font-bold shrink-0">From:</span>
            <input 
              type="date" 
              value={fromDate}
              onChange={(e) => handleCustomDateChange(true, e.target.value)}
              className="border border-[#D1D5DB] rounded px-2 py-0.5 text-[12px] font-bold w-full"
            />
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-[130px]">
            <span className="text-[12px] text-black font-bold shrink-0">To:</span>
            <input 
              type="date" 
              value={toDate}
              onChange={(e) => handleCustomDateChange(false, e.target.value)}
              className="border border-[#D1D5DB] rounded px-2 py-0.5 text-[12px] font-bold w-full"
            />
          </div>
          <button 
            onClick={() => refetch()}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-3 py-1.5 rounded flex items-center gap-1 font-bold text-[12px] transition-colors shadow-sm shrink-0"
          >
            <Filter size={14} /> Calculate
          </button>
        </div>

        {/* Row 2: Presets + Export buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Presets */}
          <div className="flex bg-[#F3F4F6] p-1 rounded border border-[#E5E7EB] gap-1 items-center flex-wrap">
            <button onClick={() => handleDatePreset('today')} className={presetBtnClass('today')}>Today</button>
            <button onClick={() => handleDatePreset('month')} className={presetBtnClass('month')}>This Month</button>
            <button onClick={() => handleDatePreset('year')} className={presetBtnClass('year')}>This Year</button>
            <button onClick={() => handleDatePreset('all')} className={presetBtnClass('all')}>All Time</button>
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
          <button
            onClick={exportToCsv}
            className="bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] text-green-700 px-3 py-1.5 rounded flex items-center justify-center gap-1 font-bold text-[12px] whitespace-nowrap transition-colors shadow-sm"
          >
            <Download size={14} /> <span className="hidden sm:inline">Export CSV</span>
          </button>
          <button
            onClick={() => {
              const cols: PdfColumn[] = [
                { header: 'Particulars', dataKey: 'label' },
                { header: 'Amount', dataKey: 'value' },
              ];
              const rows = [
                { label: 'I. OPERATING REVENUE', value: '' },
                { label: 'Gross Sales', value: formatCurrency(safePnl.grossSales) },
                { label: 'Sales Returns', value: `-${formatCurrency(safePnl.totalSalesReturns)}` },
                { label: 'NET OPERATING REVENUE', value: formatCurrency(safePnl.netOperatingRevenue) },
                { label: '', value: '' },
                { label: 'II. COST OF GOODS SOLD', value: '' },
                ...(safePnl.openingStockValue > 0 ? [{ label: 'Opening Stock Value', value: formatCurrency(safePnl.openingStockValue) }] : []),
                { label: 'Add: Gross Purchases', value: formatCurrency(safePnl.grossPurchases) },
                { label: 'Less: Purchase Returns', value: `-${formatCurrency(safePnl.totalPurchaseReturns)}` },
                { label: 'Less: Closing Stock Value (Inventory)', value: `-${formatCurrency(safePnl.closingStockValue)}` },
                { label: 'NET COST OF GOODS SOLD', value: formatCurrency(safePnl.netCogs) },
                { label: 'GROSS PROFIT', value: formatCurrency(safePnl.grossProfit) },
                { label: '', value: '' },
                { label: 'III. STORE OPERATING EXPENSES', value: '' },
                ...operatingExpenses.map((e: any) => ({ label: `  ${e.name}`, value: formatCurrency(e.amount) })),
                { label: 'TOTAL OPERATING EXPENSES', value: formatCurrency(safePnl.operatingExpensesTotal ?? safePnl.totalExpenses) },
                { label: '', value: '' },
                { label: 'STORE OPERATING NET PROFIT', value: formatCurrency(operatingProfitVal) },
                ...(nonOperatingExpenses.length > 0 ? [
                  { label: '', value: '' },
                  { label: 'IV. OWNER DRAWINGS & FUND TRANSFERS', value: '' },
                  ...nonOperatingExpenses.map((e: any) => ({ label: `  ${e.name} (${e.nature || 'Drawings/Transfer'})`, value: formatCurrency(e.amount) })),
                  { label: 'TOTAL DRAWINGS & TRANSFERS', value: formatCurrency(safePnl.nonOperatingExpensesTotal || 0) },
                  { label: '', value: '' },
                  { label: 'NET CASH RETAINED AFTER DRAWINGS', value: formatCurrency(netRetainedVal) }
                ] : [])
              ];
              exportTableToPdf(cols, rows, `PNL_${fromDate}_to_${toDate}`, `Profit & Loss Statement: ${fromDate} to ${toDate}`);
            }}
            className="bg-[#EF4444] hover:bg-[#DC2626] text-white px-3 py-1.5 rounded flex items-center justify-center gap-1 font-bold text-[12px] whitespace-nowrap transition-colors shadow-sm"
          >
            <Download size={14} /> <span className="hidden sm:inline">Export PDF</span>
          </button>
          <button className="bg-white border border-[#D1D5DB] hover:bg-[#F9FAFB] text-black font-bold px-3 py-1.5 rounded flex items-center justify-center gap-1 font-bold text-[12px] whitespace-nowrap transition-colors shadow-sm" onClick={() => window.print()}>
            <Printer size={14} /> <span className="hidden sm:inline">Print</span>
          </button>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 print:block overflow-y-auto lg:overflow-hidden">
        {/* Left Side: Ledger */}
        <div className="lg:col-span-8 bg-white rounded shadow-sm border border-[#E5E7EB] flex flex-col min-h-0 print:border-none print:shadow-none print:h-auto" id="pnl-report-content">
          {/* Header */}
          <div className="bg-[#1F2937] text-white px-4 py-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 shrink-0">
            <div>
              <h2 className="text-[15px] font-bold text-[#FBBF24] tracking-wide m-0 leading-tight">POS SUITE 360</h2>
              <p className="text-[10px] uppercase tracking-wider opacity-80 m-0 leading-tight">Statement of Profit and Loss (P&L Ledger)</p>
            </div>
            <div className="bg-[#F59E0B] text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
              {fromDate && toDate ? `${fromDate} to ${toDate}` : fromDate ? `From ${fromDate}` : toDate ? `Up to ${toDate}` : 'All Time'}
            </div>
          </div>

          <div className="flex-1 flex flex-col px-4 py-1.5 font-sans text-[12px] overflow-y-auto">
            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6]" />
                <span className="font-bold">Loading P&L data...</span>
              </div>
            ) : (
              <>
                {/* 1. Operating Revenue */}
                <div className="flex justify-between font-bold text-[#1E3A8A] border-b border-[#E5E7EB] pb-1 mb-1 shrink-0">
                  <div className="flex items-center gap-2"><span>I. OPERATING REVENUE</span></div>
                  <div>AMOUNT</div>
                </div>
                
                <div className="flex justify-between py-1 text-black font-bold shrink-0">
                  <span>Gross Sales Revenue (Cash & Credit Sales)</span>
                  <div className="flex gap-2">
                    <span className="text-black font-bold text-[10px] hidden sm:block text-right">Total Sales</span>
                    <span className="font-bold text-right">{formatCurrency(safePnl.grossSales)}</span>
                  </div>
                </div>
                
                <div className="flex justify-between py-1 text-[#EF4444] border-b border-[#F3F4F6] mb-1 shrink-0">
                  <span>Less: Sales Returns</span>
                  <div className="flex gap-2">
                    <span className="opacity-70 text-[10px] hidden sm:block text-right">Returns</span>
                    <span className="font-bold text-right">- {formatCurrency(safePnl.totalSalesReturns)}</span>
                  </div>
                </div>

                <div className="flex justify-between py-1 text-[#2563EB] font-bold text-[13px] bg-blue-50/50 px-2 rounded mb-2 shrink-0">
                  <span>NET OPERATING REVENUE</span>
                  <span>{formatCurrency(safePnl.netOperatingRevenue)}</span>
                </div>

                {/* 2. COGS */}
                <div className="flex justify-between font-bold text-[#D97706] border-b border-[#E5E7EB] pb-1 mb-1 shrink-0">
                  <div className="flex items-center gap-2"><span>II. COST OF GOODS SOLD (COGS)</span></div>
                  <div>AMOUNT</div>
                </div>

                {safePnl.openingStockValue > 0 && (
                  <div className="flex justify-between py-1 text-black font-bold shrink-0">
                    <span>Opening Stock Value</span>
                    <div className="flex gap-2">
                      <span className="text-black font-bold text-[10px] hidden sm:block text-right">Beg. Stock</span>
                      <span className="font-bold text-right">{formatCurrency(safePnl.openingStockValue)}</span>
                    </div>
                  </div>
                )}
                
                <div className="flex justify-between py-1 text-black font-bold shrink-0">
                  <span>Add: Gross Purchases</span>
                  <div className="flex gap-2">
                    <span className="text-black font-bold text-[10px] hidden sm:block text-right">Purchases</span>
                    <span className="font-bold text-right">{formatCurrency(safePnl.grossPurchases)}</span>
                  </div>
                </div>
                
                <div className="flex justify-between py-1 text-[#059669] shrink-0">
                  <span>Less: Purchase Returns</span>
                  <div className="flex gap-2">
                    <span className="opacity-70 text-[10px] hidden sm:block text-right">Returns</span>
                    <span className="font-bold text-right">- {formatCurrency(safePnl.totalPurchaseReturns)}</span>
                  </div>
                </div>

                <div className="flex justify-between py-1 text-[#059669] shrink-0">
                  <span>Less: Closing Stock Value (Inventory on Hand)</span>
                  <div className="flex gap-2">
                    <span className="opacity-70 text-[10px] hidden sm:block text-right">Stock Value</span>
                    <span className="font-bold text-right">- {formatCurrency(safePnl.closingStockValue)}</span>
                  </div>
                </div>

                <div className="flex justify-between py-1 font-bold text-[13px] px-2 mb-2 text-black font-bold bg-[#F9FAFB] rounded shrink-0">
                  <span>NET COST OF GOODS SOLD (COGS)</span>
                  <span>{formatCurrency(safePnl.netCogs)}</span>
                </div>

                <div className="flex justify-between py-1.5 text-black font-bold text-[14px] border-y-2 border-[#E5E7EB] mb-2 items-center px-2 shrink-0">
                  <span>GROSS PROFIT (NET REVENUE - COGS)</span>
                  <div className="flex flex-col items-end leading-tight">
                    <span className={safePnl.grossProfit >= 0 ? 'text-green-700 font-bold' : 'text-red-600 font-bold'}>{formatCurrency(safePnl.grossProfit)}</span>
                    <span className="text-[10px] text-black font-bold font-normal">({grossProfitMargin.toFixed(1)}%)</span>
                  </div>
                </div>

                {/* 3. Operating Expenses */}
                <div className="flex justify-between font-bold text-black font-bold border-b border-[#E5E7EB] pb-1 mb-1 shrink-0">
                  <div className="flex items-center gap-2"><span>III. STORE OPERATING EXPENSES</span></div>
                  <div>AMOUNT</div>
                </div>

                {operatingExpenses.length === 0 ? (
                  <div className="py-1 text-gray-500 italic text-[11px]">No operating expenses recorded in this period.</div>
                ) : (
                  operatingExpenses.map((exp: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-0.5 text-black font-medium text-[12px] shrink-0 border-b border-gray-50">
                      <span className="pl-1">• {exp.name}</span>
                      <span className="font-bold text-right">{formatCurrency(exp.amount)}</span>
                    </div>
                  ))
                )}

                <div className="flex justify-between py-1 font-bold text-[13px] px-2 mt-1 mb-2 text-black font-bold bg-gray-50 rounded shrink-0">
                  <span>TOTAL OPERATING EXPENSES</span>
                  <span className="text-[#EF4444]">{formatCurrency(safePnl.operatingExpensesTotal ?? safePnl.totalExpenses)}</span>
                </div>

                {/* Operating Net Profit Line */}
                <div className="flex justify-between py-1.5 text-black font-bold text-[13px] bg-emerald-50/90 border border-emerald-200 rounded px-2 mb-2 items-center shrink-0">
                  <span className="text-emerald-900">STORE OPERATING NET PROFIT</span>
                  <div className="flex flex-col items-end leading-tight">
                    <span className={operatingProfitVal >= 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                      {formatCurrency(operatingProfitVal)}
                    </span>
                    <span className="text-[10px] text-emerald-800 font-normal">({operatingProfitMargin.toFixed(1)}%)</span>
                  </div>
                </div>

                {/* 4. Owner Drawings & Fund Transfers */}
                {nonOperatingExpenses.length > 0 && (
                  <div className="mt-1 mb-2">
                    <div className="flex justify-between font-bold text-[#4B5563] border-b border-[#E5E7EB] pb-1 mb-1 shrink-0">
                      <div className="flex items-center gap-2"><span>IV. OWNER DRAWINGS & FUND TRANSFERS</span></div>
                      <div>AMOUNT</div>
                    </div>

                    {nonOperatingExpenses.map((exp: any, idx: number) => (
                      <div key={idx} className="flex justify-between py-0.5 text-[#374151] text-[12px] shrink-0 border-b border-gray-50">
                        <div className="flex flex-col pl-1">
                          <span className="font-semibold">• {exp.name}</span>
                          {exp.nature && <span className="text-[10px] text-gray-500 italic">{exp.nature}</span>}
                        </div>
                        <span className="font-bold text-right text-gray-700">{formatCurrency(exp.amount)}</span>
                      </div>
                    ))}

                    <div className="flex justify-between py-1 font-bold text-[13px] px-2 mt-1 text-black font-bold bg-amber-50/80 rounded shrink-0">
                      <span>TOTAL DRAWINGS & TRANSFERS</span>
                      <span className="text-[#D97706]">{formatCurrency(safePnl.nonOperatingExpensesTotal || 0)}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* Footer - Net Profit */}
          <div className={`${isLoss ? 'bg-[#EF4444]' : 'bg-[#10B981]'} text-white px-4 py-2.5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 shrink-0`}>
            <div>
              <h3 className="text-[15px] sm:text-[18px] font-bold tracking-wider m-0 leading-tight">
                {isLoss ? 'STORE OPERATING NET LOSS' : 'STORE OPERATING NET PROFIT'}
              </h3>
              <p className="text-[10px] opacity-90 m-0 leading-tight mt-0.5">Gross Profit less Store Operating Expenses</p>
            </div>
            <div className="flex flex-col items-end leading-tight">
              <span className="text-[22px] font-bold">{formatCurrency(operatingProfitVal)}</span>
              <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold mt-0.5">Operating Margin: {operatingProfitMargin.toFixed(1)}%</span>
            </div>
          </div>
          {nonOperatingExpenses.length > 0 && (
            <div className="bg-[#1F2937] text-gray-200 px-4 py-1.5 flex justify-between items-center text-[11px] font-bold shrink-0 border-t border-gray-700">
              <span className="text-gray-300">Net Retained Cash (After Owner Profit Drawings & Fund Transfers):</span>
              <span className={netRetainedVal >= 0 ? 'text-emerald-400 text-[13px]' : 'text-rose-400 text-[13px]'}>
                {formatCurrency(netRetainedVal)} ({netRetainedMargin.toFixed(1)}%)
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Charts & Analytics */}
        <div className="lg:col-span-4 flex flex-col gap-3 min-h-0 print:hidden">
          
          <div className="bg-white p-3 rounded shadow-sm border border-[#E5E7EB] flex-1 flex flex-col min-h-0">
            <h3 className="text-[12px] font-bold text-[#1E3A8A] uppercase mb-2 flex items-center gap-1 shrink-0">
              <PieChartIcon size={14} /> Revenue vs Cost Breakdown
            </h3>
            <div className="flex-1 w-full relative min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                {['today', 'month', 'custom'].includes(activePreset) ? (
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="name" tick={{fontSize: 9}} interval={0} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(val) => `${settings?.currencySymbol || 'RM'} ${Number(val).toLocaleString()}`} tick={{fontSize: 9}} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{fill: 'transparent'}} formatter={(val) => formatCurrency(val as number)} contentStyle={{ fontSize: '11px', borderRadius: '4px' }} />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      {barData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie
                      data={chartData.filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(value)} />
                    <Legend verticalAlign="bottom" height={24} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                )}
              </ResponsiveContainer>
              {safePnl.netOperatingRevenue === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-black font-bold text-[11px] font-bold italic">
                  No data to display
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-3 rounded shadow-sm border border-[#E5E7EB] shrink-0">
            <h3 className="text-[12px] font-bold text-[#D97706] uppercase mb-2 flex items-center gap-1">
               Key Financial Ratios
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded p-1.5 text-center">
                <p className="text-[10px] font-bold text-black font-bold mb-0.5">Gross Margin</p>
                <p className={`text-[15px] font-bold leading-none ${grossProfitMargin < 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {grossProfitMargin.toFixed(1)}%
                </p>
              </div>
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded p-1.5 text-center">
                <p className="text-[10px] font-bold text-black font-bold mb-0.5">Operating Margin</p>
                <p className={`text-[15px] font-bold leading-none ${operatingProfitMargin < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {operatingProfitMargin.toFixed(1)}%
                </p>
              </div>
              <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded p-1.5 text-center">
                <p className="text-[10px] font-bold text-black font-bold mb-0.5">Retained Margin</p>
                <p className={`text-[15px] font-bold leading-none ${netRetainedMargin < 0 ? 'text-amber-500' : 'text-blue-600'}`}>
                  {netRetainedMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default ProfitLossReport;
