'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import SalesInvoiceModal from '@/components/SalesInvoiceModal';
import api from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import { Download, Eye, FileText, Pencil, RefreshCw, Trash2, Truck, Loader2 } from 'lucide-react';
import Link from 'next/link';
import DatePicker from '@/components/DatePicker';
import { BUSINESS_DATA_UPDATED_EVENT, notifyBusinessDataUpdated } from '@/lib/business-events';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';
import { drawVoiceplsPdfFooter } from '@/lib/branding';
import { exportInvoicePdf, type InvoicePdfData } from '@/lib/invoice-pdf';

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
  notes?: string | null;
}

type PurchaseEditForm = {
  id: number;
  documentNo: string;
  date: string;
  weightKg: string;
  ratePerKg: string;
  notes: string;
};

type RegisterKind = 'SELLING' | 'PURCHASE';
type RegisterView = 'ALL' | 'CUSTOMER' | 'VENDOR';

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
  const { user } = useAuth();
  const hasAutoOpenedRef = useRef(false);
  const [entries, setEntries] = useState<RegisterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<number | undefined>();
  const [editingPurchase, setEditingPurchase] = useState<PurchaseEditForm | null>(null);
  const [savingPurchaseEdit, setSavingPurchaseEdit] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [viewFilter, setViewFilter] = useState<RegisterView>('ALL');
  const cacheKey = `invoices-page:${filterDate || 'all-dates'}`;
  const visibleEntries = entries.filter((entry) => (
    viewFilter === 'ALL'
      || (viewFilter === 'CUSTOMER' && entry.kind === 'SELLING')
      || (viewFilter === 'VENDOR' && entry.kind === 'PURCHASE')
  ));
  const viewFilterLabel = viewFilter === 'CUSTOMER'
    ? 'Customer invoices'
    : viewFilter === 'VENDOR'
      ? 'Vendor invoices'
      : 'All invoices';

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
      const dateQuery = filterDate ? `?date=${encodeURIComponent(filterDate)}` : '';
      const [ir, pr] = await Promise.all([
        api.get(`/invoices${dateQuery}`),
        api.get(`/purchases${dateQuery}`),
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
        // Invoice payment status is based on this invoice's amount. totalBalance
        // also contains the customer's previous/opening balance and must not make
        // a fully paid invoice look partially paid.
        remainingBalance: Number(invoice.totalAmount ?? 0) - Number(invoice.settledAmount ?? 0),
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
      const displayDate = filterDate
        ? new Date(`${filterDate}T00:00:00`).toLocaleDateString('en-PK', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : 'All dates';

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
        doc.text(`Date filter: ${displayDate} | View: ${viewFilterLabel}`, margin, 33);
        doc.setTextColor(15, 23, 42);
      };

      const drawMetricCards = (startY: number) => {
        const metrics = [
          { label: 'Total Records', value: String(visibleEntries.length), sub: viewFilterLabel, color: [59, 130, 246] },
          { label: 'Selling Invoices', value: String(visibleEntries.filter((entry) => entry.kind === 'SELLING').length), sub: 'Sales activity', color: [16, 185, 129] },
          { label: 'Purchase Entries', value: String(visibleEntries.filter((entry) => entry.kind === 'PURCHASE').length), sub: 'Supply activity', color: [245, 158, 11] },
          { label: 'Total Value', value: fmt(visibleEntries.reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)), sub: viewFilterLabel, color: [139, 92, 246] },
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
        { label: 'Records exported', value: String(visibleEntries.length) },
        { label: 'Export view', value: viewFilterLabel },
      ], [16, 185, 129]);
      drawInfoPanel(margin + panelWidth + 6, cardsBottom + 8, panelWidth, 'Value Summary', [
        { label: 'Selling total', value: fmt(visibleEntries.filter((entry) => entry.kind === 'SELLING').reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)) },
        { label: 'Purchase total', value: fmt(visibleEntries.filter((entry) => entry.kind === 'PURCHASE').reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)) },
        { label: 'Combined total', value: fmt(visibleEntries.reduce((sum, entry) => sum + Number(entry.totalAmount ?? 0), 0)) },
      ], [59, 130, 246]);

      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Billing Register', margin, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`${viewFilterLabel} for ${displayDate}`, margin, 22);
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
      visibleEntries.forEach((entry) => {
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

      if (visibleEntries.length === 0) {
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('No billing entries found for this filter.', pageWidth / 2, 52, { align: 'center' });
      }

      drawFooter();
      const dateFilePart = filterDate || 'all-dates';
      const viewFilePart = viewFilter.toLowerCase();
      doc.save(`invoices-purchases-report-${viewFilePart}-${dateFilePart}.pdf`);
    } catch {
      toast.error('PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleInvoiceExport = async (entry: RegisterRow) => {
    if (entry.kind !== 'SELLING' || !entry.invoiceId) return;
    const key = `invoice-pdf-${entry.invoiceId}`;
    setActionKey(key);
    try {
      const response = await api.get<InvoicePdfData>(`/invoices/${entry.invoiceId}`);
      await exportInvoicePdf(response.data);
      toast.success(`${entry.documentNo} exported as PDF`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'PDF export failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleDeleteInvoice = async (entry: RegisterRow) => {
    if (entry.kind !== 'SELLING' || !entry.invoiceId || user?.role !== 'ADMIN') return;
    const confirmed = window.confirm(
      `Delete ${entry.documentNo}? This will void the invoice and reverse its stock, customer ledger, and payment entries.`,
    );
    if (!confirmed) return;

    setActionKey(`invoice-void-${entry.invoiceId}`);
    try {
      await api.patch(`/invoices/${entry.invoiceId}/void`, { reason: 'Deleted from invoice register' });
      toast.success(`${entry.documentNo} deleted`);
      notifyBusinessDataUpdated();
      await load(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Invoice could not be deleted');
    } finally {
      setActionKey(null);
    }
  };

  const handlePurchaseExport = async (entry: RegisterRow) => {
    if (entry.kind !== 'PURCHASE' || !entry.purchaseId) return;
    setActionKey(`purchase-pdf-${entry.purchaseId}`);
    try {
      const response = await api.get<PurchaseRecord>(`/purchases/${entry.purchaseId}`);
      const purchase = response.data;
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
        ['Rate', fmt(purchase.ratePerKg ?? 0)],
        ['Payment mode', purchase.paymentMode ?? '-'],
        ['Status', purchase.paymentStatus ?? '-'],
        ['Total', fmt(total)],
        ['Paid', fmt(settled)],
        ['Balance', fmt(total - settled)],
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
      drawVoiceplsPdfFooter(doc, pageWidth, pageHeight);
      doc.save(`${purchase.purchaseNo.toLowerCase()}-receipt.pdf`);
      toast.success(`${entry.documentNo} exported as PDF`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Purchase PDF export failed');
    } finally {
      setActionKey(null);
    }
  };

  const handleVoidPurchase = async (entry: RegisterRow) => {
    if (entry.kind !== 'PURCHASE' || !entry.purchaseId || user?.role !== 'ADMIN') return;
    const confirmed = window.confirm(
      `Void ${entry.documentNo}? This will reverse its stock, vendor ledger, and payment entries while preserving an audit record.`,
    );
    if (!confirmed) return;

    setActionKey(`purchase-void-${entry.purchaseId}`);
    try {
      await api.patch(`/purchases/${entry.purchaseId}/void`, { reason: 'Voided from invoice register' });
      toast.success(`${entry.documentNo} voided`);
      notifyBusinessDataUpdated();
      await load(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Purchase could not be voided');
    } finally {
      setActionKey(null);
    }
  };

  const handleOpenPurchaseEdit = async (entry: RegisterRow) => {
    if (entry.kind !== 'PURCHASE' || !entry.purchaseId || user?.role !== 'ADMIN') return;
    setActionKey(`purchase-load-${entry.purchaseId}`);
    try {
      const response = await api.get<PurchaseRecord>(`/purchases/${entry.purchaseId}`);
      const purchase = response.data;
      setEditingPurchase({
        id: purchase.id,
        documentNo: purchase.purchaseNo,
        date: purchase.date.slice(0, 10),
        weightKg: String(purchase.weightKg ?? ''),
        ratePerKg: String(purchase.ratePerKg ?? ''),
        notes: purchase.notes ?? '',
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Purchase could not be loaded');
    } finally {
      setActionKey(null);
    }
  };

  const handleSavePurchaseEdit = async () => {
    if (!editingPurchase) return;
    const weightKg = Number(editingPurchase.weightKg);
    const ratePerKg = Number(editingPurchase.ratePerKg);
    if (weightKg <= 0 || ratePerKg <= 0) {
      toast.error('Purchase weight and rate must be greater than zero');
      return;
    }

    setSavingPurchaseEdit(true);
    try {
      await api.patch(`/purchases/${editingPurchase.id}`, {
        date: `${editingPurchase.date}T12:00:00+05:00`,
        weightKg,
        ratePerKg,
        notes: editingPurchase.notes.trim() || undefined,
      });
      toast.success(`${editingPurchase.documentNo} updated`);
      setEditingPurchase(null);
      notifyBusinessDataUpdated();
      await load(true);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Purchase could not be updated');
    } finally {
      setSavingPurchaseEdit(false);
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
          r.totalAmount,
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
      render: (r: RegisterRow) => {
        const viewHref = r.kind === 'SELLING' ? `/invoices/${r.invoiceId}` : `/purchases/${r.purchaseId}`;
        const busy = r.kind === 'SELLING'
          ? actionKey === `invoice-pdf-${r.invoiceId}` || actionKey === `invoice-void-${r.invoiceId}`
          : actionKey === `purchase-load-${r.purchaseId}` || actionKey === `purchase-pdf-${r.purchaseId}` || actionKey === `purchase-void-${r.purchaseId}`;
        return (
          <div className="flex items-center justify-end gap-1">
            <Link href={viewHref} className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-emerald-50 hover:text-emerald-600" title={r.kind === 'SELLING' ? 'View invoice' : 'View purchase'}>
              <Eye size={17} />
            </Link>
            {r.kind === 'SELLING' && r.invoiceId && (
              <>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                  title="Edit invoice"
                  disabled={busy}
                  onClick={() => { setEditingInvoiceId(r.invoiceId); setOpen(true); }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                  title="Export invoice PDF"
                  disabled={busy}
                  onClick={() => void handleInvoiceExport(r)}
                >
                  {actionKey === `invoice-pdf-${r.invoiceId}` ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                </button>
                {user?.role === 'ADMIN' && (
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="Delete invoice"
                    disabled={busy}
                    onClick={() => void handleDeleteInvoice(r)}
                  >
                    {actionKey === `invoice-void-${r.invoiceId}` ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                )}
              </>
            )}
            {r.kind === 'PURCHASE' && r.purchaseId && (
              <>
                {user?.role === 'ADMIN' && (
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-600 disabled:opacity-40"
                    title="Edit purchase"
                    disabled={busy}
                    onClick={() => void handleOpenPurchaseEdit(r)}
                  >
                    {actionKey === `purchase-load-${r.purchaseId}` ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                  title="Export purchase PDF"
                  disabled={busy}
                  onClick={() => void handlePurchaseExport(r)}
                >
                  {actionKey === `purchase-pdf-${r.purchaseId}` ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                </button>
                {user?.role === 'ADMIN' && (
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="Delete purchase"
                    disabled={busy}
                    onClick={() => void handleVoidPurchase(r)}
                  >
                    {actionKey === `purchase-void-${r.purchaseId}` ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                )}
              </>
            )}
          </div>
        );
      },
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
            value={filterDate || undefined}
            onChange={(d) => setFilterDate(d)} 
            placeholder="All dates"
            className="!py-1 !text-xs !bg-transparent !border-none !ring-0 font-bold !w-44"
          />
        </div>
        {filterDate && (
          <button
            type="button"
            onClick={() => setFilterDate('')}
            className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-all shrink-0"
          >
            All dates
          </button>
        )}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 shrink-0">
          {([
            ['ALL', 'All invoices'],
            ['CUSTOMER', 'Customer invoices'],
            ['VENDOR', 'Vendor invoices'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setViewFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${
                viewFilter === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
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
        <DataTable
          columns={columns}
          data={visibleEntries}
          loading={loading}
          emptyMessage={filterDate
            ? `No ${viewFilterLabel.toLowerCase()} found on ${new Date(`${filterDate}T00:00:00`).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}.`
            : `No ${viewFilterLabel.toLowerCase()} found.`}
        />
      </div>

      <SalesInvoiceModal
        open={open}
        invoiceId={editingInvoiceId}
        onClose={() => { setOpen(false); setEditingInvoiceId(undefined); }}
        onCreated={() => load(true)}
      />

      <Modal
        open={editingPurchase !== null}
        onClose={() => { if (!savingPurchaseEdit) setEditingPurchase(null); }}
        title={editingPurchase ? `Edit ${editingPurchase.documentNo}` : 'Edit purchase'}
        size="md"
        footer={(
          <>
            <button
              type="button"
              className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
              disabled={savingPurchaseEdit}
              onClick={() => setEditingPurchase(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-100 transition-all hover:bg-emerald-700 disabled:opacity-50"
              disabled={savingPurchaseEdit}
              onClick={() => void handleSavePurchaseEdit()}
            >
              {savingPurchaseEdit && <Loader2 size={16} className="animate-spin" />}
              Save changes
            </button>
          </>
        )}
      >
        {editingPurchase && (
          <div className="space-y-5">
            <p className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
              The vendor, driver, payment mode, and settled amount are locked after posting. This protects your payment and ledger history.
            </p>
            <label className="block space-y-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Purchase date</span>
              <DatePicker
                value={editingPurchase.date}
                onChange={(date) => setEditingPurchase((current) => current ? { ...current, date } : current)}
                className="!py-2.5 text-sm font-bold"
              />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Net weight (kg)</span>
                <input
                  type="number"
                  min="0.001"
                  value={editingPurchase.weightKg}
                  onChange={(event) => setEditingPurchase((current) => current ? { ...current, weightKg: event.target.value } : current)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Rate / kg</span>
                <input
                  type="number"
                  min="0.01"
                  value={editingPurchase.ratePerKg}
                  onChange={(event) => setEditingPurchase((current) => current ? { ...current, ratePerKg: event.target.value } : current)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white"
                />
              </label>
            </div>
            <label className="block space-y-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Notes</span>
              <textarea
                value={editingPurchase.notes}
                onChange={(event) => setEditingPurchase((current) => current ? { ...current, notes: event.target.value } : current)}
                className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                placeholder="Optional purchase notes"
              />
            </label>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
