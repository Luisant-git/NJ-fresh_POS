import { getMalaysiaDateStr } from '../../utils/date';
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import TableLoader from '../../components/TableLoader';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save, X, Filter, FileText, Maximize2, Minimize2, Download, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Select from 'react-select';
import * as XLSX from 'xlsx';
import api from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import { generateBillByBillPdf } from '../../utils/pdfGenerator';
import PdfViewerModal from '../../components/PdfViewerModal';

const receiptSchema = z.object({
  receiptNo: z.string(),
  date: z.string(),
  customerId: z.coerce.number().min(1, 'Customer is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  paymentTypeId: z.coerce.number().min(1, 'Payment Type is required'),
  reference: z.string().optional(),
  remarks: z.string().optional(),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

const CustomerReceipts = () => {
  const { formatCurrency } = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filters for History Table
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [currentBalance, setCurrentBalance] = useState(0);
  const [unpaidBills, setUnpaidBills] = useState<any[]>([]);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [billFilter, setBillFilter] = useState<'Unpaid' | 'Paid' | 'All'>('Unpaid');
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<number | null>(null);

  // PDF Modal State
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('Bill-by-Bill Breakdown');

  // Pagination for History
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: storeSettings } = useQuery({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings')).data });

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema) as any,
    defaultValues: {
      receiptNo: 'Generating...',
      date: getMalaysiaDateStr(),
      customerId: 0,
      amount: '' as any,
      paymentTypeId: 0,
      reference: '',
      remarks: '',
    }
  });

  const selectedCustomerId = watch('customerId');
  const amountCollected = watch('amount') || 0;

  // Master Data
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: async () => (await api.get('/customers')).data });
  const { data: paymentTypes = [] } = useQuery({ queryKey: ['paymentTypes'], queryFn: async () => (await api.get('/payment-types')).data });
  const { data: nextReceiptNoData } = useQuery({ queryKey: ['nextReceiptNo'], queryFn: async () => (await api.get('/customer-receipts/next-receipt-no')).data });
  
  // History Data
  const { data: receipts = [], isLoading: historyLoading } = useQuery({
    queryKey: ['customerReceipts'],
    queryFn: async () => (await api.get('/customer-receipts')).data
  });

  useEffect(() => {
    if (nextReceiptNoData?.receiptNo) {
      setValue('receiptNo', nextReceiptNoData.receiptNo);
    }
  }, [nextReceiptNoData, setValue]);

  // Fetch balance dynamically when customer changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (selectedCustomerId && selectedCustomerId > 0) {
        try {
          let balUrl = `/customer-receipts/balance/${selectedCustomerId}`;
          if (editingId) {
            balUrl += `?excludeReceiptId=${editingId}`;
          }
          const res = await api.get(balUrl);
          setCurrentBalance(res.data.balance);
          
          let url = `/customer-receipts/unpaid-bills/${selectedCustomerId}`;
          if (editingId) {
            url += `?excludeReceiptId=${editingId}`;
          }
          const billsRes = await api.get(url);
          setUnpaidBills(billsRes.data);
        } catch (error) {
          console.error(error);
          setCurrentBalance(0);
          setUnpaidBills([]);
          setAllocations({});
        }
      } else {
        setCurrentBalance(0);
        setUnpaidBills([]);
        setShowBreakdown(false);
        setAllocations({});
      }
    };
    fetchBalance();
  }, [selectedCustomerId, editingId]);

  const createMutation = useMutation({
    mutationFn: (data: ReceiptFormValues) => api.post('/customer-receipts', data),
    onSuccess: () => {
      toast.success('Receipt recorded successfully!');
      queryClient.invalidateQueries({ queryKey: ['customerReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['nextReceiptNo'] });
      reset();
      setCurrentBalance(0);
      setAllocations({});
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to record receipt. Please check your inputs.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number, payload: any }) => api.put(`/customer-receipts/${data.id}`, data.payload),
    onSuccess: () => {
      toast.success('Receipt updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['customerReceipts'] });
      reset();
      setEditingId(null);
      setCurrentBalance(0);
      setAllocations({});
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to update receipt.');
    }
  });

  const onSubmit = (data: ReceiptFormValues) => {
    const totalAlloc = Object.values(allocations).reduce((sum, curr) => sum + (Number(curr) || 0), 0);
    const enteredAmount = Number(data.amount) || 0;
    if (totalAlloc > enteredAmount + 0.009) {
      toast.error(`Total allocated amount (${formatCurrency(totalAlloc)}) cannot exceed collection amount (${formatCurrency(enteredAmount)})`);
      return;
    }

    const payload = {
      ...data,
      allocations: Object.entries(allocations).map(([saleId, amount]) => ({
        saleId: saleId === 'OB' ? null : saleId,
        amount
      }))
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload as any);
    }
  };

  const onError = (errors: any) => {
    console.error(errors);
    toast.error('Please fill all required fields correctly.');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault();
        handleSubmit(onSubmit as any, onError)();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit, onSubmit]);

  // Filter history
  const filteredHistory = receipts.filter((r: any) => {
    if (filterCustomer && r.customerId.toString() !== filterCustomer) return false;
    
    if (filterFromDate || filterToDate) {
      const d = new Date(r.date);
      const tzDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
      const dateStr = `${tzDate.getFullYear()}-${String(tzDate.getMonth() + 1).padStart(2, '0')}-${String(tzDate.getDate()).padStart(2, '0')}`;
      if (filterFromDate && dateStr < filterFromDate) return false;
      if (filterToDate && dateStr > filterToDate) return false;
    }
    
    return true;
  });

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterCustomer, filterFromDate, filterToDate]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExportExcel = () => {
    const exportData = filteredHistory.map((r: any) => ({
      'Receipt No': r.receiptNo,
      'Date': getMalaysiaDateStr(r.date),
      'Customer': r.customer?.name || 'Unknown',
      'Payment Type': r.paymentType?.name || 'Unknown',
      'Amount Collected': r.amount,
      'Reference': r.reference || '',
      'Remarks': r.remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Receipts History");
    XLSX.writeFile(wb, "Customer_Receipts_History.xlsx");
  };

  return (
    <div className="bg-[#F8FAFC] min-h-[calc(100vh-64px)] p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0 mb-4 print:hidden">
        <div>
          <h1 className="text-[16px] md:text-xl font-bold text-[#059669] flex items-center gap-2">
            <span className="bg-[#059669] text-white p-1 rounded"><FileText size={16} /></span>
            CUSTOMER COLLECTION RECEIPTS
          </h1>
          <p className="text-[12px] text-black font-bold mt-1">Record customer credit collections and payment receipts</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button type="button" onClick={() => navigate('/sales')} className="bg-[#EFF6FF] text-[#2563EB] font-bold text-[13px] px-4 py-2 rounded border border-[#BFDBFE] hover:bg-[#DBEAFE] flex items-center gap-1 transition-colors flex-1 md:flex-none justify-center">
            Sales Hub
          </button>
          <button type="button" onClick={() => navigate(-1)} className="bg-[#FEF2F2] text-[#E11D48] font-bold text-[13px] px-4 py-2 rounded border border-[#FECDD3] hover:bg-[#FFE4E6] flex items-center gap-1 transition-colors flex-1 md:flex-none justify-center">
            <X size={14} /> Close
          </button>
        </div>
      </div>

      {/* Dark overlay when expanded */}
      {isTableExpanded && <div className="fixed inset-0 bg-black/60 z-40 transition-opacity" onClick={() => setIsTableExpanded(false)} />}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 print:flex print:flex-col print:w-full print:block">
        {/* Left Side - New Entry Form */}
        <div className={`bg-white border border-[#E2E8F0] shadow-sm rounded-lg overflow-hidden ${isTableExpanded ? 'hidden' : 'block'} print:border-none print:shadow-none print:w-full`}>
          <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 py-3 flex items-center gap-2 print:hidden">
            <FileText size={16} className="text-black font-bold" />
            <h2 className="font-bold text-[13px] text-black font-bold">{editingId ? 'EDIT RECEIPT ENTRY' : 'NEW RECEIPT ENTRY'}</h2>
          </div>
          
          <form onSubmit={handleSubmit(onSubmit as any, onError)} className="p-4 flex flex-col gap-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Receipt No</label>
                <input
                  {...register('receiptNo')}
                  readOnly
                  className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#CBD5E1] rounded text-[13px] font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Receipt Date *</label>
                <input
                  {...register('date')}
                  type="date"
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded text-[13px] outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>

            <div className="print:hidden">
              <label className="block text-[12px] font-bold text-[#2563EB] mb-1">Customer Name (Searchable) *</label>
              <Controller
                name="customerId"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={[
                      { value: 0, label: 'Type customer name / mobile number...' },
                      ...customers.map((c: any) => ({
                        value: c.id,
                        label: `${c.name} - ${c.phone || 'No Phone'}`
                      }))
                    ]}
                    value={field.value ? { value: field.value, label: customers.find((c: any) => c.id === field.value)?.name || 'Select...' } : null}
                    onChange={(val: any) => field.onChange(val?.value || 0)}
                    className="text-[13px] font-bold"
                    styles={{
                      control: (base: any) => ({
                        ...base,
                        minHeight: '38px',
                        borderColor: '#CBD5E1',
                        borderRadius: '0.25rem',
                      }),
                      singleValue: (base: any) => ({
                        ...base,
                        color: '#000000', // Dark black as requested
                        fontWeight: 'bold',
                      }),
                      input: (base: any) => ({
                        ...base,
                        color: '#000000',
                      }),
                      option: (base: any, state: any) => ({
                        ...base,
                        color: state.isSelected ? '#ffffff' : '#000000',
                        backgroundColor: state.isSelected ? '#3B82F6' : base.backgroundColor,
                      })
                    }}
                  />
                )}
              />
            </div>

            {selectedCustomerId > 0 && (
              <div className="flex flex-col gap-3">
                <div className="border border-[#CBD5E1] rounded-lg overflow-hidden bg-white shadow-sm print:hidden">
                  <div className="bg-[#F8FAFC] px-4 py-3 border-b border-[#CBD5E1] flex justify-between items-center">
                    <span className="text-[13px] font-bold text-black font-bold flex items-center gap-2">
                      <FileText size={16} className="text-black font-bold" /> Outstanding Summary
                    </span>
                    <button 
                      type="button"
                      onClick={() => setShowBreakdown(!showBreakdown)}
                      className="border border-[#059669] text-[#059669] bg-white px-3 py-1.5 rounded font-bold text-[12px] hover:bg-[#ECFDF5] flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      Bill-by-Bill Breakdown
                    </button>
                  </div>
                  
                  <div className="p-4 flex flex-col gap-3">
                    {/* Removed Total Amount Bal and Sales Return summaries as per user request */}
                    
                    <div className="flex justify-between items-center">
                      <span className="text-[14px] font-bold text-black font-bold">Over All Outstanding Balance</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[18px] font-bold text-[#059669]">
                          {formatCurrency(currentBalance)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {showBreakdown && (
                  <div className="border border-[#10B981] rounded-lg overflow-hidden bg-white print:border-none print:shadow-none print:m-0 print:w-full">
                    
                    {/* Print Only Header for Context */}
                    <div className="hidden print:block mb-4 text-black border-b border-black pb-2">
                      <h2 className="text-xl font-bold uppercase">Customer: {customers.find((c: any) => c.id === selectedCustomerId)?.name}</h2>
                      <p className="text-sm font-bold">Date: {new Date().toLocaleDateString()}</p>
                    </div>

                    <div className="bg-[#10B981] text-white px-3 py-2 flex justify-between items-center text-[12px] font-bold flex-wrap gap-2 print:text-black print:bg-white print:border-b print:border-black print:px-0">
                      <div className="flex items-center gap-2"><FileText size={14} className="print:hidden" /> BILL-BY-BILL BREAKDOWN</div>
                      <div className="flex items-center gap-2 print:hidden">
                        <select 
                          value={billFilter}
                          onChange={(e: any) => setBillFilter(e.target.value)}
                          className="text-[#10B981] bg-white rounded px-2 py-0.5 outline-none text-[10px]"
                        >
                          <option value="Unpaid">Unpaid Bills</option>
                          <option value="Paid">Paid Bills</option>
                          <option value="All">All Bills</option>
                        </select>
                        <span className="bg-white text-[#10B981] px-2 py-0.5 rounded-full text-[10px]">
                          {unpaidBills.filter(b => billFilter === 'All' ? true : billFilter === 'Paid' ? b.pending < 0.01 : b.pending >= 0.01).length} Bills
                        </span>
                        <button 
                          type="button" 
                          onClick={() => {
                            const displayedBills = unpaidBills.filter(b => billFilter === 'All' ? true : billFilter === 'Paid' ? b.pending < 0.01 : b.pending >= 0.01);
                            const totals = displayedBills.reduce((acc, bill) => {
                              acc.total += Number(bill.total || 0);
                              acc.returned += Number(bill.returned || 0);
                              acc.received += Number(bill.received || 0);
                              acc.pending += Number(bill.pending || 0);
                              return acc;
                            }, { total: 0, returned: 0, received: 0, pending: 0 });
                            const customer = customers.find((c: any) => c.id === selectedCustomerId);
                            const companyName = storeSettings?.shopName || 'NJ FRESH AND FROZEN SDN BHD';
                            let reportTitle = 'PENDING BALANCE BILL BY BILL';
                            if (billFilter === 'Paid') reportTitle = 'PAID BILL BY BILL';
                            if (billFilter === 'All') reportTitle = 'ALL BILLS BY BILL';
                            const url = generateBillByBillPdf(companyName, customer?.name || 'Unknown', 'Customer', displayedBills, totals, reportTitle) as unknown as string;
                            setPdfUrl(url);
      setPdfTitle(`${customer?.name} - Bill by Bill`);
                            setPdfModalOpen(true);
                          }}
                          className="bg-white text-[#10B981] hover:bg-gray-100 p-1 rounded transition-colors"
                          title="Print Breakdown"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto overflow-x-auto print:max-h-none print:overflow-visible">
                      <table className="w-full text-left text-[12px] whitespace-nowrap">
                        <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-bold text-black uppercase">Type</th>
                            <th className="px-3 py-2 font-bold text-black uppercase">Invoice No.</th>
                            <th className="px-3 py-2 font-bold text-black uppercase">Date</th>
                            <th className="px-3 py-2 font-bold text-black uppercase">Reference No.</th>
                            <th className="px-3 py-2 font-bold text-black text-right uppercase">Amount</th>
                            <th className="px-3 py-2 font-bold text-black text-right uppercase">Outstanding</th>
                            <th className="px-3 py-2 font-bold text-[#3B82F6] text-right uppercase print:hidden">Payment</th>
                            <th className="px-3 py-2 font-bold text-black text-center uppercase print:hidden">Matched</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const displayedBills = unpaidBills.filter(b => billFilter === 'All' ? true : billFilter === 'Paid' ? b.pending < 0.01 : b.pending >= 0.01);
                            
                            return displayedBills.length > 0 ? displayedBills.map((bill, idx) => {
                              const currentPending = bill.pending;
                              const payingNow = allocations[bill.id] || 0;
                              const isCleared = currentPending === 0;
                              
                              return (
                                <tr key={bill.id || idx} className={`border-b border-[#E2E8F0] hover:bg-[#F8FAFC] ${isCleared ? 'bg-[#ECFDF5]' : ''}`}>
                                  <td className="px-3 py-2 font-bold text-[#3B82F6]">INV</td>
                                  <td className="px-3 py-2 font-bold text-black">
                                    {bill.entryNo}
                                  </td>
                                  <td className="px-3 py-2 text-black font-bold">{getMalaysiaDateStr(bill.date)}</td>
                                  <td className="px-3 py-2 text-black">-</td>
                                  <td className="px-3 py-2 text-right text-black font-bold">{formatCurrency(bill.total)}</td>
                                  <td className="px-3 py-2 text-right font-bold text-[#059669]">{formatCurrency(bill.pending)}</td>
                                  <td className="px-2 py-1 text-right print:hidden">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max={currentPending}
                                      value={allocations[bill.id] || ''}
                                      disabled={isCleared}
                                      onChange={(e) => {
                                        let val = parseFloat(e.target.value);
                                        if (isNaN(val)) val = 0;
                                        if (val > currentPending) val = currentPending;
                                        const newAllocations = { ...allocations, [bill.id]: val };
                                        setAllocations(newAllocations);
                                        const newTotal = (Object.values(newAllocations) as number[]).reduce((sum: number, curr: number) => sum + (curr || 0), 0);
                                        setValue('amount', newTotal as any, { shouldValidate: true });
                                      }}
                                      placeholder="0.00"
                                      className={`w-[100px] text-right px-2 py-1 border rounded text-[13px] font-bold outline-none focus:border-[#059669] ${payingNow > 0 ? 'bg-[#ECFDF5] border-[#059669] text-[#059669]' : 'bg-white border-[#CBD5E1]'}`}
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center print:hidden">
                                    <input
                                      type="checkbox"
                                      checked={payingNow === currentPending && currentPending > 0}
                                      disabled={isCleared}
                                      onChange={(e) => {
                                        const isChecked = e.target.checked;
                                        const val = isChecked ? currentPending : 0;
                                        const newAllocations = { ...allocations, [bill.id]: val };
                                        setAllocations(newAllocations);
                                        const newTotal = (Object.values(newAllocations) as number[]).reduce((sum: number, curr: number) => sum + (curr || 0), 0);
                                        setValue('amount', newTotal as any, { shouldValidate: true });
                                      }}
                                      className="w-4 h-4 text-[#3B82F6] bg-gray-100 border-gray-300 rounded focus:ring-[#3B82F6] cursor-pointer disabled:cursor-not-allowed"
                                    />
                                  </td>
                                </tr>
                              );
                            }) : (
                              <tr>
                                <td colSpan={8} className="px-3 py-4 text-center text-black font-bold italic">No {billFilter.toLowerCase()} bills found.</td>
                              </tr>
                            );
                          })()}
                        </tbody>
                        <tfoot className="bg-[#F8FAFC] border-t-2 border-[#E2E8F0] sticky bottom-0 z-10 print:table-row-group">
                          {(() => {
                            const displayedBills = unpaidBills.filter(b => billFilter === 'All' ? true : billFilter === 'Paid' ? b.pending < 0.01 : b.pending >= 0.01);
                            const totals = displayedBills.reduce((acc, bill) => {
                              acc.total += Number(bill.total || 0);
                              acc.returned += Number(bill.returned || 0);
                              acc.received += Number(bill.received || 0);
                              acc.pending += Number(bill.pending || 0);
                              return acc;
                            }, { total: 0, returned: 0, received: 0, pending: 0 });
                            
                            if (displayedBills.length === 0) return null;
                            
                            return (
                              <tr>
                                <td colSpan={4} className="px-3 py-2 text-right font-bold text-black uppercase">Totals:</td>
                                <td className="px-3 py-2 text-right font-bold text-black">{formatCurrency(totals.total)}</td>
                                <td className="px-3 py-2 text-right font-bold text-[#059669]">{formatCurrency(totals.pending)}</td>
                                <td className="px-3 py-2 text-right font-bold text-[#3B82F6] print:hidden">
                                  {formatCurrency(Object.values(allocations).reduce((sum: any, curr: any) => sum + (curr || 0), 0))}
                                </td>
                                <td className="print:hidden"></td>
                              </tr>
                            );
                          })()}
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
              <div>
                <label className="block text-[12px] font-bold text-[#059669] mb-1">Amount Collected Now *</label>
                <input
                  {...register('amount')}
                  type="number" step="0.01"
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded text-[15px] font-bold outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Remaining Balance After Receipt</label>
                <div className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded text-[13px] font-bold text-black font-bold">
                  {formatCurrency(currentBalance - amountCollected)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">PAYMENT TYPE *</label>
                <select
                  {...register('paymentTypeId')}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded shadow-sm focus:border-[#059669] outline-none text-[13px] bg-white"
                >
                  <option value={0}>Select Type</option>
                  {paymentTypes.map((pt: any) => (
                    <option key={pt.id} value={pt.id}>{pt.name}</option>
                  ))}
                </select>
                {errors.paymentTypeId && <span className="text-red-500 text-[11px] mt-1 block">{errors.paymentTypeId.message}</span>}
              </div>
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Reference / Cheque No (Optional for Cash)</label>
                <input
                  {...register('reference')}
                  type="text"
                  placeholder="Optional for Cash / Mandatory for UPI/Cheque..."
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded text-[13px] outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>

            <div className="print:hidden">
              <label className="block text-[12px] font-bold text-black font-bold mb-1">Remarks (Optional)</label>
              <input
                {...register('remarks')}
                type="text"
                placeholder="Optional remarks..."
                className="w-full px-3 py-2 border border-[#CBD5E1] rounded text-[13px] outline-none focus:border-[#3B82F6]"
              />
            </div>

            <div className="flex justify-end mt-2 print:hidden gap-2">
              {editingId && (
                <button 
                  type="button" 
                  onClick={() => {
                    reset({
                      receiptNo: nextReceiptNoData?.receiptNo || 'Generating...',
                      date: getMalaysiaDateStr(),
                      customerId: 0,
                      paymentTypeId: 0,
                      amount: 0 as any,
                      reference: '',
                      remarks: ''
                    });
                    setEditingId(null);
                    setAllocations({});
                    queryClient.invalidateQueries({ queryKey: ['nextReceiptNo'] });
                  }}
                  className="bg-[#F1F5F9] text-black hover:bg-[#E2E8F0] px-4 py-2 rounded font-bold text-[12px] md:text-[14px] flex items-center justify-center gap-2 transition-colors w-full md:w-auto border border-[#CBD5E1]"
                >
                  <X size={14} /> CANCEL
                </button>
              )}
              <button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-[#059669] hover:bg-[#047857] text-white px-4 py-2 rounded font-bold text-[12px] md:text-[14px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 w-full md:w-auto"
              >
                <Save size={14} /> {editingId ? 'UPDATE RECEIPT (F10)' : 'SAVE RECEIPT (F10)'}
              </button>
            </div>

          </form>
        </div>

        {/* Right Side - History Table */}
        <div className={`bg-white border border-[#E2E8F0] shadow-sm flex flex-col ${isTableExpanded ? 'fixed inset-4 lg:inset-8 z-50 rounded-xl shadow-2xl' : 'rounded-lg overflow-hidden lg:col-span-1'} print:hidden`}>
          <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-black font-bold" />
              <h2 className="font-bold text-[13px] text-black font-bold">RECEIPTS HISTORY</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-[#059669] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {filteredHistory.length} Receipts
              </div>
              <button 
                type="button" 
                onClick={() => setIsTableExpanded(!isTableExpanded)}
                className="text-black font-bold hover:text-[#059669] transition-colors ml-1"
                title={isTableExpanded ? "Minimize Table" : "View Full Table"}
              >
                {isTableExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>

          <div className="p-3 border-b border-[#E2E8F0] grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select
              value={filterCustomer ? { value: filterCustomer, label: customers.find((c: any) => c.id.toString() === filterCustomer)?.name || '-- All Customers --' } : null}
              onChange={(option: any) => setFilterCustomer(option ? option.value.toString() : '')}
              options={[
                { value: '', label: '-- All Customers --' },
                ...customers.map((c: any) => ({
                  value: c.id.toString(),
                  label: c.name
                }))
              ]}
              isClearable
              placeholder="-- All Customers --"
              styles={{
                control: (base) => ({ ...base, minHeight: '34px', height: '34px', fontSize: '12px', borderColor: '#CBD5E1' }),
                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                input: (base) => ({ ...base, margin: '0', padding: '0' })
              }}
            />
            <input
              type="date"
              value={filterFromDate}
              onChange={(e) => setFilterFromDate(e.target.value)}
              className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded text-[12px] outline-none focus:border-[#3B82F6]"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="w-full px-2 py-1.5 border border-[#CBD5E1] rounded text-[12px] outline-none focus:border-[#3B82F6]"
              />
              <button type="button" className="bg-[#059669] hover:bg-[#047857] text-white px-3 rounded flex items-center justify-center transition-colors" title="Apply Filter">
                <Filter size={14} />
              </button>
              {isTableExpanded && (
                <button 
                  type="button" 
                  onClick={handleExportExcel}
                  className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white px-3 rounded flex items-center justify-center transition-colors" 
                  title="Export Excel"
                >
                  <Download size={14} />
                </button>
              )}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="bg-white border-b border-[#E2E8F0] p-2 px-3 flex justify-between items-center print:hidden">
              <span className="text-[12px] text-gray-500 font-bold">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} entries
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  className="p-1 border border-[#CBD5E1] rounded text-black hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-3 text-[12px] font-bold text-black">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  className="p-1 border border-[#CBD5E1] rounded text-black hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto bg-[#F8FAFC] overflow-x-auto">
            <table className="w-full text-left text-[12px] whitespace-nowrap">
              <thead>
                <tr className="bg-[#1E293B] text-white font-bold">
                  <th className="px-3 py-2 border-r border-[#334155]">RECEIPT</th>
                  <th className="px-3 py-2 border-r border-[#334155]">DATE</th>
                  {/* <th className="px-3 py-2 border-r border-[#334155]">DEBTOR #</th> */}
                  <th className="px-3 py-2 border-r border-[#334155]">CUSTOMER NAME</th>
                  <th className="px-3 py-2 text-right border-r border-[#334155]">AMT. REC.</th>
                  <th className="px-3 py-2 text-right border-r border-[#334155]">OPEN CR</th>
                  <th className="px-3 py-2 border-r border-[#334155]">PAYMENT FOR</th>
                  <th className="px-3 py-2 border-r border-[#334155]">ON</th>
                  <th className="px-3 py-2 text-center border-r border-[#334155]">DAYS</th>
                  <th className="px-3 py-2 text-right border-r border-[#334155]">ORIG. AMT</th>
                  <th className="px-3 py-2 text-right border-r border-[#334155]">AMT. PAID</th>
                  <th className="px-3 py-2 text-right border-r border-[#334155]">OUT'DING</th>
                  {storeSettings?.allowEditReceipts && <th className="px-3 py-2 text-center w-20">Action</th>}
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <TableLoader columns={storeSettings?.allowEditReceipts ? 13 : 12} text="Loading history..." />
                ) : filteredHistory.length === 0 ? (
                  <tr><td colSpan={storeSettings?.allowEditReceipts ? 13 : 12} className="text-center p-4 text-black font-bold">No receipt records found.</td></tr>
                ) : (
                  paginatedHistory.map((r: any, idx: number) => {
                    const rowSpan = Math.max(r.allocations?.length || 1, 1);
                    const openCr = r.amount - (r.allocations?.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0) || 0);
                    
                    return (
                      <React.Fragment key={r.id}>
                        <tr className={`border-b ${r.allocations && r.allocations.length > 1 ? 'border-dashed border-[#CBD5E1]' : 'border-[#E2E8F0]'} ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                          <td rowSpan={rowSpan} className="px-3 py-2 border-r border-[#E2E8F0] font-bold text-[#059669] align-top">{r.receiptNo}</td>
                          <td rowSpan={rowSpan} className="px-3 py-2 border-r border-[#E2E8F0] text-black font-bold align-top">{getMalaysiaDateStr(r.date)}</td>
                          {/* <td rowSpan={rowSpan} className="px-3 py-2 border-r border-[#E2E8F0] font-bold text-black align-top">{r.customer?.code || r.customerId}</td> */}
                          <td rowSpan={rowSpan} className="px-3 py-2 border-r border-[#E2E8F0] font-bold text-black align-top">{r.customer?.name}</td>
                          <td rowSpan={rowSpan} className="px-3 py-2 text-right font-bold text-[#059669] border-r border-[#E2E8F0] align-top">{formatCurrency(r.amount)}</td>
                          <td rowSpan={rowSpan} className="px-3 py-2 text-right font-bold text-black border-r border-[#E2E8F0] align-top">{formatCurrency(openCr > 0 ? openCr : 0)}</td>
                          
                          {r.allocations && r.allocations.length > 0 ? (
                            (() => {
                              const a = r.allocations[0];
                              const isOB = !a.saleId;
                              const invNo = isOB ? 'Opening Balance' : (a.sale?.invoiceNo || '-');
                              const rawDate = isOB ? r.customer?.createdAt : a.sale?.date;
                              const invDate = rawDate ? getMalaysiaDateStr(rawDate) : '-';
                              const days = rawDate ? Math.max(0, Math.floor((new Date(r.date).getTime() - new Date(rawDate).getTime()) / (1000 * 3600 * 24))) : '-';
                              const origAmt = isOB ? Number(r.customer?.openingBalance || a.amount) : Number(a.sale?.grandTotal || 0);
                              const amtPaid = Number(a.amount || 0);
                              const outstanding = Math.max(0, origAmt - amtPaid);

                              return (
                                <>
                                  <td className="px-3 py-2 border-r border-[#E2E8F0] text-black font-bold">{invNo}</td>
                                  <td className="px-3 py-2 border-r border-[#E2E8F0] text-black">{invDate}</td>
                                  <td className="px-3 py-2 border-r border-[#E2E8F0] text-center text-black">
                                    {days}
                                  </td>
                                  <td className="px-3 py-2 border-r border-[#E2E8F0] text-right text-black">{formatCurrency(origAmt)}</td>
                                  <td className="px-3 py-2 border-r border-[#E2E8F0] text-right font-bold text-[#059669]">{formatCurrency(amtPaid)}</td>
                                  <td className="px-3 py-2 border-r border-[#E2E8F0] text-right text-black">
                                    {formatCurrency(outstanding)}
                                  </td>
                                </>
                              );
                            })()
                          ) : (
                            <>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black text-center">-</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black text-center">-</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black text-center">-</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black text-center">-</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black text-center">-</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black text-center">-</td>
                            </>
                          )}
                          
                          {storeSettings?.allowEditReceipts && (
                            <td rowSpan={rowSpan} className="px-3 py-2 text-center align-top border-l border-[#E2E8F0]">
                              <button
                                type="button"
                                onClick={() => {
                                  reset({
                                    receiptNo: r.receiptNo,
                                    date: getMalaysiaDateStr(r.date),
                                    customerId: r.customerId,
                                    amount: r.amount,
                                    paymentTypeId: r.paymentTypeId || 0,
                                    reference: r.reference || '',
                                    remarks: r.remarks || '',
                                  });
                                  setEditingId(r.id);
                                  const existingAllocs: Record<string, number> = {};
                                  if (r.allocations) {
                                    r.allocations.forEach((a: any) => {
                                      if (a.saleId) existingAllocs[a.saleId] = Number(a.amount);
                                      else existingAllocs['OB'] = Number(a.amount);
                                    });
                                  }
                                  setAllocations(existingAllocs);
                                  setShowBreakdown(true);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE] px-2 py-1 rounded text-[11px] font-bold border border-[#BFDBFE] transition-colors"
                              >
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                        
                        {r.allocations && r.allocations.slice(1).map((a: any, i: number) => {
                          const isOB = !a.saleId;
                          const invNo = isOB ? 'Opening Balance' : (a.sale?.invoiceNo || '-');
                          const rawDate = isOB ? r.customer?.createdAt : a.sale?.date;
                          const invDate = rawDate ? getMalaysiaDateStr(rawDate) : '-';
                          const days = rawDate ? Math.max(0, Math.floor((new Date(r.date).getTime() - new Date(rawDate).getTime()) / (1000 * 3600 * 24))) : '-';
                          const origAmt = isOB ? Number(r.customer?.openingBalance || a.amount) : Number(a.sale?.grandTotal || 0);
                          const amtPaid = Number(a.amount || 0);
                          const outstanding = Math.max(0, origAmt - amtPaid);

                          return (
                            <tr key={i} className={`border-b ${i === r.allocations.length - 2 ? 'border-[#E2E8F0]' : 'border-dashed border-[#CBD5E1]'} ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black font-bold">{invNo}</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-black">{invDate}</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-center text-black">
                                {days}
                              </td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-right text-black">{formatCurrency(origAmt)}</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-right font-bold text-[#059669]">{formatCurrency(amtPaid)}</td>
                              <td className="px-3 py-2 border-r border-[#E2E8F0] text-right text-black">
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
          </div>
        </div>
      </div>
      <PdfViewerModal 
        isOpen={pdfModalOpen} 
        onClose={() => setPdfModalOpen(false)} 
        pdfUrl={pdfUrl} 
        title={pdfTitle} 
      />
    </div>
  );
};

export default CustomerReceipts;
