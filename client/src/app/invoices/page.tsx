'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import SalesInvoiceModal from '@/components/SalesInvoiceModal';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { Download, Eye, RefreshCw, Truck } from 'lucide-react';
import Link from 'next/link';
import DatePicker from '@/components/DatePicker';
import { BUSINESS_DATA_UPDATED_EVENT } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { drawVoiceplsPdfFooter } from '@/lib/branding';

interface Customer {
  id: number;
  shopName: string;
  currentBalance: string;
  contact?: string;
  isActive?: boolean;
}

interface Driver {
  id: number;
  name: string;
  defaultCharge?: string;
}

interface Invoice {
  id: number;
  invoiceNo: string;
  date: string;
  createdAt?: string;
  customer: Customer;
  driver?: Driver;
  totalAmount: string;
  totalBalance: string;
  previousBalance: string;
  settledAmount?: string | number;
  paymentMode?: string;
  paymentStatus?: string;
  paymentReference?: string | null;
  paymentProvider?: string | null;
  chequeLog?: {
    chequeNo?: string;
    bankName?: string;
    chequeDate?: string;
    status?: string;
  } | null;
  onlinePaymentLog?: {
    provider?: string;
    referenceNo?: string;
    status?: string;
  } | null;
}

interface PurchaseRecord {
  id: number;
  purchaseNo: string;
  date: string;
  createdAt?: string;
  vendor: {
    id: number;
    name: string;
  };
  driver?: Driver;
  weightKg: string;
  ratePerKg: string;
  purchaseAmount: string;
  settledAmount?: string | number;
  paymentMode: string;
  paymentStatus: string;
  paymentReference?: string | null;
  paymentProvider?: string | null;
  chequeLog?: {
    chequeNo?: string;
    bankName?: string;
    chequeDate?: string;
    status?: string;
  } | null;
  onlinePaymentLog?: {
    provider?: string;
    referenceNo?: string;
    status?: string;
  } | null;
}

type RegisterKind = 'SELLING' | 'PURCHASE';

type RegisterRow = {
  id: number;
  kind: RegisterKind;
  documentNo: string;
  date: string;
  createdAt: string;
  partyName: string;
  driverName?: string | null;
  totalAmount: string | number;
  totalBalance: string | number;
  settledAmount?: string | number;
  remainingBalance?: string | number;
  paymentMode?: string;
  paymentStatus?: string;
  paymentReference?: string | null;
  paymentProvider?: string | null;
  invoiceId?: number;
  purchaseId?: number;
};

const getPKTDate = () => {
  // Use Intl.DateTimeFormat for reliable cross-browser PKT date extraction
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');

function getPaymentStatusMeta(status?: string, mode?: string, settledAmount?: string | number, totalAmount?: string | number) {
  const value = (status ?? '').toUpperCase();
  const paymentMode = (mode ?? '').toUpperCase();
  const settled = Number(settledAmount ?? 0);
  const total = Number(totalAmount ?? 0);
  
  if (settled > 0 && total > 0 && settled < total) return { label: 'Partial', color: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-500' };
  if (settled > total) return { label: 'Overpaid', color: 'bg-blue-50 text-blue-700 border-blue-100', dot: 'bg-blue-500' };
  if (value === 'OUTSTANDING' && paymentMode === 'ONLINE') return { label: 'Credit (Reopened)', color: 'bg-amber-50 text-amber-700 border-amber-100', dot: 'bg-amber-500' };
  if (value === 'COMPLETED') return { label: 'Completed', color: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' };
  if (value === 'OUTSTANDING') return { label: 'Outstanding', color: 'bg-red-50 text-red-700 border-red-100', dot: 'bg-red-500' };
  if (value === 'BOUNCED') return { label: 'Bounced', color: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-600' };
  if (value === 'PENDING') return { label: 'Pending', color: 'bg-slate-50 text-slate-600 border-slate-100', dot: 'bg-slate-400' };
  return { label: status ?? '-', color: 'bg-slate-50 text-slate-600 border-slate-100', dot: 'bg-slate-400' };
}

export default function InvoicesPage() {
  const today = getPKTDate();
  const hasAutoOpenedRef = useRef(false);
  const [entries, setEntries] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [filterDate, setFilterDate] = useState(today);
  const cacheKey = `invoices-page:${filterDate}`;

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<{
        entries: RegisterRow[];
      }>(cacheKey);
      if (cached) {
        setEntries(cached.entries);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const [ir, pr] = await Promise.all([
        api.get(`/invoices?date=${filterDate}`),
        api.get(`/purchases?date=${filterDate}`),
      ]);
      const invoiceRows: RegisterRow[] = (ir.data ?? []).map((invoice: Invoice) => ({
        id: invoice.id,
        kind: 'SELLING',
        documentNo: invoice.invoiceNo,
        date: invoice.date,
        createdAt: invoice.createdAt ?? invoice.date,
        partyName: invoice.customer?.shopName ?? 'Customer',
        driverName: invoice.driver?.name ?? null,
        totalAmount: invoice.totalAmount,
        totalBalance: invoice.totalBalance,
        settledAmount: invoice.settledAmount,
        remainingBalance: Number(invoice.totalBalance ?? 0) - Number(invoice.settledAmount ?? 0),
        paymentMode: invoice.paymentMode,
        paymentStatus: invoice.paymentStatus,
        paymentReference: invoice.paymentReference,
        paymentProvider: invoice.paymentProvider,
        invoiceId: invoice.id,
      }));
      const purchaseRows: RegisterRow[] = (pr.data ?? []).map((purchase: PurchaseRecord) => ({
        id: purchase.id,
        kind: 'PURCHASE',
        documentNo: purchase.purchaseNo,
        date: purchase.date,
        createdAt: purchase.createdAt ?? purchase.date,
        partyName: purchase.vendor?.name ?? 'Vendor',
        driverName: purchase.driver?.name ?? null,
        totalAmount: purchase.purchaseAmount,
        totalBalance: purchase.purchaseAmount,
        settledAmount: purchase.settledAmount,
        remainingBalance: Number(purchase.purchaseAmount ?? 0) - Number(purchase.settledAmount ?? 0),
        paymentMode: purchase.paymentMode,
        paymentStatus: purchase.paymentStatus,
        paymentReference: purchase.paymentReference,
        paymentProvider: purchase.paymentProvider,
        purchaseId: purchase.id,
      }));
      const combined = [...invoiceRows, ...purchaseRows].sort((a, b) => {
        const byCreatedAt = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (byCreatedAt !== 0) return byCreatedAt;
        const byDate = new Date(b.date).getTime() - new Date(a.date).getTime();
        return byDate !== 0 ? byDate : b.id - a.id;
      });
      setEntries(combined);
      setCachedPageData(cacheKey, {
        entries: combined,
      });
    } catch {
      toast.error('Failed to load billing entries');
    } finally {
      setLoading(false);
    }
  }, [cacheKey, filterDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleBusinessUpdate = () => {
      void load(true);
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessUpdate);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessUpdate);
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1' && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      setOpen(true);
    }
  }, []);

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const generatedAt = new Date().toLocaleString('en-PK');
      const displayDate = new Date(`${filterDate}T00:00:00`).toLocaleDateString('en-PK', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      const drawCoverHeader = () => {
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 38, 'F');
        doc.setFillColor(16, 185, 129);
        doc.rect(0, 38, pageWidth, 3.5, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('POULTRYFLOW', margin, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text('JAHANIA POULTRY MANAGEMENT', margin, 17);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(generatedAt, pageWidth - margin, 12, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text('System generated billing register', pageWidth - margin, 17, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('INVOICES & PURCHASES', margin, 26);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`Selected date: ${displayDate}`, margin, 33);
        doc.setTextColor(15, 23, 42);
      };

      const drawMetricCards = (startY: number) => {
        const metrics = [
          { label: 'Total Records', value: String(entries.length), sub: 'Selected date', color: [59, 130, 246] },
          { label: 'Selling Invoices', value: String(entries.filter((entry) => entry.kind === 'SELLING').length), sub: 'Sales activity', color: [16, 185, 129] },
          { label: 'Purchase Entries', value: String(entries.filter((entry) => entry.kind === 'PURCHASE').length), sub: 'Supply activity', color: [245, 158, 11] },
          { label: 'Total Value', value: fmt(entries.reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)), sub: 'Selling + purchases', color: [139, 92, 246] },
        ];
        const gap = 6;
        const cardWidth = (pageWidth - margin * 2 - gap * 3) / 4;
        const cardHeight = 26;

        metrics.forEach((metric, index) => {
          const x = margin + index * (cardWidth + gap);
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(...metric.color as [number, number, number]);
          doc.roundedRect(x, startY, cardWidth, cardHeight, 3, 3, 'FD');
          doc.setTextColor(...metric.color as [number, number, number]);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.text(metric.label.toUpperCase(), x + 3, startY + 7);
          doc.setFontSize(metric.label === 'Total Value' ? 10 : 12);
          doc.setTextColor(15, 23, 42);
          doc.text(metric.value, x + 3, startY + 14);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(metric.sub.toUpperCase(), x + 3, startY + 20);
        });
        return startY + cardHeight;
      };

      const drawInfoPanel = (x: number, y: number, width: number, title: string, lines: Array<{ label: string; value: string }>, accent: [number, number, number]) => {
        const height = 34 + lines.length * 7;
        doc.setFillColor(249, 250, 251);
        doc.setDrawColor(...accent);
        doc.roundedRect(x, y, width, height, 4, 4, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...accent);
        doc.text(title.toUpperCase(), x + 4, y + 8);
        lines.forEach((line, index) => {
          const lineY = y + 15 + index * 7;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text(line.label, x + 4, lineY);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          doc.text(line.value, x + width - 4, lineY, { align: 'right' });
        });
      };

      const drawFooter = () => {
        const totalPages = doc.getNumberOfPages();
        for (let page = 1; page <= totalPages; page += 1) {
          doc.setPage(page);
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(71, 85, 105);
          doc.text(`SYSTEM GENERATED REPORT - ${generatedAt}`, margin, pageHeight - 29);
          doc.text(`PAGE ${String(page).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`, pageWidth / 2, pageHeight - 29, { align: 'center' });
          doc.text('AUTHORIZED SIGNATURE', pageWidth - margin, pageHeight - 29, { align: 'right' });
          drawVoiceplsPdfFooter(doc, pageWidth, pageHeight);
        }
      };

      drawCoverHeader();
      const cardsBottom = drawMetricCards(52);
      const panelWidth = (pageWidth - margin * 2 - 6) / 2;
      drawInfoPanel(margin, cardsBottom + 8, panelWidth, 'Register Summary', [
        { label: 'Reporting date', value: displayDate },
        { label: 'Records exported', value: String(entries.length) },
        { label: 'Export type', value: 'Selling + purchases' },
      ], [16, 185, 129]);
      drawInfoPanel(margin + panelWidth + 6, cardsBottom + 8, panelWidth, 'Value Summary', [
        { label: 'Selling total', value: fmt(entries.filter((entry) => entry.kind === 'SELLING').reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)) },
        { label: 'Purchase total', value: fmt(entries.filter((entry) => entry.kind === 'PURCHASE').reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)) },
        { label: 'Combined total', value: fmt(entries.reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)) },
      ], [59, 130, 246]);

      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Billing Register', margin, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Selling and purchase entries for ${displayDate}`, margin, 22);
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, 26, pageWidth - margin, 26);

      const columns = [
        { header: 'Type', width: 20 },
        { header: 'ID', width: 27 },
        { header: 'Date', width: 23 },
        { header: 'Client / Vendor', width: 45 },
        { header: 'Driver', width: 33 },
        { header: 'Total', width: 25, align: 'right' as const },
        { header: 'Paid', width: 25, align: 'right' as const },
        { header: 'Balance', width: 28, align: 'right' as const },
        { header: 'Status', width: 28 },
        { header: 'Mode', width: 19 },
      ];
      const usableWidth = pageWidth - margin * 2;
      const tableHeaderHeight = 8.5;
      const rowPadding = 2.5;
      let y = 34;
      let rowNumber = 0;

      const drawTableHeader = () => {
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.rect(margin, y, usableWidth, tableHeaderHeight, 'FD');
        let x = margin;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(51, 65, 85);
        columns.forEach((column) => {
          doc.text(column.header.toUpperCase(), column.align === 'right' ? x + column.width - rowPadding : x + rowPadding, y + 5.7, {
            align: column.align ?? 'left',
            maxWidth: column.width - rowPadding * 2,
          });
          x += column.width;
        });
        y += tableHeaderHeight;
      };

      drawTableHeader();
      entries.forEach((entry) => {
        const status = getPaymentStatusMeta(entry.paymentStatus, entry.paymentMode, entry.settledAmount, entry.kind === 'SELLING' ? entry.totalBalance : entry.totalAmount).label;
        const cells = [
          { text: entry.kind === 'SELLING' ? 'Selling' : 'Purchase', color: entry.kind === 'SELLING' ? '#b45309' : '#047857', bold: true },
          { text: entry.documentNo, bold: true },
          { text: new Date(entry.date).toLocaleDateString('en-PK') },
          { text: entry.partyName, bold: true },
          { text: entry.driverName || '-' },
          { text: fmt(entry.totalAmount), align: 'right' as const, bold: true },
          { text: fmt(entry.settledAmount ?? 0), align: 'right' as const },
          { text: fmt(entry.remainingBalance ?? 0), align: 'right' as const },
          { text: status },
          { text: entry.paymentMode || '-' },
        ];
        const wrapped = cells.map((cell, index) => doc.splitTextToSize(cell.text, columns[index].width - rowPadding * 2));
        const rowHeight = Math.max(8.5, ...wrapped.map((lines) => lines.length * 3.6 + 1.5));
        if (y + rowHeight > pageHeight - 24) {
          doc.addPage();
          y = margin + 6;
          drawTableHeader();
        }

        doc.setFillColor(rowNumber % 2 === 0 ? 255 : 248, rowNumber % 2 === 0 ? 255 : 250, rowNumber % 2 === 0 ? 255 : 252);
        doc.rect(margin, y, usableWidth, rowHeight, 'F');
        let x = margin;
        cells.forEach((cell, index) => {
          const column = columns[index];
          const cellLines = wrapped[index];
          const textX = cell.align === 'right' ? x + column.width - rowPadding : x + rowPadding;
          doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
          doc.setFontSize(7.4);
          if (cell.color) {
            const color = cell.color === '#b45309' ? [180, 83, 9] : [4, 120, 87];
            doc.setTextColor(...color as [number, number, number]);
          } else {
            doc.setTextColor(15, 23, 42);
          }
          doc.text(cellLines, textX, y + 4.2, { align: cell.align ?? 'left', baseline: 'top', maxWidth: column.width - rowPadding * 2 });
          x += column.width;
        });
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y + rowHeight, margin + usableWidth, y + rowHeight);
        y += rowHeight;
        rowNumber += 1;
      });

      if (entries.length === 0) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('No billing entries found for this date.', pageWidth / 2, 52, { align: 'center' });
      }

      drawFooter();
      doc.save(`invoices-purchases-report-${filterDate}.pdf`);
    } catch {
      toast.error('PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const columns = [
    {
      key: 'documentNo',
      label: 'ID',
      sortable: true,
      render: (r: RegisterRow) => (
        <span className={`font-black tracking-tight ${r.kind === 'SELLING' ? 'text-amber-600' : 'text-emerald-600'}`}>{r.documentNo}</span>
      ),
    },
    {
      key: 'kind',
      label: 'Type',
      sortable: true,
      render: (r: RegisterRow) => (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${
          r.kind === 'SELLING'
            ? 'bg-amber-50 text-amber-700 border-amber-100'
            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
        }`}>
          {r.kind === 'SELLING' ? 'Selling' : 'Purchase'}
        </span>
      ),
    },
    {
      key: 'date',
      label: 'Date',
      sortable: true,
      render: (r: RegisterRow) => (
        <span className="font-medium text-slate-600">
          {new Date(r.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
        </span>
      ),
    },
    {
      key: 'partyName',
      label: 'Client / Vendor',
      sortable: true,
      render: (r: RegisterRow) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 leading-tight">{r.partyName}</span>
          {r.kind === 'PURCHASE' && r.driverName && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium uppercase tracking-tighter">
              <Truck size={10} /> {r.driverName}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'totalAmount',
      label: 'Total',
      sortable: true,
      align: 'right' as const,
      render: (r: RegisterRow) => (
          <div className="flex flex-col items-end">
            <span className="font-black text-slate-900">{fmt(r.totalAmount)}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">
              Balance: {fmt(r.remainingBalance ?? 0)}
            </span>
          </div>
        ),
    },
    {
      key: 'paymentStatus',
      label: 'Status',
      sortable: true,
      render: (r: RegisterRow) => {
        const meta = getPaymentStatusMeta(
          r.paymentStatus,
          r.paymentMode,
          r.settledAmount,
          r.kind === 'SELLING' ? r.totalBalance : r.totalAmount,
        );
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${meta.color} border`}>
            <div className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'paymentMode',
      label: 'Mode',
      sortable: true,
      render: (r: RegisterRow) => (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-100">
          {r.paymentMode ?? '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      align: 'right' as const,
      render: (r: RegisterRow) => (
        <Link
          href={r.kind === 'SELLING' ? `/invoices/${r.invoiceId}` : `/purchases/${r.purchaseId}`}
          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
          title={r.kind === 'SELLING' ? 'View invoice' : 'View purchase'}
        >
          <Eye size={18} />
        </Link>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col gap-3 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Invoices & Purchases</h1>
          <p className="text-slate-500 font-medium tracking-tight">Monitor both selling invoices and purchase entries in one register.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-8 bg-white p-3 rounded-2xl shadow-sm border border-slate-200 w-full overflow-visible">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          <RefreshCw size={14} className="text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">View History</span>
        </div>
        <div className="relative z-20 flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-100 shrink-0">
          <DatePicker 
            value={filterDate} 
            onChange={(d) => setFilterDate(d)} 
            className="!py-1 !text-xs !bg-transparent !border-none !ring-0 font-bold !w-44"
          />
        </div>
        <button 
          onClick={() => load(true)}
          className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all shrink-0"
          title="Refresh entries"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={exportingPdf || loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          title="Export the selected date as PDF"
        >
          <Download size={15} />
          {exportingPdf ? 'Preparing...' : 'Export PDF'}
        </button>
      </div>

      <div className="animate-fade-in">
        <DataTable columns={columns} data={entries} loading={loading} emptyMessage="No billing entries found for this date." />
      </div>

      <SalesInvoiceModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => load(true)}
      />
    </AppLayout>
  );
}
