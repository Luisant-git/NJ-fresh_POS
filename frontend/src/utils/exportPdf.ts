import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type PdfColumn = { header: string; dataKey: string };

export const exportTableToPdf = (
  columns: PdfColumn[],
  rows: Record<string, any>[],
  filename: string,
  title?: string,
  shopName?: string,
  totalCount?: number | string,
  options?: { footerBold?: boolean }
) => {
  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    let currentY = 14;

    // Shop Name
    if (shopName) {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(shopName, 14, currentY);
      currentY += 8;
    }

    // Title
    if (title) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 14, currentY);
      currentY += 8;
    }

    // Generated Date (Right Aligned)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 287, currentY, { align: 'right' });
    doc.setTextColor(0);

    // Total Count (Left Aligned on same row)
    if (totalCount !== undefined) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total Count: ${totalCount}`, 14, currentY);
    }
    
    currentY += 8;

    const bodyRows = rows.slice(0, -1);
    const footRows = rows.length > 0 ? [rows[rows.length - 1]] : [];

    autoTable(doc, {
      columns,
      body: bodyRows,
      foot: footRows,
      showFoot: 'lastPage',
      startY: currentY,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didParseCell: (data: any) => {
        const raw = data.row?.raw || {};
        if (raw.isSubtotal) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = [0, 0, 0];
          data.cell.styles.fillColor = [241, 245, 249];
        }
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: 0,
        fontStyle: options?.footerBold === false ? 'normal' : 'bold',
        fontSize: 9,
      },
      margin: { top: 10, left: 10, right: 10 },
    });

    doc.save(`${filename}.pdf`);
  } catch (e: any) {
    alert('Export PDF Error: ' + (e?.message || JSON.stringify(e)));
    console.error(e);
  }
};
