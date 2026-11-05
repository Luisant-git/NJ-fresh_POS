import { getMalaysiaDateStr } from '../../utils/date';
import { useQuery } from '@tanstack/react-query';
import { X, Printer, FileText, CheckCircle2, Share2 } from 'lucide-react';
import api from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';
import { useState } from 'react';
import InvoicePrintModal from '../../components/InvoicePrintModal';

interface Props {
  saleId: number;
  onClose: () => void;
}

export default function ViewSalesModal({ saleId, onClose }: Props) {
  const { formatCurrency } = useSettings();
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [autoShare, setAutoShare] = useState(false);

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sales', saleId],
    queryFn: async () => (await api.get(`/sales/${saleId}`)).data,
    enabled: !!saleId,
  });

  if (isLoading) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-[60px] z-50 flex items-start justify-center bg-black/50 pt-10">
        <div className="bg-white p-6 rounded-md shadow-lg font-bold text-[#1E3A8A]">Loading invoice details...</div>
      </div>
    );
  }

  if (!sale) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[60px] z-[9999] bg-black/50 flex items-start justify-center overflow-y-auto p-2 sm:p-4">
      <div className="bg-white w-full max-w-5xl shadow-lg flex flex-col max-h-[calc(100vh-60px-1rem)] overflow-hidden animate-sheet-down sm:rounded-md">
        
        {/* Header */}
        <div className="bg-[#3B82F6] text-white px-3 sm:px-4 py-2 sm:py-3 flex items-start sm:items-center justify-between shrink-0 gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 min-w-0">
            <h2 className="font-bold text-[14px] sm:text-[16px] truncate">Sales Invoice - {sale.invoiceNo}</h2>
            <div className="flex gap-2 items-center text-[11px] sm:text-[12px] text-blue-100">
              <span>{getMalaysiaDateStr(sale.date)}</span>
              <span>•</span>
              <span className={`flex items-center gap-1 font-bold px-2 py-0.5 rounded ${sale.paymentMode?.name === 'Credit' ? 'text-rose-800 bg-rose-100' : 'text-emerald-800 bg-[#D1FAE5]'}`}>
                {sale.paymentMode?.name === 'Credit' ? 'CREDIT' : <><CheckCircle2 size={12} /> PAID</>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button 
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-1 sm:gap-1.5 bg-blue-700 hover:bg-blue-800 px-2 sm:px-3 py-1.5 rounded font-bold text-[11px] sm:text-[12px] transition-colors"
            >
              <Printer size={13} /> <span className="hidden sm:inline">Print</span>
            </button>
            <button 
              onClick={() => { setAutoShare(true); setIsPrintModalOpen(true); }}
              className="flex items-center gap-1 sm:gap-1.5 bg-[#25D366] hover:bg-[#1EBE55] px-2 sm:px-3 py-1.5 rounded font-bold text-[11px] sm:text-[12px] transition-colors"
            >
              <Share2 size={13} /> <span className="hidden sm:inline">Share</span>
            </button>
            <button onClick={onClose} className="hover:bg-blue-600 p-1.5 rounded transition-colors"><X size={16} /></button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-6 overflow-y-auto bg-[#F8FAFC]">
          <div className="flex gap-4 sm:gap-6 flex-col md:flex-row">
            
            {/* Left Column - Details */}
            <div className="flex-1 space-y-4 sm:space-y-6">
              <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-[#1E293B] px-3 sm:px-4 py-2 flex items-center gap-2 text-white">
                  <FileText size={15} />
                  <h3 className="font-bold text-[13px] sm:text-[14px]">INVOICE DETAILS</h3>
                </div>
                <div className="p-3 sm:p-5 flex flex-col sm:flex-row justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold text-black uppercase tracking-wide mb-1">Bill To</p>
                    <p className="font-bold text-[14px] sm:text-[15px] text-black">{sale.customer?.name || 'Counter Sale'}</p>
                    <p className="text-[12px] sm:text-[13px] text-black font-bold mt-1">{sale.customer?.phone || 'No phone number'}</p>
                    {sale.customer?.address && <p className="text-[12px] sm:text-[13px] text-black font-bold mt-1">{sale.customer.address}</p>}
                  </div>
                  <div className="sm:text-right">
                    <p className="text-[11px] font-bold text-black uppercase tracking-wide mb-1">Payment Details</p>
                    <p className={`font-bold text-[13px] sm:text-[14px] inline-block px-2 py-0.5 rounded ${sale.paymentMode?.name === 'Credit' ? 'bg-rose-100 text-rose-600' : 'bg-[#D1FAE5] text-[#10B981]'}`}>{sale.paymentMode?.name || 'CASH'}</p>
                    <p className="text-[12px] sm:text-[13px] text-black font-bold mt-1">Status: {sale.paymentMode?.name === 'Credit' ? 'Credit' : 'Paid'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-[#F8FAFC] px-3 sm:px-4 py-2 border-b border-gray-200">
                  <h3 className="font-bold text-[13px] sm:text-[14px] text-black">ITEMIZED BILLING</h3>
                </div>
                <div className="overflow-x-auto p-2 sm:p-4">
                  <table className="w-full text-left text-[12px] sm:text-[13px] whitespace-nowrap">
                    <thead>
                      <tr className="border-b-2 border-gray-200 text-black font-bold">
                        <th className="py-2 px-2 font-bold">Code</th>
                        <th className="py-2 px-2 font-bold">Product</th>
                        <th className="py-2 px-2 font-bold text-center">Birds</th>
                        <th className="py-2 px-2 font-bold text-right">Qty</th>
                        <th className="py-2 px-2 font-bold text-center">Unit</th>
                        <th className="py-2 px-2 font-bold text-right">Rate</th>
                        <th className="py-2 px-2 font-bold text-right">Disc</th>
                        <th className="py-2 px-2 font-bold text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items?.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <td className="py-2 px-2 font-bold text-black">{item.product?.code || '-'}</td>
                          <td className="py-2 px-2 font-bold text-black">{item.product?.name}</td>
                          <td className="py-2 px-2 text-center text-black font-bold">{item.noOfBirds === 0 ? '0' : (item.noOfBirds || '0')}</td>
                          <td className="py-2 px-2 text-right">{Number(Number(item.quantity).toFixed(4))}</td>
                          <td className="py-2 px-2 text-center text-black font-bold">{item.product?.unit?.name || 'Nos'}</td>
                          <td className="py-2 px-2 text-right font-bold">{formatCurrency(item.rate)}</td>
                          <td className="py-2 px-2 text-right text-red-500">{item.discount > 0 ? formatCurrency(item.discount) : '-'}</td>
                          <td className="py-2 px-2 text-right font-bold text-black">{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column - Summary */}
            <div className="w-full md:w-[280px] shrink-0">
              <div className="bg-white rounded shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-[#F8FAFC] px-3 sm:px-4 py-2 border-b border-gray-200">
                  <h3 className="font-bold text-[13px] sm:text-[14px] text-black">SUMMARY</h3>
                </div>
                <div className="p-3 sm:p-4 space-y-3 text-[13px] sm:text-[14px]">
                  <div className="flex justify-between items-center text-black font-bold">
                    <span>Subtotal</span>
                    <span className="font-bold">{formatCurrency(sale.subtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-red-500 border-b border-gray-100 pb-3">
                    <span>Discount</span>
                    <span className="font-bold">- {formatCurrency(sale.discount)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-[15px] sm:text-[16px] font-black text-black">GRAND TOTAL</span>
                    <span className="text-[18px] sm:text-[20px] font-black text-[#2563EB]">{formatCurrency(sale.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-100 border-t border-gray-200 px-3 sm:px-5 py-2 sm:py-3 flex justify-end rounded-b-md">
        <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white px-4 sm:px-5 py-2 rounded text-[12px] sm:text-[13px] font-bold transition-colors shadow-sm">
          Close Window
        </button>
      </div>
    </div>

      <InvoicePrintModal 
        isOpen={isPrintModalOpen} 
        onClose={() => { setIsPrintModalOpen(false); setAutoShare(false); }} 
        sale={sale}
        autoShare={autoShare}
      />
    </div>
  );
}
