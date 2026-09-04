import { drawVoiceplsPdfFooter } from './branding';

export type PurchasePdfData = {
  purchaseNo: string;
  date: string;
  vendor?: { name?: string; contact?: string | null; address?: string | null } | null;
  weightKg: string | number;
  ratePerKg: string | number;
  purchaseAmount: string | number;
  settledAmount?: string | number;
  paymentMode?: string | null;
  paymentStatus?: string | null;
  paymentReference?: string | null;
  paymentProvider?: string | null;
  notes?: string | null;
};

const currency = (value: unknown) => `Rs. ${Number(value ?? 0).toLocaleString('en-PK')}`;

export async function exportPurchasePdf(purchase: PurchasePdfData) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const total = Number(purchase.purchaseAmount ?? 0);
  const settled = Number(purchase.settledAmount ?? 0);
  const lines = [
    ['Vendor', purchase.vendor?.name ?? 'Vendor'],
    ['Date', new Date(purchase.date).toLocaleDateString('en-PK')],
    ['Weight', `${Number(purchase.weightKg ?? 0).toLocaleString('en-PK')} kg`],
    ['Rate', currency(purchase.ratePerKg)],
    ['Payment mode', purchase.paymentMode ?? '-'],
    ['Status', purchase.paymentStatus ?? '-'],
    ['Total', currency(total)],
    ['Paid', currency(settled)],
    ['Balance', currency(total - settled)],
  ];

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PURCHASE RECEIPT', margin, 17);
  doc.setFontSize(9);
  doc.text(purchase.purchaseNo, margin, 25);
  doc.setTextColor(15, 23, 42);

  let y = 50;
  lines.forEach(([label, value], index) => {
    doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 250 : 255, index % 2 === 0 ? 252 : 255);
    doc.rect(margin, y - 6, pageWidth - margin * 2, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, margin + 4, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), pageWidth - margin - 4, y, { align: 'right' });
    y += 10;
  });

  if (purchase.paymentReference || purchase.paymentProvider || purchase.notes) {
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Additional details', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    y += 7;
    const details = [purchase.paymentReference || purchase.paymentProvider, purchase.notes].filter(Boolean).join(' · ');
    doc.text(doc.splitTextToSize(details, pageWidth - margin * 2), margin, y);
  }

  drawVoiceplsPdfFooter(doc, pageWidth, pageHeight);
  doc.save(`${purchase.purchaseNo.toLowerCase()}-receipt.pdf`);
}
