import { getMalaysiaDateStr } from '../../utils/date';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Save, X, Printer, RefreshCw, List, UserPlus, AlertTriangle, DollarSign, FileText, Keyboard } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SearchableSelect from '../../components/SearchableSelect';
import InvoicePrintModal from '../../components/InvoicePrintModal';
// @ts-ignore
import html2pdf from 'html2pdf.js';


const saleItemSchema = z.object({
  productId: z.coerce.number().min(0),
  quantity: z.coerce.number().min(0),
  noOfBirds: z.union([z.coerce.number(), z.literal('')]).optional(),
  stock: z.coerce.number(),
  rate: z.coerce.number().min(0),
  unit: z.string().optional(),
  discPercent: z.coerce.number().min(0).max(100),
  discAmt: z.coerce.number().min(0),
  total: z.coerce.number(),
}).superRefine((data, ctx) => {
  if (data.productId > 0) {
    if (data.quantity <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Quantity must be > 0",
        path: ["quantity"]
      });
    }
    if (data.rate < 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Rate is required",
        path: ["rate"]
      });
    }
    if (data.quantity > data.stock) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Qty > Stock",
        path: ["quantity"]
      });
    }
  }
});

const saleSchema = z.object({
  customerId: z.coerce.number().min(1, 'Customer is required').or(z.literal(0)),
  invoiceNo: z.string(),
  date: z.string(),
  rateType: z.string(),
  paymentModeId: z.coerce.number().min(1, 'Payment Mode is required').or(z.literal(0)),

  grossAmount: z.coerce.number(),
  totalDiscount: z.coerce.number(),
  totalDiscountPercent: z.coerce.number().optional(),
  roundOff: z.coerce.number(),
  netAmount: z.coerce.number(),

  items: z.array(saleItemSchema).min(1, 'At least one item is required'),
});

type SaleFormValues = z.infer<typeof saleSchema>;

const POS = () => {
  const { settings, formatCurrency } = useSettings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const activeTab = 'Amount Details';

  const [showLossWarning, setShowLossWarning] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState<any>(null);
  const printAfterSaveRef = useRef(false);
  const saleSubmitLockRef = useRef(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [saleToPrint, setSaleToPrint] = useState<any>(null);

  const { register, control, handleSubmit, watch, setValue, getValues, reset } = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema) as any,
    defaultValues: {
      date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' }),
      invoiceNo: 'Generating...',
      customerId: 0,
      rateType: 'Wholesale Rate',
      paymentModeId: 0,
      items: [{ productId: 0, quantity: '' as any, noOfBirds: '' as any, stock: 0, rate: '' as any, unit: 'Nos', discPercent: '' as any, discAmt: '' as any, total: 0 }],
      grossAmount: 0,
      totalDiscountPercent: '' as any,
      totalDiscount: '' as any,
      roundOff: '' as any,
      netAmount: 0
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items"
  });

  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  // Watch selected customer
  const selectedCustomerId = watch('customerId');

  // Customer fixed product rates query
  const { data: customerRates = [] } = useQuery({
    queryKey: ['customer-rates', selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      const res = await api.get(`/customers/${selectedCustomerId}/rates`);
      return res.data;
    },
    enabled: !!selectedCustomerId && !!settings?.enableCustomerRates,
  });

  // Fetch Masters & Next Invoice
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: async () => (await api.get('/customers')).data });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get('/products')).data });
  const { data: paymentModes = [] } = useQuery({ queryKey: ['paymentModes'], queryFn: async () => (await api.get('/payment-modes')).data });
  const { data: nextInvoiceData } = useQuery({ queryKey: ['nextInvoiceNo'], queryFn: async () => (await api.get('/sales/next-invoice-no')).data });

  // Automatically sync item rates whenever customer or customerRates change
  useEffect(() => {
    if (!settings?.enableCustomerRates || !selectedCustomerId || !products || products.length === 0) return;

    const currentItems = getValues('items');
    if (!currentItems || currentItems.length === 0) return;

    currentItems.forEach((item: any, index: number) => {
      if (item.productId && Number(item.productId) > 0) {
        const prod = products.find((p: any) => p.id === Number(item.productId));
        if (prod) {
          const customRate = customerRates.find((r: any) => r.productId === prod.id);
          let targetRate: any = '';
          if (customRate && Number(customRate.rate) > 0) {
            targetRate = parseFloat(Number(customRate.rate).toFixed(2));
          } else if (prod.sellingRate && Number(prod.sellingRate) > 0) {
            targetRate = parseFloat(Number(prod.sellingRate).toFixed(2));
          }

          if (targetRate !== '' && Number(item.rate) !== Number(targetRate)) {
            if (targetRate <= Number(prod.purchaseRate)) {
              setValue(`items.${index}.rate`, '' as any);
              toast.error(`Customer fixed rate for ${prod.name} is lower than purchase rate. Rate cleared.`, { id: 'cust-rate-err' });
            } else {
              setValue(`items.${index}.rate`, targetRate);
            }
          }
        }
      }
    });
  }, [customerRates, selectedCustomerId, settings?.enableCustomerRates, products, getValues, setValue]);

  // Mutation to quickly save custom fixed rate for customer from POS
  const saveCustomerRateMutation = useMutation({
    mutationFn: async ({ productId, rate }: { productId: number; rate: number }) => {
      if (!selectedCustomerId) return;
      await api.post(`/customers/${selectedCustomerId}/rates`, {
        rates: [{ productId, rate }]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-rates', selectedCustomerId] });
      toast.success('Customer fixed rate saved!');
    },
    onError: () => {
      toast.error('Failed to save customer rate.');
    }
  });

  // Fetch existing sale data if editing
  const { data: editSaleData } = useQuery({
    queryKey: ['sale-edit', editId],
    queryFn: async () => (await api.get(`/sales/${editId}`)).data,
    enabled: !!editId,
  });

  // Populate form if editing
  useEffect(() => {
    if (editSaleData && editId) {
      reset({
        invoiceNo: editSaleData.invoiceNo,
        date: getMalaysiaDateStr(editSaleData.date),
        customerId: editSaleData.customerId,
        rateType: 'Wholesale Rate',
        paymentModeId: editSaleData.paymentModeId,
        items: editSaleData.items?.map((item: any) => {
          const prod = products.find((p: any) => p.id === item.productId);
          const currentStockNum = prod ? Number(prod.currentStock) : 0;
          return {
            productId: item.productId,
            quantity: Number(Number(item.quantity).toFixed(4)),
            noOfBirds: item.noOfBirds || '',
            stock: currentStockNum + Number(item.quantity),
            rate: item.rate,
            unit: item.product?.unit?.shortCode || item.product?.unit?.name || 'Nos',
            discPercent: item.discount && item.rate && item.quantity ? Number(((item.discount / (item.rate * item.quantity)) * 100).toFixed(2)) : 0,
            discAmt: item.discount || 0,
            total: item.amount,
          };
        }) || [],
        grossAmount: editSaleData.subtotal,
        totalDiscountPercent: '' as any,
        totalDiscount: editSaleData.discount || '' as any,
        roundOff: '' as any,
        netAmount: editSaleData.grandTotal,
      });
    }
  }, [editSaleData, editId, products, reset]);

  // Update default invoice no for new sale
  useEffect(() => {
    if (!editId && nextInvoiceData?.invoiceNo) {
      setValue('invoiceNo', nextInvoiceData.invoiceNo);
    }
  }, [nextInvoiceData, editId, setValue]);


  // Watch values
  const items = watch('items');
  const watchTotalDiscount = watch('totalDiscount');
  const watchRoundOff = watch('roundOff');

  const selectedCustomer = customers.find((c: any) => c.id === Number(selectedCustomerId));

  // Calculations
  useEffect(() => {
    let grossAmount = 0;

    items.forEach((item, index) => {
      const q = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;

      let discAmt = Number(item.discAmt) || 0;


      const total = (q * rate) - discAmt;

      if (item.total !== total) {
        setValue(`items.${index}.total`, Number(total.toFixed(2)), { shouldValidate: false });
      }
      grossAmount += total;
    });

    const d = Number(watchTotalDiscount) || 0;
    const r = Number(watchRoundOff) || 0;
    const netAmount = grossAmount - d + r;

    setValue('grossAmount', Number(grossAmount.toFixed(2)));
    setValue('netAmount', Number(netAmount.toFixed(2)));

  }, [JSON.stringify(items), watchTotalDiscount, watchRoundOff, setValue]);

  // Product change handler
  const handleProductChange = async (index: number, productId: string) => {
    const product = products.find((p: any) => p.id === Number(productId));
    if (product) {
      setValue(`items.${index}.stock`, product.currentStock || 0);
      setValue(`items.${index}.unit`, product.unit?.shortCode || product.unit?.name || 'Nos');

      let rateToUse: any = product.sellingRate ? parseFloat(Number(product.sellingRate).toFixed(2)) : '';
      if (settings?.enableCustomerRates && selectedCustomerId && customerRates.length > 0) {
        const customRate = customerRates.find((r: any) => r.productId === product.id);
        if (customRate && Number(customRate.rate) > 0) {
          rateToUse = parseFloat(Number(customRate.rate).toFixed(2));
        }
      }
      if (rateToUse !== '' && rateToUse <= Number(product.purchaseRate)) {
        toast.error(`Configured rate for ${product.name} is lower than purchase rate. Rate cleared.`);
        rateToUse = '';
      }
      if (rateToUse !== '' && rateToUse <= Number(product.purchaseRate)) {
        toast.error(`Configured rate for ${product.name} is lower than purchase rate. Rate cleared.`);
        rateToUse = '';
      }
      if (rateToUse !== '' && rateToUse <= Number(product.purchaseRate)) {
        toast.error(`Configured rate for ${product.name} is lower than purchase rate. Rate cleared.`);
        rateToUse = '';
      }
      setValue(`items.${index}.rate`, rateToUse);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: SaleFormValues) => editId ? api.put(`/sales/${editId}`, data) : api.post('/sales', data),
    onSuccess: (res) => {
      toast.success(editId ? 'Sale invoice updated successfully!' : 'Sale recorded successfully!');

      setTimeout(async () => {
        if (printAfterSaveRef.current) {
          setSaleToPrint(res.data);
          setIsPrintModalOpen(true);
        }
        if (editId) {
          queryClient.invalidateQueries({ queryKey: ['sales'] });
          queryClient.invalidateQueries({ queryKey: ['products'] });
          if (!printAfterSaveRef.current) {
            navigate('/sales');
          }
        } else {
          reset();
          const resNext = await api.get('/sales/next-invoice-no');
          if (resNext.data?.invoiceNo) {
            setValue('invoiceNo', resNext.data.invoiceNo);
          }
          queryClient.invalidateQueries({ queryKey: ['products'] });
          queryClient.invalidateQueries({ queryKey: ['nextInvoiceNo'] });
        }
      }, 100);
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to save sale. Please check your inputs.');
    }
  });

  const onSubmit = (data: SaleFormValues) => {
    if (!data.customerId) {
      toast.error('Please select a Customer before saving.');
      return;
    }
    if (!data.paymentModeId) {
      toast.error('Please select a Payment Mode before saving.');
      return;
    }

    const validItems = data.items.filter(item => item.productId > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one product before saving.');
      return;
    }

    const payload = {
      ...data,
      customerId: Number(data.customerId),
      paymentModeId: Number(data.paymentModeId),
      subtotal: Number(data.grossAmount),
      discount: Number(data.totalDiscount),
      tax: 0,
      grandTotal: Number(data.netAmount),
      items: validItems.map(item => ({
        productId: Number(item.productId),
        quantity: Number(item.quantity) || 0,
        noOfBirds: Number(item.noOfBirds) || 0,
        rate: Number(item.rate) || 0,
        discount: Number(item.discAmt || 0),
        tax: 0,
        amount: Number(item.total),
      }))
    };

    const hasLowRate = validItems.some(item => {
      const p = products.find((prod: any) => prod.id === Number(item.productId));
      return p && Number(item.rate) > 0 && Number(item.rate) <= Number(p.purchaseRate);
    });

    if (hasLowRate) {
      toast.error('Validation Error: Sales rate must be higher than the purchase rate for all items.');
      return;
    }

    setPendingSavePayload(payload);
    setIsSaveModalOpen(true);
  };

  const confirmLossWarning = () => {
    setShowLossWarning(false);
    if (pendingPayload) {
      setPendingSavePayload(pendingPayload);
      setIsSaveModalOpen(true);
      setPendingPayload(null);
    }
  };

  const handleConfirmSave = (print: boolean) => {
    if (saleSubmitLockRef.current || createMutation.isPending) return;
    if (!pendingSavePayload) return;

    saleSubmitLockRef.current = true;
    printAfterSaveRef.current = print;
    setIsSaveModalOpen(false);

    createMutation.mutate(pendingSavePayload, {
      onSettled: () => {
        saleSubmitLockRef.current = false;
      },
    });

    setPendingSavePayload(null);
  };

  const onError = (errors: any) => {
    let errorMessage = 'Validation failed. Please ensure all items have a Rate and Quantity > 0.';

    if (errors.items && Array.isArray(errors.items)) {
      for (const item of errors.items) {
        if (item?.quantity?.message === 'Qty > Stock') {
          errorMessage = 'Validation failed: Quantity exceeds available stock.';
          break;
        }
        if (item?.quantity?.message === 'Quantity must be > 0') {
          errorMessage = 'Validation failed: Quantity must be greater than 0.';
          break;
        }
        if (item?.rate?.message === 'Rate is required') {
          errorMessage = 'Validation failed: Rate is required for all items.';
          break;
        }
      }
    }

    toast.error(errorMessage);
    console.error(errors);
  };

  const addCustomerMutation = useMutation({
    mutationFn: (data: any) => api.post('/customers', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsCustomerModalOpen(false);
      setNewCustomer({ name: '', phone: '', address: '' });
      if (res.data && res.data.id) {
        setValue('customerId', res.data.id);
      }
    },
    onError: () => {
      toast.error('Failed to add customer.');
    }
  });

  const handleQuickAddCustomer = () => {
    if (!newCustomer.name) return;
    addCustomerMutation.mutate(newCustomer);
  };


  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input/textarea unless it's a function key or escape

      if (e.key === 'F10') {
        e.preventDefault();

        if (
          saleSubmitLockRef.current ||
          createMutation.isPending ||
          isSaveModalOpen
        ) return;

        handleSubmit(onSubmit as any, onError)();
      } else if (e.key === 'Escape') {
        if (isCustomerModalOpen || showLossWarning || isSaveModalOpen || isLeaveModalOpen) {
          setIsCustomerModalOpen(false);
          setShowLossWarning(false);
          setIsSaveModalOpen(false);
          setIsLeaveModalOpen(false);
        } else {
          setIsLeaveModalOpen(true);
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        reset();
      } else if (e.key === 'F2') {
        e.preventDefault();
        append({ productId: 0, quantity: '' as any, noOfBirds: '' as any, stock: 0, rate: '' as any, unit: 'Nos', discPercent: '' as any, discAmt: '' as any, total: 0 });
        setTimeout(() => {
          const inputs = document.querySelectorAll<HTMLElement>('[data-row-product] input');
          if (inputs.length > 0) inputs[inputs.length - 1].focus();
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit, isCustomerModalOpen, showLossWarning, isSaveModalOpen, isLeaveModalOpen, reset, append, navigate, onSubmit, onError]);

  const focusCell = (row: number, col: number) => {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
      if (el) { el.focus(); (el as HTMLInputElement).select?.(); }
    }, 10);
  };

  const handleCellKey = (e: React.KeyboardEvent, rowIndex: number, col: number, totalCols: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow < fields.length) {
        setTimeout(() => {
          const selectEl = document.querySelector<HTMLElement>(`[data-row-product="${nextRow}"] input`);
          if (selectEl) selectEl.focus();
        }, 80);
      } else {
        append({ productId: 0, quantity: '' as any, noOfBirds: '' as any, stock: 0, rate: '' as any, unit: 'Nos', discPercent: '' as any, discAmt: '' as any, total: 0 });
        setTimeout(() => {
          const selectEl = document.querySelector<HTMLElement>(`[data-row-product="${nextRow}"] input`);
          if (selectEl) selectEl.focus();
        }, 100);
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const nextCol = col + 1;
      if (nextCol <= totalCols) {
        focusCell(rowIndex, nextCol);
      }
    } else if (e.key === 'ArrowRight') {
      if ((e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) {
        e.preventDefault();
        const nextCol = col + 1;
        if (nextCol <= totalCols) focusCell(rowIndex, nextCol);
      }
    } else if (e.key === 'ArrowLeft') {
      if ((e.target as HTMLInputElement).selectionStart === 0) {
        e.preventDefault();
        const prevCol = col - 1;
        if (prevCol >= 1) focusCell(rowIndex, prevCol);
        else if (prevCol === 0) {
          const selectEl = document.querySelector<HTMLElement>(`[data-row-product="${rowIndex}"] input`);
          if (selectEl) selectEl.focus();
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIndex > 0) focusCell(rowIndex - 1, col);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIndex < fields.length - 1) focusCell(rowIndex + 1, col);
    } else if (e.ctrlKey && e.key === 'Delete') {
      e.preventDefault();
      if (fields.length > 1) {
        remove(rowIndex);
        setTimeout(() => {
          const selectEl = document.querySelector<HTMLElement>(`[data-row-product="${Math.max(0, rowIndex - 1)}"] input`);
          if (selectEl) selectEl.focus();
        }, 50);
      }
    }
  };

  return (
    <div className="absolute inset-0 bg-[#F3F4F6] flex flex-col font-sans overflow-hidden z-10 print:relative print:overflow-visible print:h-auto print:bg-white">

      {/* Top Bar */}
      <div className="bg-gradient-to-r from-[#0F172A] to-[#1E3A8A] text-white px-2 sm:px-4 py-2 flex flex-wrap gap-2 justify-between items-center shrink-0 print:hidden">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSubmit(onSubmit as any, onError)}
            className="bg-[#10B981] hover:bg-[#059669] text-white px-4 py-1.5 rounded flex items-center gap-2 font-bold text-[13px] transition-colors"
          >
            <Printer size={16} /> {editId ? 'UPDATE SALE (F10)' : 'SAVE & PRINT (F10)'}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsLeaveModalOpen(true)}
          className="bg-[#EF4444] hover:bg-[#DC2626] text-white px-4 py-1.5 rounded flex items-center gap-2 font-bold text-[13px] transition-colors"
        >
          <X size={16} /> Close (Esc)
        </button>
      </div>

      <form className="flex flex-col flex-1 overflow-y-auto custom-scrollbar print:hidden" onSubmit={handleSubmit(onSubmit as any, onError)}>

        {/* Header Section */}
        <div className="bg-white p-3 sm:p-4 border-b border-[#E5E7EB] shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:flex lg:flex-row gap-3 sm:gap-4">

            <div className="w-full lg:flex-1 lg:max-w-[200px]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Entry No</label>
              <input
                {...register('invoiceNo')}
                type="text"
                readOnly
                className="w-full px-2 py-1.5 border border-[#D1D5DB] bg-[#F9FAFB] rounded text-[13px] font-bold outline-none"
              />
            </div>

            <div className="w-full lg:flex-1 lg:max-w-[200px]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Entry Date</label>
              <input
                {...register('date')}
                type="date"
                className="w-full px-2 py-1.5 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6]"
              />
            </div>

            <div className="w-full lg:flex-[2]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Customer Name *</label>
              <div className="flex flex-col gap-1">
                <div className="flex-1 w-full">
                  <SearchableSelect
                    value={watch('customerId')}
                    onChange={(val) => setValue('customerId', Number(val))}
                    options={[
                      { label: 'Click or type customer name...', value: 0 },
                      ...customers.map((c: any) => ({ label: `${c.name} - ${c.phone || ''}`, value: c.id }))
                    ]}
                  />
                </div>
                <div className="flex justify-between items-center mt-1">
                  <button type="button" onClick={() => setIsCustomerModalOpen(true)} className="bg-[#059669] hover:bg-[#047857] text-white px-2 py-1 rounded transition-colors flex items-center gap-1 text-[11px] font-bold">
                    <UserPlus size={12} /> Add Customer
                  </button>
                  <span className="text-[11px] text-black font-bold text-right flex-1 ml-2">
                    {selectedCustomer ? `${selectedCustomer.address || 'Counter Sale'}` : 'Counter Sale'}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full lg:flex-1 lg:max-w-[200px]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Payment Mode</label>
              <select
                {...register('paymentModeId')}
                className="w-full px-2 py-1.5 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] bg-white"
              >
                <option value="0">Select Payment Mode...</option>
                {paymentModes.map((pm: any) => (
                  <option key={pm.id} value={pm.id}>{pm.name}</option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* Items Grid */}
        <div className="flex flex-col flex-1 bg-white border-b border-[#E5E7EB] overflow-hidden">
          <div className="flex flex-wrap justify-end gap-2 p-2 min-w-[300px] border-b border-[#E5E7EB]">
            <button
              type="button"
              onClick={() => {
                append({ productId: 0, quantity: '' as any, noOfBirds: '' as any, stock: 0, rate: '' as any, unit: 'Nos', discPercent: '' as any, discAmt: '' as any, total: 0 });
                setTimeout(() => {
                  const inputs = document.querySelectorAll<HTMLElement>('[data-row-product] input');
                  if (inputs.length > 0) inputs[inputs.length - 1].focus();
                }, 100);
              }}
              className="border border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#1E3A8A] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <Plus size={14} /> Add Row (F2)
            </button>
            <button
              type="button"
              onClick={() => reset()}
              className="border border-[#713F12] text-[#713F12] hover:bg-[#713F12] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <RefreshCw size={14} /> Clear (F4)
            </button>
            <button
              type="button"
              onClick={() => navigate('/sales')}
              className="border border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#1E3A8A] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <List size={14} /> Sales List
            </button>
            <button
              type="button"
              onClick={() => navigate('/reports/sales')}
              className="border border-[#1E3A8A] text-[#1E3A8A] hover:bg-[#1E3A8A] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <FileText size={14} /> Sales Report
            </button>
            <button
              type="button"
              onClick={() => setIsHelpModalOpen(true)}
              className="border border-[#0F766E] text-[#0F766E] hover:bg-[#0F766E] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <Keyboard size={14} /> Shortcuts
            </button>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full border-collapse border border-[#E5E7EB] min-w-[1000px] md:min-w-[1200px] whitespace-nowrap responsive-table">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#0F172A] text-white">
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-10">#</th>
                  <th className="px-2 py-2 text-left text-[12px] font-bold border border-[#334155]">Product Code / Name</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-20">Stock</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-20">Unit</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-24">Qty</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-28">Rate</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-20">Disc %</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-24">Disc Amt</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-32">Total</th>
                  <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-16">Act</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                    <td data-label="#" className="px-2 py-1 text-center text-[13px] border-r border-[#E5E7EB] relative group">
                      {index + 1}
                    </td>
                    <td data-label="Product" className="px-2 py-1 border-r border-[#E5E7EB]">
                      <div data-row-product={index} onKeyDownCapture={(e) => {
                        if (e.ctrlKey && e.key === 'Delete' && fields.length > 1) {
                          e.preventDefault();
                          e.stopPropagation();
                          remove(index);
                          setTimeout(() => {
                            const selectEl = document.querySelector<HTMLElement>(`[data-row-product="${Math.max(0, index - 1)}"] input`);
                            if (selectEl) selectEl.focus();
                          }, 50);
                        }
                      }}>
                        <SearchableSelect
                          value={watch(`items.${index}.productId`)}
                          autoFocus={index === fields.length - 1 && watch(`items.${index}.productId`) === 0}
                          onChange={(val) => {
                            setValue(`items.${index}.productId`, Number(val));
                            handleProductChange(index, String(val));
                            if (Number(val) === 0) {
                              if (index === fields.length - 1) {
                                append({ productId: 0, quantity: '' as any, noOfBirds: '' as any, stock: 0, rate: '' as any, unit: 'Nos', discPercent: '' as any, discAmt: '' as any, total: 0 });
                                setTimeout(() => {
                                  const inputs = document.querySelectorAll<HTMLElement>('[data-row-product] input');
                                  if (inputs.length > 0) inputs[inputs.length - 1].focus();
                                }, 100);
                              } else {
                                setTimeout(() => {
                                  const selectEl = document.querySelector<HTMLElement>(`[data-row-product="${index + 1}"] input`);
                                  if (selectEl) selectEl.focus();
                                }, 100);
                              }
                            } else {
                              setTimeout(() => focusCell(index, 2), 100);
                            }
                          }}
                          options={[
                            { label: 'Type product name / code...', value: 0 },
                            ...products.map((p: any) => ({ label: `${p.code} - ${p.name}`, value: p.id }))
                          ]}
                        />
                      </div>
                    </td>
                    <td data-label="Stock" className="px-2 py-1 border-r border-[#E5E7EB] text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-white ${watch(`items.${index}.stock`) > 0 ? 'bg-[#059669]' : 'bg-[#EF4444]'}`}>
                        {Number(Number(watch(`items.${index}.stock`)).toFixed(4))}
                      </span>
                    </td>
                    <td data-label="Unit" className="px-2 py-1 border-r border-[#E5E7EB]">
                      <input {...register(`items.${index}.unit`)} type="text" readOnly tabIndex={-1} className="w-full px-1 py-1 bg-transparent text-[13px] outline-none text-center" />
                    </td>
                    <td data-label="Qty" className="px-2 py-1 border-r border-[#E5E7EB]">
                      <input
                        {...register(`items.${index}.quantity`)}
                        data-row={index} data-col={2}
                        onKeyDown={(e) => handleCellKey(e, index, 2, 5)}
                        type="number" step="any" min="0.001" placeholder="0"
                        onFocus={(e) => e.target.select()}
                        className={`w-full px-2 py-1 border rounded text-[13px] outline-none text-center transition-colors ${Number(watch(`items.${index}.quantity`)) > Number(watch(`items.${index}.stock`)) ? 'border-red-500 focus:border-red-500 bg-red-100 text-red-700 font-bold' : 'border-[#D1D5DB] focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50'}`}
                      />
                    </td>
                    <td data-label="Rate" className="px-2 py-1 border-r border-[#E5E7EB]">
                      <div className="flex items-center gap-1">
                        <input
                          {...register(`items.${index}.rate`)}
                          data-row={index} data-col={3}
                          onKeyDown={(e) => handleCellKey(e, index, 3, 5)}
                          type="number" step="0.01" placeholder="0.00"
                          onFocus={(e) => e.target.select()}
                          className={`w-full px-2 py-1 border rounded text-[13px] outline-none text-right font-bold transition-colors ${(() => {
                            const pId = watch(`items.${index}.productId`);
                            const prod = products.find((p: any) => p.id === Number(pId));
                            const currentRate = Number(watch(`items.${index}.rate`)) || 0;
                            if (prod && currentRate > 0 && currentRate <= Number(prod.purchaseRate)) {
                              return 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 bg-red-100 text-red-700';
                            }
                            return 'border-[#CBD5E1] bg-white focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 text-black font-bold';
                          })()}`}
                          onBlur={(e) => {
                            const enteredRate = Number(e.target.value);
                            const pId = watch(`items.${index}.productId`);
                            const product = products.find((p: any) => p.id === Number(pId));
                            if (product && enteredRate > 0 && enteredRate <= Number(product.purchaseRate)) {
                              toast.error(`Validation Error: Sales rate cannot be less than or equal to purchase rate (${formatCurrency(product.purchaseRate)})!`, { duration: 4000 });
                              setValue(`items.${index}.rate`, '' as any);
                            }
                            register(`items.${index}.rate`).onBlur(e);
                          }}
                        />
                        {settings?.enableCustomerRates && !!selectedCustomerId && Number(watch(`items.${index}.productId`)) > 0 && Number(watch(`items.${index}.rate`)) > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const pId = Number(watch(`items.${index}.productId`));
                              const rVal = Number(watch(`items.${index}.rate`));
                              saveCustomerRateMutation.mutate({ productId: pId, rate: rVal });
                            }}
                            className="p-1 bg-green-50 text-green-600 border border-green-300 rounded hover:bg-green-600 hover:text-white transition-colors shrink-0"
                            title="Save this rate as customer fixed rate"
                          >
                            <DollarSign size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td data-label="Disc %" className="px-2 py-1 border-r border-[#E5E7EB]">
                      <input
                        {...register(`items.${index}.discPercent`)}
                        data-row={index} data-col={4}
                        onKeyDown={(e) => handleCellKey(e, index, 4, 5)}
                        type="number" step="0.01" placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          register(`items.${index}.discPercent`).onChange(e);
                          const pct = Number(e.target.value) || 0;
                          const rate = Number(watch(`items.${index}.rate`)) || 0;
                          const q = Number(watch(`items.${index}.quantity`)) || 0;
                          const amt = (rate * q * pct) / 100;
                          setValue(`items.${index}.discAmt`, Number(amt.toFixed(2)));
                        }}
                        className="w-full px-2 py-1 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 text-right"
                      />
                    </td>
                    <td data-label="Disc Amt" className="px-2 py-1 border-r border-[#E5E7EB]">
                      <input
                        {...register(`items.${index}.discAmt`)}
                        data-row={index} data-col={5}
                        onKeyDown={(e) => handleCellKey(e, index, 5, 5)}
                        type="number" step="0.01" placeholder="0.00"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          register(`items.${index}.discAmt`).onChange(e);
                          const amt = Number(e.target.value) || 0;
                          const rate = Number(watch(`items.${index}.rate`)) || 0;
                          const q = Number(watch(`items.${index}.quantity`)) || 0;
                          const totalGross = rate * q;
                          if (totalGross > 0) {
                            const pct = (amt / totalGross) * 100;
                            setValue(`items.${index}.discPercent`, Number(pct.toFixed(2)));
                          } else {
                            setValue(`items.${index}.discPercent`, 0);
                          }
                        }}
                        className="w-full px-2 py-1 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 text-right"
                      />
                    </td>
                    <td data-label="Total" className="px-2 py-1 border-r border-[#E5E7EB]">
                      <input value={Number(watch(`items.${index}.total`) || 0).toFixed(2)} readOnly tabIndex={-1} className="w-full px-2 py-1 bg-transparent text-[13px] outline-none text-right font-bold" onChange={() => { }} />
                    </td>
                    <td data-label="Action" className="px-2 py-1 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => append({ productId: 0, quantity: '' as any, stock: 0, rate: '' as any, unit: 'Nos', discPercent: '' as any, discAmt: '' as any, total: 0 })}
                          className="bg-[#10B981] text-white p-1.5 rounded hover:bg-[#059669] transition-colors shadow-sm"
                          title="Add Row"
                        >
                          <Plus size={14} strokeWidth={3} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          className="bg-red-50 text-red-500 p-1.5 rounded hover:bg-red-500 hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-red-50 disabled:hover:text-red-500"
                          title="Remove Row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabs & Footer Calculation Area */}
        <div className="bg-[#F9FAFB] shrink-0">

          <div className="p-3 sm:p-4 bg-white border-b border-[#E5E7EB]">
            {activeTab === 'Amount Details' && (
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 md:gap-6">

                <div className="w-full md:flex-1 flex flex-col gap-1">
                  <label className="text-[13px] font-extrabold text-black font-bold uppercase">Gross Amount:</label>
                  <input
                    value={Number(watch('grossAmount') || 0).toFixed(2)}
                    readOnly
                    className="w-full px-3 py-2 border-2 border-[#D1D5DB] bg-[#F3F4F6] rounded text-[18px] outline-none text-right font-bold text-black font-bold"
                    onChange={() => { }}
                  />
                </div>

                <div className="w-full md:flex-1 flex flex-col gap-1">
                  <label className="text-[13px] font-extrabold text-black font-bold uppercase">Total Discount:</label>
                  <div className="flex gap-2 w-full">
                    <div className="relative w-1/2">
                      <input
                        {...register('totalDiscountPercent')}
                        type="number" step="0.01"
                        onChange={(e) => {
                          register('totalDiscountPercent').onChange(e);
                          const percent = Number(e.target.value) || 0;
                          const amount = (watch('grossAmount') * percent) / 100;
                          setValue('totalDiscount', Number(amount.toFixed(2)));
                        }}
                        className="w-full pl-2 pr-6 py-2 border-2 border-[#D1D5DB] rounded text-[16px] outline-none focus:border-[#3B82F6] text-right font-bold text-black font-bold"
                        placeholder="0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-black font-bold text-[14px] pointer-events-none">%</span>
                    </div>

                    <div className="relative w-1/2">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-black font-bold text-[15px] pointer-events-none">{settings?.currencySymbol || 'RM'}</span>
                      <input
                        {...register('totalDiscount')}
                        type="number" step="0.01"
                        onChange={(e) => {
                          register('totalDiscount').onChange(e);
                          const amt = Number(e.target.value) || 0;
                          const grossAmt = watch('grossAmount');
                          if (grossAmt > 0) {
                            setValue('totalDiscountPercent', Number(((amt / grossAmt) * 100).toFixed(2)));
                          } else {
                            setValue('totalDiscountPercent', 0);
                          }
                        }}
                        className="w-full pl-8 pr-3 py-2 border-2 border-[#D1D5DB] rounded text-[16px] outline-none focus:border-[#3B82F6] text-right font-bold text-black font-bold"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="w-full md:flex-1 flex flex-col gap-1">
                  <label className="text-[14px] font-black text-[#1E3A8A] uppercase">NET AMOUNT:</label>
                  <input
                    value={Number(watch('netAmount') || 0).toFixed(2)}
                    readOnly
                    className="w-full px-3 py-2 border-2 border-[#059669] bg-[#ECFDF5] text-[#059669] rounded text-[22px] outline-none text-right font-black shadow-inner"
                    onChange={() => { }}
                  />
                </div>

                <div className="w-full md:flex-1 flex flex-col gap-1">
                  {/* Empty space to balance layout */}
                </div>

              </div>
            )}
            {activeTab !== 'Amount Details' && (
              <div className="text-[13px] text-black font-bold italic py-4">
                More fields will go here in future updates.
              </div>
            )}
          </div>

          {/* Bottom Black Bar */}
          <div className="bg-[#020617] text-white px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-0">
            <div className="flex flex-nowrap justify-between sm:justify-center gap-1 sm:gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={() => append({ productId: 0, quantity: '' as any, stock: 0, rate: '' as any, unit: 'Nos', discPercent: '' as any, discAmt: '' as any, total: 0 })}
                className="bg-[#2563EB] text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer hover:bg-[#1D4ED8] whitespace-nowrap"
              >
                <span className="opacity-70 border-r border-[#60A5FA] pr-1 mr-1">F2</span> Add Row
              </button>
              <button
                type="button"
                disabled={createMutation.isPending}
                className="bg-[#059669] text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer hover:bg-[#047857] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                onClick={handleSubmit(onSubmit as any, onError)}
              >
                <span className="opacity-70 border-r border-[#34D399] pr-1 mr-1">F10</span>
                {createMutation.isPending ? 'Saving...' : 'Save & Print'}
              </button>
              <button
                type="button"
                className="bg-[#0891B2] text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer hover:bg-[#0E7490] whitespace-nowrap"
                onClick={() => navigate('/dashboard')}
              >
                <span className="opacity-70 border-r border-[#67E8F9] pr-1 mr-1">Esc</span> Dashboard
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-none border-gray-700 pt-3 md:pt-0">
              <span className="text-[16px] sm:text-[20px] font-black text-white uppercase tracking-wider">TOTAL NET AMOUNT:</span>
              <span className="text-[28px] sm:text-[36px] font-black text-[#38BDF8] drop-shadow-md">
                {formatCurrency(watch('netAmount') || 0)}
              </span>
            </div>
          </div>

        </div>

      </form>

      {/* Quick Add Customer Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-lg w-full max-w-md overflow-hidden flex flex-col">
            <div className="bg-[#059669] text-white px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-[15px]">
                <UserPlus size={18} /> Quick Add New Customer
              </div>
              <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="hover:text-black hover:font-bold">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div>
                <label className="block text-[13px] font-bold text-black font-bold mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-[13px] text-black font-bold mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-[13px] text-black font-bold mb-1">Billing Address</label>
                <textarea
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] min-h-[80px]"
                />
              </div>
            </div>
            <div className="p-4 bg-white pt-2 border-none pb-5">
              <button
                type="button"
                onClick={handleQuickAddCustomer}
                disabled={!newCustomer.name || addCustomerMutation.isPending}
                className="w-full bg-[#059669] hover:bg-[#047857] text-white py-2.5 rounded font-bold text-[14px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Save size={16} /> Save Customer & Select
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Modal for Printing */}
      <InvoicePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        sale={saleToPrint}
      />

      {/* Keyboard Shortcuts Help Modal */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-[#E5E7EB] bg-[#F8FAFC]">
              <h2 className="text-lg font-bold text-[#1E293B] flex items-center gap-2">
                <Keyboard size={20} className="text-[#3B82F6]" /> Keyboard Shortcuts
              </h2>
              <button onClick={() => setIsHelpModalOpen(false)} className="text-gray-500 hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <span className="text-sm font-bold text-gray-700">Add New Row</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">F2</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <span className="text-sm font-bold text-gray-700">Save Invoice</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">F3</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <span className="text-sm font-bold text-gray-700">Clear Form</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">F4</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <span className="text-sm font-bold text-gray-700">Go to Dashboard</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">Esc</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-[#F1F5F9] pb-3">
                  <span className="text-sm font-bold text-gray-700">Delete Current Row</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">Ctrl</kbd>
                    <span className="text-gray-400 font-bold">+</span>
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">Del</kbd>
                  </div>
                </div>
                <div className="flex justify-between items-center pb-1">
                  <span className="text-sm font-bold text-gray-700">Move to Next Cell / Row</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">Enter</kbd>
                    <span className="text-gray-400 font-bold text-[12px] self-center">or</span>
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">Tab</kbd>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 bg-[#F8FAFC] border-t border-[#E5E7EB] text-center">
              <button
                onClick={() => setIsHelpModalOpen(false)}
                className="bg-[#3B82F6] hover:bg-[#2563EB] text-white px-6 py-2 rounded-md font-bold text-sm transition-colors shadow-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loss Warning Modal */}
      {showLossWarning && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-red-500 p-4 text-white flex items-center gap-3">
              <AlertTriangle size={24} />
              <h2 className="text-lg font-bold">Loss Warning!</h2>
            </div>
            <div className="p-6">
              <p className="text-black font-bold mb-2 text-[15px]">One or more items are being sold at or below their purchase rate.</p>
              <p className="text-black font-bold text-sm font-bold">Are you absolutely sure you want to proceed with this sale and take a loss?</p>
            </div>
            <div className="bg-gray-50 p-4 flex justify-end gap-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => { setShowLossWarning(false); setPendingPayload(null); }}
                className="px-4 py-2 border border-gray-300 bg-white rounded font-bold text-black font-bold hover:bg-gray-100 transition-colors"
              >
                No, Cancel
              </button>
              <button
                type="button"
                onClick={confirmLossWarning}
                className="px-4 py-2 bg-red-600 rounded font-bold text-white hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                Yes, Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col transform transition-all scale-100">
            <div className="bg-gradient-to-r from-[#0F172A] to-[#1E3A8A] text-white px-5 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-[16px]">
                <Save size={20} /> Confirm Save Transaction
              </div>
              <button type="button" onClick={() => setIsSaveModalOpen(false)} className="text-white/80 hover:text-white transition-colors bg-white/10 hover:bg-white/20 p-1.5 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 text-center">
              <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-6 shadow-sm border border-blue-100">
                <p className="font-bold text-[15px]">Net Amount: {formatCurrency(pendingSavePayload?.grandTotal || 0)}</p>
                <p className="text-[13px] mt-1 text-blue-600">Invoice No: {pendingSavePayload?.invoiceNo}</p>
              </div>
              <p className="text-black font-bold mb-2">How would you like to proceed?</p>
            </div>

            <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="flex-1 bg-white border-2 border-[#E2E8F0] hover:border-[#94A3B8] hover:bg-[#F8FAFC] text-black font-bold py-2.5 rounded-lg font-bold text-[14px] transition-all flex items-center justify-center gap-2"
              >
                <Save size={16} /> Save Only
              </button>
              <button
                type="button"
                onClick={() => handleConfirmSave(true)}
                className="flex-1 bg-gradient-to-r from-[#10B981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white py-2.5 rounded-lg font-bold text-[14px] transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Printer size={16} /> Save & Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Confirmation Modal */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
            <div className="bg-[#EF4444] px-4 py-3 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center gap-2">Confirm Navigation</h3>
              <button type="button" onClick={() => setIsLeaveModalOpen(false)} className="hover:text-white/80 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-black font-bold mb-1 text-center">Are you sure you want to leave?</p>
              <p className="text-black font-bold text-[13px] text-center mb-5">Any unsaved changes will be lost.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-black font-bold rounded hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard')}
                  className="flex-1 px-4 py-2 bg-[#EF4444] text-white font-bold rounded hover:bg-red-600 transition-colors"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default POS;
