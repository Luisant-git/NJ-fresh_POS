import { getMalaysiaDateStr } from '../../utils/date';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { List, Plus, Trash2, CheckCircle, PlusCircle, X, RotateCcw, FileText, Save, ArrowLeft, Keyboard } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import SearchableSelect from '../../components/SearchableSelect';

const purchaseItemSchema = z.object({
  productId: z.coerce.number().min(0),
  quantity: z.coerce.number().min(0),
  unit: z.string().optional(),
  pRate: z.coerce.number().min(0),
  wRate: z.coerce.number().min(0),
  sRate: z.coerce.number().min(0),
  mrp: z.coerce.number().min(0),
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
    if (data.pRate < 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Purchase Rate is required",
        path: ["pRate"]
      });
    }
  }
});

const purchaseSchema = z.object({
  supplierId: z.coerce.number().min(1, 'Supplier is required').or(z.literal(0)),
  invoiceNo: z.string().min(1, 'Supplier Invoice number is required'),
  invoiceDate: z.string().optional(),
  entryNo: z.string(),
  date: z.string(),
  paymentModeId: z.coerce.number().min(1, 'Payment Mode is required').or(z.literal(0)),
  
  totalAmount: z.coerce.number(),
  totalDiscount: z.coerce.number(),
  totalDiscountPercent: z.coerce.number().optional(),
  roundOff: z.coerce.number(),
  netAmount: z.coerce.number(),

  items: z.array(purchaseItemSchema).min(1, 'At least one item is required'),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

const PurchaseEntry = () => {
  const { settings, formatCurrency } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const editId = searchParams.get('edit');
  const queryClient = useQueryClient();
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', phone: '', address: '' });

  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState<any>(null);

  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const printAfterSaveRef = useRef(false);

  const { register, control, handleSubmit, watch, setValue, reset } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema) as any,
    defaultValues: {
      entryNo: 'Generating...',
      invoiceNo: '',
      invoiceDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' }),
      supplierId: 0,
      date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kuala_Lumpur' }),
      paymentModeId: 0,
      items: [{ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 }],
      totalAmount: 0,
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

  // Fetch Masters & Next Entry No
  // Fetch existing purchase if editing
  const { data: existingPurchase } = useQuery({
    queryKey: ['purchase', editId],
    queryFn: async () => {
      const res = await api.get(`/purchases/${editId}`);
      return res.data;
    },
    enabled: !!editId
  });

  useEffect(() => {
    if (existingPurchase) {
      reset({
        entryNo: existingPurchase.invoiceNo,
        invoiceNo: existingPurchase.supplierInvoiceNo || '',
        invoiceDate: existingPurchase.invoiceDate ? getMalaysiaDateStr(existingPurchase.invoiceDate) : '',
        supplierId: existingPurchase.supplierId,
        date: existingPurchase.date ? getMalaysiaDateStr(existingPurchase.date) : '',
        paymentModeId: existingPurchase.paymentModeId,
        items: existingPurchase.items.map((item: any) => ({
          productId: item.productId,
          quantity: Number(Number(item.quantity).toFixed(4)),
          unit: item.product?.unit?.shortCode || item.product?.unit?.name || 'Nos',
          pRate: item.rate,
          wRate: item.product?.wholesaleRate || 0,
          sRate: item.product?.sellingRate || 0,
          mrp: item.product?.mrp || 0,
          discPercent: 0,
          discAmt: 0,
          total: item.amount
        })),
        totalAmount: existingPurchase.subtotal,
        totalDiscount: existingPurchase.discount,
        totalDiscountPercent: 0 as any,
        roundOff: existingPurchase.grandTotal - (existingPurchase.subtotal - existingPurchase.discount),
        netAmount: existingPurchase.grandTotal
      });
    }
  }, [existingPurchase, reset]);

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await api.get('/suppliers')).data });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: async () => (await api.get('/products')).data });
  const { data: paymentModes = [] } = useQuery({ queryKey: ['paymentModes'], queryFn: async () => (await api.get('/payment-modes')).data });
  const { data: nextEntryData } = useQuery({ queryKey: ['nextEntryNo'], queryFn: async () => (await api.get('/purchases/next-entry-no')).data });

  // Update default entry no
  useEffect(() => {
    if (!editId && nextEntryData?.entryNo) {
      setValue('entryNo', nextEntryData.entryNo);
    }
  }, [nextEntryData, editId, setValue]);

  // Watch values for calculation
  const items = watch('items');
  const watchTotalDiscount = watch('totalDiscount');
  const watchRoundOff = watch('roundOff');
  
  // Calculations
  useEffect(() => {
    let totalAmount = 0;
    
    items.forEach((item, index) => {
      const q = Number(item.quantity) || 0;
      const pRate = Number(item.pRate) || 0;
      
      let discAmt = Number(item.discAmt) || 0;


      const total = (q * pRate) - discAmt;
      
      if (item.total !== total) {
        setValue(`items.${index}.total`, Number(total.toFixed(2)), { shouldValidate: false });
      }
      totalAmount += total;
    });

    const d = Number(watchTotalDiscount) || 0;
    const r = Number(watchRoundOff) || 0;
    const netAmount = totalAmount - d + r;

    setValue('totalAmount', Number(totalAmount.toFixed(2)));
    setValue('netAmount', Number(netAmount.toFixed(2)));

  }, [JSON.stringify(items), watchTotalDiscount, watchRoundOff, setValue]);

  const handleProductChange = async (index: number, productId: string) => {
    const product = products.find((p: any) => p.id === Number(productId));
    if (product) {
      setValue(`items.${index}.unit`, product.unit?.shortCode || product.unit?.name || 'Nos');
      
      try {
        const response = await api.get(`/purchases/latest-rate/${productId}`);
        const latest = response.data;
        if (latest) {
          setValue(`items.${index}.pRate`, Number(Number(latest.rate || product.purchaseRate || 0).toFixed(4)));
          setValue(`items.${index}.wRate`, Number(Number(latest.wRate || product.wholesaleRate || 0).toFixed(4)));
          setValue(`items.${index}.sRate`, Number(Number(latest.sRate || product.sellingRate || 0).toFixed(4)));
          setValue(`items.${index}.mrp`, Number(Number(latest.mrp || product.mrp || 0).toFixed(4)));
        } else {
          setValue(`items.${index}.pRate`, Number(Number(product.purchaseRate || 0).toFixed(4)));
          setValue(`items.${index}.wRate`, Number(Number(product.wholesaleRate || 0).toFixed(4)));
          setValue(`items.${index}.sRate`, Number(Number(product.sellingRate || 0).toFixed(4)));
          setValue(`items.${index}.mrp`, Number(Number(product.mrp || 0).toFixed(4)));
        }
      } catch (e) {
        setValue(`items.${index}.pRate`, Number(Number(product.purchaseRate || 0).toFixed(4)));
        setValue(`items.${index}.wRate`, Number(Number(product.wholesaleRate || 0).toFixed(4)));
        setValue(`items.${index}.sRate`, Number(Number(product.sellingRate || 0).toFixed(4)));
        setValue(`items.${index}.mrp`, Number(Number(product.mrp || 0).toFixed(4)));
      }
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: PurchaseFormValues) => api.post('/purchases', data),
    onSuccess: () => {
      toast.success('Purchase recorded successfully!');
      
      setTimeout(() => {
        if (printAfterSaveRef.current) {
          window.print();
        }
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['nextEntryNo'] });
        reset();
        navigate('/purchase');
      }, 100);
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to record purchase. Please check your inputs.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put(`/purchases/${editId}`, data),
    onSuccess: () => {
      toast.success('Purchase updated successfully!');
      setTimeout(() => {
        if (printAfterSaveRef.current) {
          window.print();
        }
        queryClient.invalidateQueries({ queryKey: ['products'] });
        queryClient.invalidateQueries({ queryKey: ['purchases'] });
        reset();
        navigate('/purchase');
      }, 100);
    },
    onError: (error) => {
      console.error(error);
      toast.error('Failed to update purchase. Please check your inputs.');
    }
  });

  const onSubmit = (data: PurchaseFormValues) => {
    if (!data.supplierId) {
      toast.error('Please select a Supplier before saving.');
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
      supplierInvoiceNo: data.invoiceNo,
      invoiceNo: data.entryNo,
      invoiceDate: data.invoiceDate ? new Date(data.invoiceDate).toISOString() : null,
      subtotal: data.totalAmount,
      discount: data.totalDiscount,
      tax: 0,
      grandTotal: data.netAmount,
      items: validItems.map(item => ({
        productId: item.productId,
        quantity: Number(Number(item.quantity).toFixed(4)),
        rate: item.pRate,
        wRate: item.wRate,
        sRate: item.sRate,
        mrp: item.mrp,
        tax: 0,
        amount: item.total,
      }))
    };

    setPendingSavePayload(payload);
    setIsSaveModalOpen(true);
  };

  const handleConfirmSave = (print: boolean) => {
    printAfterSaveRef.current = print;
    setIsSaveModalOpen(false);
    if (pendingSavePayload) {
      if (editId) {
        updateMutation.mutate(pendingSavePayload as any);
      } else {
        createMutation.mutate(pendingSavePayload as any);
      }
      setPendingSavePayload(null);
    }
  };

  const onError = (errors: any) => {
    toast.error('Validation failed. Please fill all required fields correctly.');
    console.error(errors);
  };

  const handleClear = () => {
    reset({
      entryNo: nextEntryData?.entryNo || 'Generating...',
      invoiceNo: '',
      invoiceDate: getMalaysiaDateStr(),
      supplierId: 0,
      date: getMalaysiaDateStr(),
      paymentModeId: 0,
      items: [{ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 }],
      totalAmount: 0,
      totalDiscountPercent: '' as any,
      totalDiscount: '' as any,
      roundOff: '' as any,
      netAmount: 0
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input/textarea unless it's a function key or escape
      
      if (e.key === 'F10') {
        e.preventDefault();
        handleSubmit(onSubmit as any, onError)();
      } else if (e.key === 'Escape') {
        if (isSupplierModalOpen || isSaveModalOpen || isLeaveModalOpen || isHelpModalOpen) {
          setIsSupplierModalOpen(false);
          setIsSaveModalOpen(false);
          setIsLeaveModalOpen(false);
          setIsHelpModalOpen(false);
        } else {
          setIsLeaveModalOpen(true);
        }
      } else if (e.key === 'F2') {
        e.preventDefault();
        append({ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 });
        setTimeout(() => {
          const inputs = document.querySelectorAll<HTMLElement>('[data-row-product] input');
          if (inputs.length > 0) inputs[inputs.length - 1].focus();
        }, 100);
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit, isSupplierModalOpen, isSaveModalOpen, isLeaveModalOpen, isHelpModalOpen, append, navigate, onSubmit, onError, handleClear]);

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
        append({ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 });
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

  const addSupplierMutation = useMutation({
    mutationFn: (data: any) => api.post('/suppliers', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsSupplierModalOpen(false);
      setNewSupplier({ name: '', phone: '', address: '' });
      if (res.data && res.data.id) {
        setValue('supplierId', res.data.id);
      }
    },
    onError: () => {
      toast.error('Failed to add supplier.');
    }
  });

  const handleQuickAddSupplier = () => {
    if (!newSupplier.name) return;
    addSupplierMutation.mutate(newSupplier);
  };





  const selectedSupplierId = watch('supplierId');
  const selectedSupplier = suppliers.find((s: any) => s.id === Number(selectedSupplierId));

  return (
    <div className="absolute inset-0 bg-[#F3F4F6] flex flex-col font-sans overflow-hidden z-10">
      
      {/* Top Bar */}
      <div className="bg-[#0B355B] text-white px-2 sm:px-4 py-2 flex flex-wrap gap-2 justify-between items-center shrink-0">
        <div className="flex flex-wrap gap-2">
          <button 
            type="button"
            onClick={handleSubmit(onSubmit as any, onError)}
            className="bg-[#059669] hover:bg-[#047857] text-white px-4 py-1.5 rounded flex items-center gap-2 font-bold text-[13px] transition-colors"
          >
            <CheckCircle size={16} /> {editId ? 'UPDATE PURCHASE (F10)' : 'SAVE PURCHASE (F10)'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsHelpModalOpen(true)}
            className="bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded flex items-center gap-1.5 text-[13px] font-bold transition-colors"
          >
            <Keyboard size={16} /> Shortcuts (Help)
          </button>
          <button 
            onClick={() => setIsLeaveModalOpen(true)}
            className="text-white hover:text-white/80 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft size={16} /> Back (Esc)
          </button>
        </div>
      </div>

      <form className="flex flex-col flex-1 overflow-y-auto custom-scrollbar" onSubmit={handleSubmit(onSubmit as any, onError)}>
        
        {/* Header Section */}
        <div className="bg-white p-3 sm:p-4 border-b border-[#E5E7EB] shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:flex lg:flex-row gap-3 sm:gap-4">
            
            <div className="w-full lg:flex-1 lg:max-w-[200px]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Entry No *</label>
              <input
                {...register('entryNo')}
                type="text"
                readOnly
                className="w-full px-2 py-1.5 border border-[#D1D5DB] bg-[#F9FAFB] rounded text-[13px] font-bold outline-none"
              />
            </div>
            
            <div className="w-full lg:flex-1 lg:max-w-[250px]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Supplier Invoice number *</label>
              <input
                {...register('invoiceNo')}
                type="text"
                placeholder="Supplier Bill No"
                className="w-full px-2 py-1.5 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6]"
              />
            </div>

            <div className="w-full lg:flex-[2]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Supplier Name *</label>
              <div className="flex flex-col gap-1">
                <div className="flex-1 w-full">
                <SearchableSelect
                  value={watch('supplierId')}
                  onChange={(val) => setValue('supplierId', Number(val))}
                  options={[
                    { label: 'Click or type supplier name / phone...', value: 0 },
                    ...suppliers.map((s: any) => ({ label: `${s.name} - ${s.phone || ''}`, value: s.id }))
                  ]}
                />
                </div>
                <div className="flex justify-between items-center mt-1">
                  <button type="button" onClick={() => setIsSupplierModalOpen(true)} className="bg-[#059669] hover:bg-[#047857] text-white px-2 py-1 rounded transition-colors flex items-center gap-1 text-[11px] font-bold">
                    <Plus size={12} /> Add Supplier
                  </button>
                  <span className="text-[11px] text-black font-bold text-right flex-1 ml-2">
                    {selectedSupplier ? `${selectedSupplier.address || 'Standard Vendor'}` : 'Standard Vendor'}
                  </span>
                </div>
              </div>
            </div>

            <div className="w-full lg:flex-1 lg:max-w-[200px]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Invoice date</label>
              <input
                {...register('invoiceDate')}
                type="date"
                className="w-full px-2 py-1.5 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6]"
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

            <div className="w-full lg:flex-1 lg:max-w-[200px]">
              <label className="block text-[11px] font-bold text-black font-bold mb-1">Mode</label>
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
          <div className="flex flex-wrap justify-end gap-2 mb-2 p-2 min-w-[300px] border-b border-[#E5E7EB]">
            <button 
              type="button"
              onClick={() => {
                append({ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 });
                setTimeout(() => {
                  const inputs = document.querySelectorAll<HTMLElement>('[data-row-product] input');
                  if (inputs.length > 0) inputs[inputs.length - 1].focus();
                }, 100);
              }}
              className="border border-[#0B355B] text-[#0B355B] hover:bg-[#0B355B] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <PlusCircle size={14} /> Add Row (F2)
            </button>
            <button 
              type="button"
              onClick={handleClear}
              className="border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <RotateCcw size={14} /> Clear (F4)
            </button>
            <button 
              type="button"
              onClick={() => navigate('/purchase')}
              className="border border-[#0B355B] text-[#0B355B] hover:bg-[#0B355B] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <List size={14} /> Purchase List
            </button>
            <button 
              type="button"
              onClick={() => navigate('/reports/purchase')}
              className="border border-[#0B355B] text-[#0B355B] hover:bg-[#0B355B] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <FileText size={14} /> Purchase Report
            </button>
            <button 
              type="button"
              onClick={() => setIsHelpModalOpen(true)}
              className="border border-[#0B355B] text-[#0B355B] hover:bg-[#0B355B] hover:text-white px-3 py-1 rounded flex items-center gap-1 text-[12px] transition-colors font-bold"
            >
              <Keyboard size={14} /> Shortcuts
            </button>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full border-collapse border border-[#E5E7EB] md:min-w-[1200px] whitespace-nowrap responsive-table">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#0F172A] text-white">
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-10">#</th>
                <th className="px-2 py-2 text-left text-[12px] font-bold border border-[#334155]">Item Code / Name</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-20">Qty</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-20">Unit</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-24">PRate</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-24">WRate</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-24">SRate</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-24">MRP</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-20">Disc %</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-24">Disc Amt</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-28">Total</th>
                <th className="px-2 py-2 text-center text-[12px] font-bold border border-[#334155] w-16">Act</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={field.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                  <td data-label="#" className="px-2 py-1 text-center text-[13px] border-r border-[#E5E7EB] relative group">{index + 1}</td>
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
                              append({ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 });
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
                            setTimeout(() => focusCell(index, 1), 100);
                          }
                        }}
                        options={[
                          { label: 'Type product name / code...', value: 0 },
                          ...products.map((p: any) => ({ label: `${p.code} - ${p.name}`, value: p.id }))
                        ]}
                      />
                    </div>
                  </td>
                  <td data-label="Stock" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input 
                      {...register(`items.${index}.quantity`)} 
                      data-row={index} data-col={1}
                      onKeyDown={(e) => handleCellKey(e, index, 1, 5)}
                      type="number" step="any" min="0.001" placeholder="0" 
                      onFocus={(e) => e.target.select()}
                      className="w-full px-2 py-1 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 transition-colors text-center" 
                    />
                  </td>
                  <td data-label="Unit" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input {...register(`items.${index}.unit`)} type="text" readOnly tabIndex={-1} className="w-full px-1 py-1 bg-transparent text-[13px] outline-none text-center" />
                  </td>
                  <td data-label="Qty" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input 
                      {...register(`items.${index}.pRate`)} 
                      data-row={index} data-col={2}
                      onKeyDown={(e) => handleCellKey(e, index, 2, 5)}
                      type="number" step="0.01" placeholder="0.00" 
                      onFocus={(e) => e.target.select()}
                      className="w-full px-2 py-1 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 transition-colors text-right" 
                    />
                  </td>
                  <td data-label="Free" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input {...register(`items.${index}.wRate`)} type="number" step="0.01" placeholder="0.00" readOnly tabIndex={-1} className="w-full px-2 py-1 bg-blue-50/50 border border-blue-200/50 text-blue-700/80 font-bold rounded text-[13px] outline-none text-right cursor-not-allowed" />
                  </td>
                  <td data-label="Pur Rate" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input 
                      {...register(`items.${index}.sRate`)} 
                      data-row={index} data-col={3}
                      onKeyDown={(e) => handleCellKey(e, index, 3, 5)}
                      type="number" step="0.01" placeholder="0.00" 
                      onFocus={(e) => e.target.select()}
                      className="w-full px-2 py-1 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 transition-colors text-right" 
                    />
                  </td>
                  <td data-label="MRP" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input {...register(`items.${index}.mrp`)} type="number" step="0.01" placeholder="0.00" readOnly tabIndex={-1} className="w-full px-2 py-1 bg-blue-50/50 border border-blue-200/50 text-blue-700/80 font-bold rounded text-[13px] outline-none text-right cursor-not-allowed" />
                  </td>
                  <td data-label="Tax %" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input 
                      {...register(`items.${index}.discPercent`)} 
                      data-row={index} data-col={4}
                      onKeyDown={(e) => handleCellKey(e, index, 4, 5)}
                      type="number" step="0.01" placeholder="0" 
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        register(`items.${index}.discPercent`).onChange(e);
                        const pct = Number(e.target.value) || 0;
                        const rate = Number(watch(`items.${index}.pRate`)) || 0;
                        const q = Number(watch(`items.${index}.quantity`)) || 0;
                        const amt = (rate * q * pct) / 100;
                        setValue(`items.${index}.discAmt`, Number(amt.toFixed(2)));
                      }}
                      className="w-full px-2 py-1 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 transition-colors text-right" 
                    />
                  </td>
                  <td data-label="Tax Amt" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input 
                      {...register(`items.${index}.discAmt`)} 
                      data-row={index} data-col={5}
                      onKeyDown={(e) => handleCellKey(e, index, 5, 5)}
                      type="number" step="0.01" placeholder="0.00" 
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        register(`items.${index}.discAmt`).onChange(e);
                        const amt = Number(e.target.value) || 0;
                        const rate = Number(watch(`items.${index}.pRate`)) || 0;
                        const q = Number(watch(`items.${index}.quantity`)) || 0;
                        const totalGross = rate * q;
                        if (totalGross > 0) {
                          const pct = (amt / totalGross) * 100;
                          setValue(`items.${index}.discPercent`, Number(pct.toFixed(2)));
                        } else {
                          setValue(`items.${index}.discPercent`, 0);
                        }
                      }}
                      className="w-full px-2 py-1 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] focus:bg-blue-50 transition-colors text-right" 
                    />
                  </td>
                  <td data-label="Disc %" className="px-2 py-1 border-r border-[#E5E7EB]">
                    <input value={Number(watch(`items.${index}.total`) || 0).toFixed(2)} readOnly tabIndex={-1} className="w-full px-2 py-1 bg-transparent text-[13px] outline-none text-right font-bold" onChange={() => {}} />
                  </td>
                  <td data-label="Disc Amt" className="px-2 py-1 text-center">
                    <div className="flex justify-center gap-2">
                      <button 
                        type="button" 
                        onClick={() => append({ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 })} 
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

        {/* Footer Calculation Area */}
        <div className="bg-white border-t border-[#E5E7EB] p-3 sm:p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 md:gap-6">
            
            <div className="w-full md:flex-1 flex flex-col gap-1">
              <label className="text-[14px] font-extrabold text-black font-bold uppercase">Total Amount:</label>
              <input
                value={Number(watch('totalAmount') || 0).toFixed(2)}
                readOnly
                className="w-full px-3 py-2 border border-[#D1D5DB] bg-[#F9FAFB] rounded text-[20px] outline-none text-right font-black text-black font-bold"
                onChange={() => {}}
              />
            </div>

            <div className="w-full md:flex-1 flex flex-col gap-1">
              <label className="text-[14px] font-extrabold text-black font-bold uppercase">Total Discount:</label>
              <div className="flex gap-2 w-full">
                <div className="relative w-1/2">
                  <input
                    {...register('totalDiscountPercent')}
                    type="number" step="0.01"
                    onChange={(e) => {
                      register('totalDiscountPercent').onChange(e);
                      const percent = Number(e.target.value) || 0;
                      const amount = (watch('totalAmount') * percent) / 100;
                      setValue('totalDiscount', Number(amount.toFixed(2)));
                    }}
                    className="w-full pl-2 pr-6 py-2 border border-[#D1D5DB] rounded text-[16px] outline-none focus:border-[#3B82F6] text-right font-black text-black font-bold"
                    placeholder="0"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-black font-bold font-black text-[14px] pointer-events-none">%</span>
                </div>
                <div className="relative w-1/2">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-black font-bold font-black text-[14px] pointer-events-none">{settings?.currencySymbol || 'RM'}</span>
                  <input
                    {...register('totalDiscount')}
                    type="number" step="0.01"
                    onChange={(e) => {
                      register('totalDiscount').onChange(e);
                      const amt = Number(e.target.value) || 0;
                      const totalAmt = watch('totalAmount');
                      if (totalAmt > 0) {
                        setValue('totalDiscountPercent', Number(((amt / totalAmt) * 100).toFixed(2)));
                      } else {
                        setValue('totalDiscountPercent', 0);
                      }
                    }}
                    className="w-full pl-8 pr-3 py-2 border border-[#D1D5DB] rounded text-[16px] outline-none focus:border-[#3B82F6] text-right font-black text-[#EF4444]"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="w-full md:flex-1 flex flex-col gap-1"></div>
            <div className="w-full md:flex-1 flex flex-col gap-1"></div>

          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-0 mt-auto shrink-0">
          <div className="flex flex-nowrap justify-between sm:justify-center gap-1 sm:gap-2 w-full md:w-auto">
            <button 
              type="button"
              onClick={() => append({ productId: 0, quantity: '' as any, unit: 'Nos', pRate: '' as any, wRate: '' as any, sRate: '' as any, mrp: '' as any, discPercent: '' as any, discAmt: '' as any, total: 0 })}
              className="bg-[#2563EB] text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              <span className="opacity-70 border-r border-[#60A5FA] pr-1 mr-1">F2</span> Add Row
            </button>

            <button 
              type="button"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[#059669] text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer hover:bg-[#047857] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap" 
              onClick={handleSubmit(onSubmit as any, onError)}
            >
              <span className="opacity-70 border-r border-[#34D399] pr-1 mr-1">F10</span> 
              {createMutation.isPending ? 'Saving...' : 'Save Purchase'}
            </button>
            <button 
              type="button"
              className="bg-[#0891B2] text-white text-[10px] sm:text-[11px] font-bold px-2 sm:px-3 py-1.5 rounded-sm flex items-center gap-1 cursor-pointer hover:bg-[#0E7490] whitespace-nowrap" 
              onClick={() => navigate('/dashboard')}
            >
              <span className="opacity-70 border-r border-[#67E8F9] pr-1 mr-1">Esc</span> Dashboard
            </button>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 w-full md:w-auto justify-between md:justify-end border-t border-gray-200 md:border-none pt-3 md:pt-0">
            <span className="text-[16px] sm:text-[20px] font-extrabold text-black font-bold uppercase tracking-wider">NET PURCHASE AMOUNT:</span>
            <span className="text-[28px] sm:text-[36px] font-black text-[#059669]">
              {formatCurrency(watch('netAmount') || 0)}
            </span>
          </div>
        </div>

      </form>

      {/* Quick Add Supplier Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-lg w-full max-w-md overflow-hidden flex flex-col">
            <div className="bg-[#059669] text-white px-4 py-3 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-[15px]">
                <Plus size={18} /> Quick Add New Supplier
              </div>
              <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="hover:text-black hover:font-bold">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div>
                <label className="block text-[13px] font-bold text-black font-bold mb-1">Supplier Name *</label>
                <input 
                  type="text" 
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({...newSupplier, name: e.target.value})}
                  className="w-full px-3 py-2 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6]" 
                />
              </div>
              <div>
                <label className="block text-[13px] text-black font-bold mb-1">Mobile Number</label>
                <input 
                  type="text" 
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({...newSupplier, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6]" 
                />
              </div>
              <div>
                <label className="block text-[13px] text-black font-bold mb-1">Address</label>
                <textarea 
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({...newSupplier, address: e.target.value})}
                  className="w-full px-3 py-2 border border-[#D1D5DB] rounded text-[13px] outline-none focus:border-[#3B82F6] min-h-[80px]" 
                />
              </div>
            </div>
            <div className="p-4 bg-white pt-2 border-none pb-5">
              <button 
                type="button"
                onClick={handleQuickAddSupplier}
                disabled={!newSupplier.name || addSupplierMutation.isPending}
                className="w-full bg-[#059669] hover:bg-[#047857] text-white py-2.5 rounded font-bold text-[14px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <CheckCircle size={16} /> Save Supplier & Select
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
                <p className="text-[13px] mt-1 text-blue-600">Supplier Invoice No: {pendingSavePayload?.supplierInvoiceNo}</p>
              </div>
              <p className="text-black font-bold mb-2">How would you like to proceed?</p>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button 
                type="button"
                onClick={() => handleConfirmSave(false)}
                className="w-full bg-[#10B981] hover:bg-[#059669] text-white py-2.5 rounded-lg font-bold text-[14px] transition-all shadow-md flex items-center justify-center gap-2"
              >
                <Save size={16} /> Confirm Save
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
                  <span className="text-sm font-bold text-gray-700">Save Purchase</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded-md shadow-sm font-mono text-[11px] font-bold text-gray-800">F10</kbd>
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

    </div>
  );
};

export default PurchaseEntry;
