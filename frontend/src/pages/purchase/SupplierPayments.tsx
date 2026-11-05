import { getMalaysiaDateStr } from '../../utils/date';
import { useState, useEffect } from 'react';
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

const paymentSchema = z.object({
  paymentNo: z.string(),
  date: z.string(),
  supplierId: z.coerce.number().min(1, 'Supplier is required'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  paymentTypeId: z.coerce.number().min(1, 'Payment Type is required'),
  reference: z.string().optional(),
  remarks: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

const SupplierPayments = () => {
  const { formatCurrency } = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filters for History Table
  const [filterSupplier, setFilterSupplier] = useState('');
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

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema) as any,
    defaultValues: {
      paymentNo: 'Generating...',
      date: getMalaysiaDateStr(),
      supplierId: 0,
      amount: '' as any,
      paymentTypeId: 0,
      reference: '',
      remarks: '',
    }
  });

  const selectedSupplierId = watch('supplierId');
  const amountToPay = watch('amount') || 0;

  // Master Data
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await api.get('/suppliers')).data });
  const { data: paymentTypes = [] } = useQuery({ queryKey: ['paymentTypes'], queryFn: async () => (await api.get('/payment-types')).data });
  const { data: nextPaymentNoData } = useQuery({ queryKey: ['nextPaymentNo'], queryFn: async () => (await api.get('/supplier-payments/next-payment-no')).data });
  
  // History Data
  const { data: payments = [], isLoading: historyLoading } = useQuery({
    queryKey: ['supplierPayments'],
    queryFn: async () => (await api.get('/supplier-payments')).data
  });

  useEffect(() => {
    if (nextPaymentNoData?.paymentNo) {
      setValue('paymentNo', nextPaymentNoData.paymentNo);
    }
  }, [nextPaymentNoData, setValue]);

  // Fetch balance dynamically when supplier changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (selectedSupplierId && selectedSupplierId > 0) {
        try {
          let balUrl = `/supplier-payments/balance/${selectedSupplierId}`;
          if (editingId) {
            balUrl += `?excludePaymentId=${editingId}`;
          }
          const res = await api.get(balUrl);
          setCurrentBalance(res.data.balance);
          
          let url = `/supplier-payments/unpaid-bills/${selectedSupplierId}`;
          if (editingId) {
            url += `?excludePaymentId=${editingId}`;
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
  }, [selectedSupplierId, editingId]);

  const createMutation = useMutation({
    mutationFn: (data: PaymentFormValues) => api.post('/supplier-payments', data),
    onSuccess: () => {
      toast.success('Payment recorded successfully!');
      queryClient.invalidateQueries({ queryKey: ['supplierPayments'] });
      queryClient.invalidateQueries({ queryKey: ['nextPaymentNo'] });
      reset();
      setCurrentBalance(0);
      setAllocations({});
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to record payment. Please check your inputs.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number, payload: any }) => api.put(`/supplier-payments/${data.id}`, data.payload),
    onSuccess: () => {
      toast.success('Payment updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['supplierPayments'] });
      reset();
      setEditingId(null);
      setCurrentBalance(0);
      setAllocations({});
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to update payment.');
    }
  });

  const onSubmit = (data: PaymentFormValues) => {
    const totalAlloc = Object.values(allocations).reduce((sum, curr) => sum + (Number(curr) || 0), 0);
    const enteredAmount = Number(data.amount) || 0;
    if (totalAlloc > enteredAmount + 0.009) {
      toast.error(`Total allocated amount (${formatCurrency(totalAlloc)}) cannot exceed payment amount (${formatCurrency(enteredAmount)})`);
      return;
    }

    const payload = {
      ...data,
      allocations: Object.entries(allocations).map(([purchaseId, amount]) => ({
        purchaseId: purchaseId === 'OB' ? null : purchaseId,
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
  const filteredHistory = payments.filter((p: any) => {
    if (filterSupplier && p.supplierId.toString() !== filterSupplier) return false;
    
    if (filterFromDate || filterToDate) {
      const d = new Date(p.date);
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
  }, [filterSupplier, filterFromDate, filterToDate]);

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExportExcel = () => {
    const exportData = filteredHistory.map((p: any) => ({
      'Payment No': p.paymentNo,
      'Date': getMalaysiaDateStr(p.date),
      'Supplier': p.supplier?.name || 'Unknown',
      'Payment Type': p.paymentType?.name || 'Unknown',
      'Amount Paid': p.amount,
      'Reference': p.reference || '',
      'Remarks': p.remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments History");
    XLSX.writeFile(wb, "Supplier_Payments_History.xlsx");
  };

  return (
    <div className="bg-[#F8FAFC] min-h-[calc(100vh-64px)] p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0 mb-4 print:hidden">
        <div>
          <h1 className="text-[16px] md:text-xl font-bold text-[#E11D48] flex items-center gap-2">
            <span className="bg-[#E11D48] text-white p-1 rounded"><FileText size={16} /></span>
            SUPPLIER PAYMENTS & PAYOUTS
          </h1>
          <p className="text-[12px] text-black font-bold mt-1">Record vendor credit payouts and supplier payments</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button type="button" onClick={() => navigate('/purchase')} className="bg-[#EFF6FF] text-[#2563EB] font-bold text-[13px] px-4 py-2 rounded border border-[#BFDBFE] hover:bg-[#DBEAFE] flex items-center gap-1 transition-colors flex-1 md:flex-none justify-center">
            Purchase Hub
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
            <h2 className="font-bold text-[13px] text-black font-bold">{editingId ? 'EDIT PAYMENT ENTRY' : 'NEW PAYMENT ENTRY'}</h2>
          </div>
          
          <form onSubmit={handleSubmit(onSubmit as any, onError)} className="p-4 flex flex-col gap-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Payment No</label>
                <input
                  {...register('paymentNo')}
                  readOnly
                  className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#CBD5E1] rounded text-[13px] font-bold outline-none"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Payment Date *</label>
                <input
                  {...register('date')}
                  type="date"
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded text-[13px] outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>

            <div className="print:hidden">
              <label className="block text-[12px] font-bold text-[#2563EB] mb-1">Supplier Name (Searchable) *</label>
              <Controller
                name="supplierId"
                control={control}
                render={({ field }) => (
                  <Select
                    {...field}
                    options={[
                      { value: 0, label: 'Type supplier name / mobile number...' },
                      ...suppliers.map((s: any) => ({
                        value: s.id,
                        label: `${s.name} - ${s.phone || 'No Phone'}`
                      }))
                    ]}
                    value={field.value ? { value: field.value, label: suppliers.find((s: any) => s.id === field.value)?.name || 'Select...' } : null}
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

            {selectedSupplierId > 0 && (
              <div className="flex flex-col gap-3">
                <div className="border border-[#CBD5E1] rounded-lg overflow-hidden bg-white shadow-sm print:hidden">
                  <div className="bg-[#F8FAFC] px-4 py-3 border-b border-[#CBD5E1] flex justify-between items-center">
                    <span className="text-[13px] font-bold text-black font-bold flex items-center gap-2">
                      <FileText size={16} className="text-black font-bold" /> Outstanding Summary
                    </span>
                    <button 
                      type="button"
                      onClick={() => setShowBreakdown(!showBreakdown)}
                      className="border border-[#E11D48] text-[#E11D48] bg-white px-3 py-1.5 rounded font-bold text-[12px] hover:bg-[#FFF1F2] flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      Bill-by-Bill Breakdown
                    </button>
                  </div>
                  
                  <div className="p-4 flex flex-col gap-3">
                    {/* Removed Total Amount Bal and Purchase Return summaries as per user request */}
                    
                    <div className="flex justify-between items-center">
                      <span className="text-[14px] font-bold text-black font-bold">Over All Outstanding Balance</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[18px] font-bold text-[#E11D48]">
                          {formatCurrency(currentBalance)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {showBreakdown && (
                  <div className="border border-[#E11D48] rounded-lg overflow-hidden bg-white print:border-none print:shadow-none print:m-0 print:w-full">
                    
                    {/* Print Only Header for Context */}
                    <div className="hidden print:block mb-4 text-black border-b border-black pb-2">
                      <h2 className="text-xl font-bold uppercase">Supplier: {suppliers.find((s: any) => s.id === selectedSupplierId)?.name}</h2>
                      <p className="text-sm font-bold">Date: {new Date().toLocaleDateString()}</p>
                    </div>

                    <div className="bg-[#E11D48] text-white px-3 py-2 flex justify-between items-center text-[12px] font-bold flex-wrap gap-2 print:text-black print:bg-white print:border-b print:border-black print:px-0">
                      <div className="flex items-center gap-2"><FileText size={14} className="print:hidden" /> BILL-BY-BILL BREAKDOWN</div>
                      <div className="flex items-center gap-2 print:hidden">
                        <select 
                          value={billFilter}
                          onChange={(e: any) => setBillFilter(e.target.value)}
                          className="text-[#E11D48] bg-white rounded px-2 py-0.5 outline-none text-[10px]"
                        >
                          <option value="Unpaid">Unpaid Bills</option>
                          <option value="Paid">Paid Bills</option>
                          <option value="All">All Bills</option>
                        </select>
                        <span className="bg-white text-[#E11D48] px-2 py-0.5 rounded-full text-[10px]">
                          {unpaidBills.filter(b => billFilter === 'All' ? true : billFilter === 'Paid' ? b.pending < 0.01 : b.pending >= 0.01).length} Bills
                        </span>
                        <button 
                          type="button" 
                          onClick={() => {
                            const displayedBills = unpaidBills.filter(b => billFilter === 'All' ? true : billFilter === 'Paid' ? b.pending < 0.01 : b.pending >= 0.01);
                            const totals = displayedBills.reduce((acc, bill) => {
                              acc.total += Number(bill.total || 0);
                              acc.returned += Number(bill.returned || 0);
                              acc.paid += Number(bill.received || bill.paid || 0);
                              acc.pending += Number(bill.pending || 0);
                              return acc;
                            }, { total: 0, returned: 0, paid: 0, pending: 0 });
                            const supplier = suppliers.find((s: any) => s.id === selectedSupplierId);
                            const companyName = storeSettings?.shopName || 'NJ FRESH AND FROZEN SDN BHD';
                            let reportTitle = 'PENDING BALANCE BILL BY BILL';
                            if (billFilter === 'Paid') reportTitle = 'PAID BILL BY BILL';
                            if (billFilter === 'All') reportTitle = 'ALL BILLS BY BILL';
                            const url = generateBillByBillPdf(companyName, supplier?.name || 'Unknown', 'Supplier', displayedBills, totals, reportTitle) as unknown as string;
                            setPdfUrl(url);
      setPdfTitle(`${supplier?.name} - Bill by Bill`);
                            setPdfModalOpen(true);
                          }}
                          className="bg-white text-[#E11D48] hover:bg-gray-100 p-1 rounded transition-colors"
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
                                  <td className="px-3 py-2 font-bold text-[#3B82F6]">PUR</td>
                                  <td className="px-3 py-2 font-bold text-black">
                                    {bill.entryNo}
                                  </td>
                                  <td className="px-3 py-2 text-black font-bold">{getMalaysiaDateStr(bill.date)}</td>
                                  <td className="px-3 py-2 text-black">-</td>
                                  <td className="px-3 py-2 text-right text-black font-bold">{formatCurrency(bill.total)}</td>
                                  <td className="px-3 py-2 text-right font-bold text-[#E11D48]">{formatCurrency(bill.pending)}</td>
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
                                      className={`w-[100px] text-right px-2 py-1 border rounded text-[13px] font-bold outline-none focus:border-[#3B82F6] ${payingNow > 0 ? 'bg-[#EFF6FF] border-[#3B82F6] text-[#2563EB]' : 'bg-white border-[#CBD5E1]'}`}
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
                              acc.paid += Number(bill.received || bill.paid || 0);
                              acc.pending += Number(bill.pending || 0);
                              return acc;
                            }, { total: 0, returned: 0, paid: 0, pending: 0 });
                            
                            if (displayedBills.length === 0) return null;
                            
                            return (
                              <tr>
                                <td colSpan={4} className="px-3 py-2 text-right font-bold text-black uppercase">Totals:</td>
                                <td className="px-3 py-2 text-right font-bold text-black">{formatCurrency(totals.total)}</td>
                                <td className="px-3 py-2 text-right font-bold text-[#E11D48]">{formatCurrency(totals.pending)}</td>
                                <td className="px-3 py-2 text-right font-bold text-[#3B82F6] print:hidden">
                                  {formatCurrency((Object.values(allocations) as number[]).reduce((sum: number, curr: number) => sum + (curr || 0), 0))}
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
                <label className="block text-[12px] font-bold text-[#E11D48] mb-1">Amount Pay Now *</label>
                <input
                  {...register('amount')}
                  type="number" step="0.01"
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded text-[15px] font-bold outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">Remaining Balance After Payment</label>
                <div className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded text-[13px] font-bold text-black font-bold">
                  {formatCurrency(currentBalance - amountToPay)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
              <div>
                <label className="block text-[12px] font-bold text-black font-bold mb-1">PAYMENT TYPE *</label>
                <select
                  {...register('paymentTypeId')}
                  className="w-full px-3 py-2 border border-[#CBD5E1] rounded shadow-sm focus:border-[#3B82F6] outline-none text-[13px] bg-white"
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
                      paymentNo: nextPaymentNoData?.paymentNo || 'Generating...',
                      date: getMalaysiaDateStr(),
                      supplierId: 0,
                      paymentTypeId: 0,
                      amount: 0 as any,
                      reference: '',
                      remarks: ''
                    });
                    setEditingId(null);
                    setAllocations({});
                    queryClient.invalidateQueries({ queryKey: ['nextPaymentNo'] });
                  }}
                  className="bg-[#F1F5F9] text-black hover:bg-[#E2E8F0] px-4 py-2 rounded font-bold text-[12px] md:text-[14px] flex items-center justify-center gap-2 transition-colors w-full md:w-auto border border-[#CBD5E1]"
                >
                  <X size={14} /> CANCEL
                </button>
              )}
              <button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-[#E11D48] hover:bg-[#BE123C] text-white px-4 py-2 rounded font-bold text-[12px] md:text-[14px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50 w-full md:w-auto"
              >
                <Save size={14} /> {editingId ? 'UPDATE PAYMENT (F10)' : 'SAVE PAYMENT (F10)'}
              </button>
            </div>

          </form>
        </div>

        {/* Right Side - History Table */}
        <div className={`bg-white border border-[#E2E8F0] shadow-sm flex flex-col ${isTableExpanded ? 'fixed inset-4 lg:inset-8 z-50 rounded-xl shadow-2xl' : 'rounded-lg overflow-hidden lg:col-span-1'} print:hidden`}>
          <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-black font-bold" />
              <h2 className="font-bold text-[13px] text-black font-bold">PAYMENTS HISTORY</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-[#E11D48] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {filteredHistory.length} Payments
              </div>
              <button 
                type="button" 
                onClick={() => setIsTableExpanded(!isTableExpanded)}
                className="text-black font-bold hover:text-[#E11D48] transition-colors ml-1"
                title={isTableExpanded ? "Minimize Table" : "View Full Table"}
              >
                {isTableExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>

          <div className="p-3 border-b border-[#E2E8F0] grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select
              value={filterSupplier ? { value: filterSupplier, label: suppliers.find((s: any) => s.id.toString() === filterSupplier)?.name || '-- All Suppliers --' } : null}
              onChange={(option: any) => setFilterSupplier(option ? option.value.toString() : '')}
              options={[
                { value: '', label: '-- All Suppliers --' },
                ...suppliers.map((s: any) => ({
                  value: s.id.toString(),
                  label: s.name
                }))
              ]}
              isClearable
              placeholder="-- All Suppliers --"
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
              <button type="button" className="bg-[#E11D48] hover:bg-[#BE123C] text-white px-3 rounded flex items-center justify-center transition-colors" title="Apply Filter">
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
                  <th className="px-3 py-2 border-r border-[#444]">Payment Type</th>
                  <th className="px-3 py-2 border-r border-[#334155]">Date</th>
                  <th className="px-3 py-2 border-r border-[#334155]">Supplier</th>
                  {/* <th className="px-3 py-2 border-r border-[#334155]">Mode</th> */}
                  <th className="px-3 py-2 text-right border-r border-[#334155]">Amount Paid</th>
                  {/* <th className="px-3 py-2 border-r border-[#334155]">Allocated Bills</th> */}
                  {storeSettings?.allowEditReceipts && <th className="px-3 py-2 text-center w-20">Action</th>}
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <TableLoader columns={storeSettings?.allowEditReceipts ? 5 : 4} text="Loading history..." />
                ) : filteredHistory.length === 0 ? (
                  <tr><td colSpan={storeSettings?.allowEditReceipts ? 5 : 4} className="text-center p-4 text-black font-bold">No payment records found.</td></tr>
                ) : (
                  paginatedHistory.map((p: any, idx: number) => (
                    <tr key={p.id} className={`border-b border-[#E2E8F0] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}`}>
                      <td className="px-3 py-3 border-r border-[#E5E7EB] text-black font-bold">{p.paymentType?.name || p.paymentMode?.name || '-'}</td>
                      <td className="px-3 py-2 border-r border-[#E2E8F0] text-black font-bold">{getMalaysiaDateStr(p.date)}</td>
                      <td className="px-3 py-2 border-r border-[#E2E8F0] font-bold text-black font-bold">{p.supplier?.name}</td>
                      {/* <td className="px-3 py-2 border-r border-[#E2E8F0] text-black font-bold">
                        {p.paymentMode?.name || '-'}
                      </td> */}
                      <td className="px-3 py-2 text-right font-bold text-[#E11D48]">{formatCurrency(p.amount)}</td>
                      {/* <td className="px-3 py-2 border-r border-[#E2E8F0] text-[11px] text-gray-600 whitespace-pre-wrap min-w-[150px]">
                        {p.allocations && p.allocations.length > 0 
                          ? p.allocations.map((a: any) => `${a.purchase?.invoiceNo || 'N/A'} (${formatCurrency(a.amount)})`).join(', ')
                          : '-'}
                      </td> */}
                      {storeSettings?.allowEditReceipts && (
                        <td className="px-3 py-2 text-center border-l border-[#E2E8F0]">
                          <button
                            type="button"
                            onClick={() => {
                              reset({
                                paymentNo: p.paymentNo,
                                date: getMalaysiaDateStr(p.date),
                                supplierId: p.supplierId,
                                amount: p.amount,
                                paymentTypeId: p.paymentTypeId || 0,
                                reference: p.reference || '',
                                remarks: p.remarks || '',
                              });
                              setEditingId(p.id);
                              const existingAllocs: Record<string, number> = {};
                              if (p.allocations) {
                                p.allocations.forEach((a: any) => {
                                  if (a.purchaseId) existingAllocs[a.purchaseId] = Number(a.amount);
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
                  ))
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

export default SupplierPayments;
