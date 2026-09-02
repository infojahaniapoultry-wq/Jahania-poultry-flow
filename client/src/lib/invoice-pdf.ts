import { drawVoiceplsPdfFooter } from './branding';

export type InvoicePdfData = {
  invoiceNo: string;
  date: string;
  customer?: {
    shopName?: string;
    contact?: string | null;
    address?: string | null;
  } | null;
  driver?: { name?: string | null } | null;
  totalAmount: string | number;
  totalBalance: string | number;
  previousBalance: string | number;
  settledAmount?: string | number;
  paymentMode?: string | null;
  paymentStatus?: string | null;
  paymentReference?: string | null;
  paymentProvider?: string | null;
  notes?: string | null;
  items?: Array<{
    netWeight?: string | number;
    ratePerKg?: string | number;
    amount?: string | number;
  }>;
};

const currency = (value: unknown) =>
  `Rs. ${Number(value ?? 0).toLocaleString('en-PK')}`;

export async function exportInvoicePdf(invoice: InvoicePdfData) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const generatedAt = new Date().toLocaleString('en-PK');
  const invoiceDate = new Date(invoice.date).toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 38, pageWidth, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('POULTRYFLOW', margin, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('JAHANIA POULTRY MANAGEMENT SERVICE', margin, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SALES INVOICE', margin, 30);
  doc.setFontSize(9);
  doc.text(invoice.invoiceNo, pageWidth - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(invoiceDate, pageWidth - margin, 21, { align: 'right' });
  doc.text(`Generated ${generatedAt}`, pageWidth - margin, 27, { align: 'right' });

  let y = 52;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 34, 3, 3, 'FD');
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('BILL TO', margin + 5, y + 8);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(12);
  doc.text(invoice.customer?.shopName || 'Customer', margin + 5, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(invoice.customer?.contact || '-', margin + 5, y + 23);
  doc.text(invoice.customer?.address || '-', margin + 5, y + 29);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7);
  doc.text('PAYMENT', pageWidth - margin - 58, y + 8);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.text(invoice.paymentMode || 'CASH', pageWidth - margin - 58, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(invoice.paymentStatus || '-', pageWidth - margin - 58, y + 23);
  doc.text(invoice.paymentReference || invoice.paymentProvider || '-', pageWidth - margin - 58, y + 29);

  y += 46;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 9, 'FD');
  const columns = [
    { label: '#', width: 12 },
    { label: 'WEIGHT (KG)', width: 42 },
    { label: 'RATE / KG', width: 42 },
    { label: 'AMOUNT', width: contentWidth - 96 },
  ];
  let x = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  columns.forEach((column) => {
    doc.text(column.label, x + 3, y + 6);
    x += column.width;
  });
  y += 9;

  (invoice.items || []).forEach((item, index) => {
    if (y > pageHeight - 54) {
      doc.addPage();
      y = margin;
    }
    doc.setFillColor(index % 2 === 0 ? 255 : 248, index % 2 === 0 ? 255 : 250, index % 2 === 0 ? 255 : 252);
    doc.rect(margin, y, contentWidth, 9, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 9, margin + contentWidth, y + 9);
    x = margin;
    doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(String(index + 1), x + 3, y + 6);
    x += columns[0].width;
    doc.text(Number(item.netWeight ?? 0).toFixed(2), x + 3, y + 6);
    x += columns[1].width;
    doc.text(currency(item.ratePerKg), x + 3, y + 6);
    x += columns[2].width;
    doc.text(currency(item.amount), x + columns[3].width - 3, y + 6, { align: 'right' });
    y += 9;
  });

  const summaryHeight = 42;
  const footerTop = pageHeight - 36;
  if (y + 12 + summaryHeight > footerTop) {
    doc.addPage();
    y = margin;
  } else {
    y += 12;
  }
  const summaryX = pageWidth - margin - 78;
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(summaryX, y, 78, 42, 3, 3, 'S');
  const summary = [
    ['Previous balance', currency(invoice.previousBalance)],
    ['Invoice amount', currency(invoice.totalAmount)],
    ['Paid / settled', currency(invoice.settledAmount)],
    ['Outstanding', currency(Number(invoice.totalBalance) - Number(invoice.settledAmount ?? 0))],
  ];
  summary.forEach(([label, value], index) => {
    const rowY = y + 8 + index * 8;
    doc.setFont('helvetica', index === 3 ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(index === 3 ? 15 : 100, index === 3 ? 23 : 116, index === 3 ? 42 : 139);
    doc.text(label, summaryX + 4, rowY);
    doc.text(value, summaryX + 74, rowY, { align: 'right' });
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('DRIVER', margin, y + 8);
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.driver?.name || 'Not recorded', margin, y + 16);
  if (invoice.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(`Notes: ${invoice.notes}`, 92), margin, y + 25);
  }

  const drawFooter = () => {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('System generated invoice — Jahania Poultry Service', margin, pageHeight - 29);
    doc.text('AUTHORIZED SIGNATURE', pageWidth - margin, pageHeight - 29, { align: 'right' });
    drawVoiceplsPdfFooter(doc, pageWidth, pageHeight);
  };

  for (let page = 1; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    drawFooter();
  }

  doc.save(`${invoice.invoiceNo.toLowerCase()}.pdf`);
}
