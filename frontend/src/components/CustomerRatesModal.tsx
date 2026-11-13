import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Save, Search, DollarSign, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useSettings } from '../contexts/SettingsContext';

interface Props {
  customer: any;
  onClose: () => void;
}

export default function CustomerRatesModal({ customer, onClose }: Props) {
  const { formatCurrency } = useSettings();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [rates, setRates] = useState<Record<number, number | string>>({});

  // Fetch all products
  const { data: products = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data,
  });

  // Fetch existing customer fixed rates
  const { data: existingRates = [], isLoading: isLoadingRates } = useQuery({
    queryKey: ['customer-rates', customer.id],
    queryFn: async () => (await api.get(`/customers/${customer.id}/rates`)).data,
    enabled: !!customer?.id,
  });

  useEffect(() => {
    if (existingRates && existingRates.length > 0) {
      const initialMap: Record<number, number | string> = {};
      existingRates.forEach((item: any) => {
        initialMap[item.productId] = Number(item.rate);
      });
      setRates(initialMap);
    }
  }, [existingRates]);

  const saveMutation = useMutation({
    mutationFn: async (payload: any[]) => {
      const res = await api.post(`/customers/${customer.id}/rates`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success(`Fixed rates updated for ${customer.name}`);
      queryClient.invalidateQueries({ queryKey: ['customer-rates', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customerRates', customer.id] });
      onClose();
    },
    onError: (err: any) => {
      console.error(err);
      toast.error('Failed to save fixed product rates.');
    }
  });

  const handleRateChange = (productId: number, val: string) => {
    setRates(prev => ({
      ...prev,
      [productId]: val,
    }));
  };

  const handleSave = () => {
    const payload = Object.entries(rates)
      .map(([prodIdStr, rateVal]) => {
        const r = Number(rateVal);
        return {
          productId: Number(prodIdStr),
          rate: isNaN(r) ? 0 : r,
        };
      })
      .filter(item => item.rate > 0);

    saveMutation.mutate(payload);
  };

  const filteredProducts = products.filter((p: any) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white w-full max-w-4xl rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="bg-[#1E3A8A] text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-emerald-400" />
            <h2 className="font-bold text-[15px]">FIX PRODUCT SELLING RATES - {customer.name}</h2>
          </div>
          <button onClick={onClose} className="hover:bg-blue-800 p-1.5 rounded transition-colors text-white">
            <X size={18} />
          </button>
        </div>

        {/* Subheader & Search */}
        <div className="p-3 bg-[#F8FAFC] border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3 shrink-0">
          <div className="text-[12px] text-black font-bold">
            Set custom fixed selling rates for specific products for customer <span className="font-bold text-blue-900">{customer.name}</span>.
          </div>
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search size={14} className="text-black font-bold" />
            </div>
            <input
              type="text"
              placeholder="Search product code/name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded text-[12px] outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Product Rate Table */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {(isLoadingProducts || isLoadingRates) ? (
            <div className="text-center py-8 font-bold text-black font-bold">Loading products & rates...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 font-bold text-black font-bold">No products found matching your search.</div>
          ) : (
            <table className="w-full text-left text-[13px] border border-gray-200 rounded whitespace-nowrap">
              <thead className="bg-[#0F172A] text-white">
                <tr>
                  <th className="px-3 py-2 border-r border-[#334155] w-12 text-center">#</th>
                  <th className="px-3 py-2 border-r border-[#334155] w-28">Code</th>
                  <th className="px-3 py-2 border-r border-[#334155]">Product Name</th>
                  <th className="px-3 py-2 border-r border-[#334155] text-right w-32">Purchase Rate</th>
                  <th className="px-3 py-2 border-r border-[#334155] text-right w-32">Standard Rate</th>
                  <th className="px-3 py-2 text-center w-40">Fixed Rate for Customer</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p: any, i: number) => {
                  const currentRateVal = rates[p.id] !== undefined ? rates[p.id] : '';
                  const isBelowCost = Number(currentRateVal) > 0 && Number(currentRateVal) <= Number(p.purchaseRate);
                  return (
                    <tr key={p.id} className={`border-b border-gray-200 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50`}>
                      <td className="px-3 py-2 text-center font-bold text-black font-bold">{i + 1}</td>
                      <td className="px-3 py-2 font-bold text-black font-bold">{p.code}</td>
                      <td className="px-3 py-2 font-bold text-black font-bold flex items-center gap-1.5">
                        <Package size={14} className="text-blue-500 shrink-0" />
                        {p.name}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-gray-600">
                        {formatCurrency(p.purchaseRate || 0)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-black font-bold">
                        {formatCurrency(p.sellingRate || 0)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0.00"
                            value={currentRateVal}
                            onChange={(e) => handleRateChange(p.id, e.target.value)}
                            className={`w-28 px-2 py-1 border rounded text-right font-bold outline-none transition-colors ${
                              isBelowCost
                                ? 'border-red-400 bg-red-50 text-red-700 focus:border-red-500'
                                : 'border-gray-300 text-blue-700 focus:border-blue-500 focus:bg-blue-50'
                            }`}
                            title={
                              isBelowCost
                                ? `Warning: Rate is lower than or equal to purchase rate (${formatCurrency(p.purchaseRate || 0)})`
                                : ''
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-gray-100 border-t border-gray-200 p-3 flex justify-between items-center shrink-0">
          <button
            type="button"
            onClick={() => setRates({})}
            className="text-black font-bold hover:text-black hover:font-bold text-[12px] font-bold"
          >
            Clear All Custom Rates
          </button>
          
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-1.5 rounded text-[13px] font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-[#059669] hover:bg-[#047857] text-white px-5 py-1.5 rounded text-[13px] font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save size={14} /> {saveMutation.isPending ? 'Saving...' : 'Save Customer Rates'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
