import { formatMalaysiaDate } from '../../utils/date';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../../services/api';
import { useSettings } from '../../contexts/SettingsContext';

interface Props {
  purchaseId: number;
  onClose: () => void;
}

export default function ViewPurchaseModal({ purchaseId, onClose }: Props) {
  const { formatCurrency } = useSettings();
  const { data: purchase, isLoading } = useQuery({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => (await api.get(`/purchases/${purchaseId}`)).data
  });

  if (isLoading) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-[60px] z-50 flex items-start justify-center bg-black/50 pt-10">
        <div className="bg-white p-6 rounded-md shadow-lg font-bold text-[#1E3A8A]">Loading invoice details...</div>
      </div>
    );
  }

  if (!purchase) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[60px] z-[9999] bg-black/60 flex items-start justify-center overflow-y-auto md:px-6 md:pb-6 md:pt-4">
      <div className="bg-white w-full max-w-4xl shadow-2xl flex flex-col md:rounded-md md:max-h-[calc(100vh-60px-1.5rem)] animate-sheet-down">

        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#3B82F6] text-white px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 shrink-0">
          <h2 className="font-bold text-[13px] sm:text-[15px] truncate">Purchase Invoice - {purchase.invoiceNo}</h2>
          <button onClick={onClose} className="hover:bg-blue-600 p-1 rounded transition-colors shrink-0"><X size={18} /></button>
        </div>

        <div className="p-3 sm:p-5 overflow-y-auto">

          {/* Supplier & Invoice Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div>
              <p className="text-[11px] text-black font-bold uppercase tracking-wider mb-1">Supplier Info</p>
              <p className="font-bold text-[#1E3A8A] text-[14px] sm:text-[15px] break-words">{purchase.supplier?.name}</p>
              {purchase.supplier?.phone && <p className="text-[12px] sm:text-[13px] text-black font-bold">{purchase.supplier.phone}</p>}
              {purchase.supplier?.email && <p className="text-[12px] sm:text-[13px] text-black font-bold break-all">{purchase.supplier.email}</p>}
              {purchase.supplier?.address && <p className="text-[12px] sm:text-[13px] text-black font-bold mt-1 whitespace-pre-wrap">{purchase.supplier.address}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-[11px] text-black font-bold uppercase tracking-wider mb-1">Invoice Info</p>
              <p className="font-bold text-[#333] text-[13px] sm:text-[14px]">Date: <span className="font-normal">{formatMalaysiaDate(purchase.date)}</span></p>
              {purchase.supplierInvoiceNo && (
                <p className="font-bold text-[#333] text-[13px] sm:text-[14px] mt-1">Supp. Inv. No: <span className="font-normal">{purchase.supplierInvoiceNo}</span></p>
              )}
              <p className="text-[11px] text-black font-bold uppercase tracking-wider mt-3 mb-1">Payment</p>
              <p className="font-bold text-[#10B981] text-[13px] sm:text-[14px] bg-[#D1FAE5] inline-block px-2 py-0.5 rounded">{purchase.paymentMode?.name}</p>
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto rounded border border-gray-200 mb-4 sm:mb-6">
            <table className="w-full text-left text-[12px] sm:text-[13px]">
              <thead className="bg-[#F3F4F6] text-black font-bold">
                <tr>
                  <th className="px-2 sm:px-3 py-2 border border-gray-300 w-10 text-center">#</th>
                  <th className="px-2 sm:px-3 py-2 border border-gray-300">Product</th>
                  <th className="px-2 sm:px-3 py-2 border border-gray-300 text-right whitespace-nowrap">Qty</th>
                  <th className="px-2 sm:px-3 py-2 border border-gray-300 text-center whitespace-nowrap">Unit</th>
                  <th className="px-2 sm:px-3 py-2 border border-gray-300 text-right whitespace-nowrap">Rate</th>
                  <th className="px-2 sm:px-3 py-2 border border-gray-300 text-right whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items?.map((item: any, i: number) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-center">{i + 1}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 font-bold text-black">
                      {item.product?.name}
                      <span className="block text-[11px] text-black font-normal">Code: {item.product?.code}</span>
                    </td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-right font-bold text-[#3B82F6] whitespace-nowrap">{Number(Number(item.quantity).toFixed(4))}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-center text-black font-bold whitespace-nowrap">{item.product?.unit?.shortCode || item.product?.unit?.name || '-'}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-right whitespace-nowrap">{formatCurrency(item.rate)}</td>
                    <td className="px-2 sm:px-3 py-2 border border-gray-300 text-right font-bold whitespace-nowrap">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 bg-[#F9FAFB] p-3 sm:p-4 rounded border border-gray-200">
              <div className="flex justify-between py-1 text-[12px] sm:text-[13px]">
                <span className="text-black font-bold">Subtotal</span>
                <span className="font-bold text-black">{formatCurrency(purchase.subtotal)}</span>
              </div>
              <div className="flex justify-between py-1 text-[12px] sm:text-[13px]">
                <span className="text-black font-bold">Discount</span>
                <span className="font-bold text-red-500">-{formatCurrency(purchase.discount)}</span>
              </div>
              <div className="flex justify-between py-3 mt-2 border-t border-gray-300 text-[15px] sm:text-[16px] font-bold">
                <span className="text-[#1E3A8A]">Grand Total</span>
                <span className="text-[#1E3A8A]">{formatCurrency(purchase.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 border-t border-gray-200 px-3 sm:px-5 py-2 sm:py-3 flex justify-end shrink-0">
          <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white px-4 sm:px-5 py-2 rounded text-[12px] sm:text-[13px] font-bold transition-colors">
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
}
