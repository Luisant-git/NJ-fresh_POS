import { getMalaysiaDateStr, formatMalaysiaDate } from '../../utils/date';
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { CornerDownLeft, Calendar, Package, Download, Printer } from 'lucide-react';
import { exportToExcel } from '../../utils/exportExcel';
import { exportTableToPdf, type PdfColumn } from '../../utils/exportPdf';
import api from '../../services/api';
import ReportTabs from '../../components/ReportTabs';
import { useSettings } from '../../contexts/SettingsContext';
import SearchableSelect from '../../components/SearchableSelect';
import { useNavigate } from 'react-router-dom';

const formatQtyValue = (value: number | string) => {
  const numericValue = Number(value || 0);
  return Number(numericValue.toFixed(2)).toString();
};

const ProductWiseSalesReport = () => {
  const { formatCurrency, settings } = useSettings();
  const navigate = useNavigate();
  
  // Default to today
  const today = getMalaysiaDateStr();
  const [filterFromDate, setFilterFromDate] = useState(today);
  const [filterToDate, setFilterToDate] = useState(today);
  const [productId, setProductId] = useState<number | string>('');

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data
  });

  const { data: reportData = [], isLoading } = useQuery({
    queryKey: ['product-wise-sales', filterFromDate, filterToDate, productId],
    queryFn: async () => {
      const { data } = await api.get('/reports/product-wise-sales', {
        params: {
          fromDate: filterFromDate,
          toDate: filterToDate,
          productId: productId || undefined
        }
      });
      return data;
    },
  });

  const handleExportExcel = () => {
    const exportData: any[] = [];
    reportData.forEach((group: any) => {
      group.items.forEach((item: any) => {
        exportData.push({
          'Product Name': group.productName,
          'Invoice No': item.invoiceNo,
          'Date': formatMalaysiaDate(item.date),
          'Qty': formatQtyValue(item.qty),
          'Sales Value': item.value
        });
      });
      exportData.push({
        'Product Name': `SUBTOTAL: ${group.productName}`,
        'Invoice No': '',
        'Date': '',
        'Qty': formatQtyValue(group.totalQty),
        'Sales Value': group.totalValue
      });
    });

    exportToExcel(exportData, `Product_Wise_Sales_${filterFromDate}_to_${filterToDate}`, {
      title: 'Product Wise Sales Report',
      shopName: settings?.shopName,
      totalCount: exportData.length
    });
  };

  const handleExportPdf = () => {
    const cols: PdfColumn[] = [
      { header: 'Product Name', dataKey: 'productName' },
      { header: 'Invoice No', dataKey: 'invoiceNo' },
      { header: 'Date', dataKey: 'date' },
      { header: 'Qty', dataKey: 'qty' },
      { header: 'Sales Value', dataKey: 'value' }
    ];

    const pdfData: any[] = [];
    reportData.forEach((group: any) => {
      group.items.forEach((item: any) => {
        pdfData.push({
          productName: group.productName,
          invoiceNo: item.invoiceNo,
          date: formatMalaysiaDate(item.date),
          qty: formatQtyValue(item.qty),
          value: formatCurrency(item.value)
        });
      });
      pdfData.push({
        isSubtotal: true,
        productName: `SUBTOTAL: ${group.productName}`,
        invoiceNo: '',
        date: '',
        qty: formatQtyValue(group.totalQty),
        value: formatCurrency(group.totalValue)
      });
    });

    exportTableToPdf(cols, pdfData, `Product_Wise_Sales_${filterFromDate}_to_${filterToDate}`, 'Product Wise Sales Report', settings?.shopName, pdfData.length, { footerBold: true });
  };

  return (
    <div className="absolute inset-0 bg-[#F7F7F7] flex flex-col font-sans overflow-y-auto lg:overflow-hidden z-10 p-2 sm:p-4">
      <ReportTabs />

      <div className="flex flex-col flex-1 overflow-hidden mt-4">
        <div className="bg-white border border-[#E6E9ED] shadow-sm rounded-sm flex flex-col flex-1 overflow-hidden">
          {/* Header */}
          <div className="bg-[#F8F9FA] border-b border-[#E6E9ED] px-4 py-3">
            <div className="flex items-start md:items-center justify-between gap-2 text-[#2563EB]">
              <div className="flex items-center gap-2">
                <CornerDownLeft size={18} className="shrink-0" />
                <h2 className="font-bold text-[13px] md:text-[14px] uppercase tracking-wide">Product Wise Sales Report</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={handleExportExcel}
                  disabled={reportData.length === 0}
                  className="bg-[#10B981] hover:bg-[#059669] text-white px-3 py-1.5 rounded flex items-center gap-1.5 text-[12px] font-bold transition-colors disabled:opacity-50"
                >
                  <Download size={14} /> <span className="hidden md:inline">Export Excel</span>
                </button>
                <button 
                  onClick={handleExportPdf}
                  disabled={reportData.length === 0}
                  className="bg-[#EF4444] hover:bg-[#DC2626] text-white px-3 py-1.5 rounded flex items-center gap-1.5 text-[12px] font-bold transition-colors disabled:opacity-50"
                >
                  <Printer size={14} /> <span className="hidden md:inline">Print PDF</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border-b border-[#E2E8F0] shadow-sm mb-2 p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
              <div>
                <label className="flex items-center gap-1 text-[12px] text-black font-bold mb-1"><Calendar size={12} /> From Date</label>
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded outline-none text-[13px] text-black font-bold focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[12px] text-black font-bold mb-1"><Calendar size={12} /> To Date</label>
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-[#CBD5E1] rounded outline-none text-[13px] text-black font-bold focus:border-[#3B82F6]"
                />
              </div>
              <div className="col-span-2 md:col-span-2">
                <label className="flex items-center gap-1 text-[12px] text-black font-bold mb-1"><Package size={12} /> Product Name</label>
                <SearchableSelect
                  options={[{ value: '', label: 'All Products' }, ...products.map((p: any) => ({ value: p.id, label: `${p.code} - ${p.name}` }))]}
                  value={productId}
                  onChange={(val) => setProductId(val)}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-white">
            {isLoading ? (
              <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-[#3B82F6]" />
                <span className="font-bold">Loading report data...</span>
              </div>
            ) : (
              <table className="w-full text-left text-[12px] whitespace-nowrap border-collapse">
                <thead className="bg-[#1E293B] text-white">
                  <tr>
                    <th className="px-4 py-2 font-bold uppercase tracking-wider sticky top-0 z-10 bg-[#1E293B] text-[11px] whitespace-nowrap border-b border-[#334155] border-r w-1/3">DOC # / PRODUCT</th>
                    <th className="px-4 py-2 font-bold uppercase tracking-wider sticky top-0 z-10 bg-[#1E293B] text-[11px] whitespace-nowrap border-b border-[#334155] border-r text-right w-1/3">SALES QTY</th>
                    <th className="px-4 py-2 font-bold uppercase tracking-wider sticky top-0 z-10 bg-[#1E293B] text-[11px] whitespace-nowrap border-b border-[#334155] text-right w-1/3">SALES VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-black font-bold border-b border-[#E2E8F0]">
                        No sales found for the selected dates and product.
                      </td>
                    </tr>
                  ) : (
                    reportData.map((group: any, idx: number) => (
                      <React.Fragment key={idx}>
                        {/* Group Header */}
                        <tr className="bg-[#F1F5F9] border-y border-[#CBD5E1]">
                          <td colSpan={3} className="px-4 py-2 font-bold text-black uppercase tracking-wider text-[11px]">
                            {group.productName}
                          </td>
                        </tr>
                        
                        {/* Group Items */}
                        {group.items.map((item: any, i: number) => (
                          <tr 
                            key={i} 
                            className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] cursor-pointer"
                            onClick={() => {
                              if (item.invoiceNo && item.invoiceNo !== '-') {
                                navigate(`/reports/sales?invoiceNo=${item.invoiceNo}`);
                              }
                            }}
                          >
                            <td className="px-4 py-1.5 border-r border-[#E2E8F0] text-[#2563EB] font-bold pl-8 hover:underline">
                              {item.invoiceNo} <span className="text-gray-500 font-bold text-[11px] ml-2">({formatMalaysiaDate(item.date)})</span>
                            </td>
                            <td className="px-4 py-1.5 border-r border-[#E2E8F0] text-right text-black font-bold">
                              {formatQtyValue(item.qty)}
                            </td>
                            <td className="px-4 py-1.5 text-right font-bold text-[#059669]">
                              {formatCurrency(item.value)}
                            </td>
                          </tr>
                        ))}

                        {/* Group Footer / Subtotal */}
                        <tr className="bg-[#F8FAFC] border-b-2 border-[#CBD5E1]">
                          <td className="px-4 py-2 border-r border-[#E2E8F0] font-bold text-black text-right uppercase text-[11px]">
                            Subtotal
                          </td>
                          <td className="px-4 py-2 border-r border-[#E2E8F0] font-bold text-[#2563EB] text-right">
                            {formatQtyValue(group.totalQty)}
                          </td>
                          <td className="px-4 py-2 font-bold text-[#2563EB] text-right">
                            {formatCurrency(group.totalValue)}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProductWiseSalesReport;
