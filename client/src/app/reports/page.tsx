'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable, { Column } from '@/components/DataTable';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
  BarChart3,
  Calendar,
  Download,
  DollarSign,
  FileText,
  Package,
  Printer,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Loader2,
} from 'lucide-react';
import DatePicker from '@/components/DatePicker';
import { BUSINESS_DATA_UPDATED_EVENT } from '@/lib/business-events';
import { formatLedgerRate, formatLedgerWeight, LedgerCommodityFields } from '@/lib/ledger';
import { VOICEPLS_FOOTER, VOICEPLS_URL, drawVoiceplsPdfFooter } from '@/lib/branding';

type ReportTab = 'pnl' | 'customer' | 'vendor' | 'cash' | 'expense' | 'recovery';

type PnLReport = {
  date: string;
  purchaseWt: number;
  soldWt: number;
  purchaseAmt: number;
  salesAmt: number;
  grossProfit: number;
  totalExpenses: number;
  dailyProfit: number;
  remainShort: number;
  purchaseCount: number;
  invoiceCount: number;
};

type LedgerRow = LedgerCommodityFields & {
  date: string;
  narration?: string | null;
  type: string;
  amount: number;
  runningBalance: number;
};

type CashRow = {
  date: string;
  type: string;
  narration?: string | null;
  amount: number;
  runningBalance: number;
  voucherRef?: string | null;
};

type ExpenseRow = {
  expenseAccount: string;
  category: string;
  total: number;
  count: number;
};

type DriverExpenseRecord = {
  date: string;
  driver: string;
  source: string;
  reference: string;
  amount: number;
  narration: string;
};

type RecoveryRow = {
  date: string;
  customer: string | null;
  amount: number;
  paymentMode: string;
  narration?: string | null;
  reference?: string | null;
};

type ReportState =
  | { kind: 'pnl'; data: PnLReport }
  | {
      kind: 'statement';
      title: 'Customer Statement' | 'Vendor Statement';
      subjectLabel: 'Customer' | 'Vendor';
      subjectName: string;
      contact?: string | null;
      address?: string | null;
      rows: LedgerRow[];
      periodLabel: string;
      endingBalance: number;
    }
  | {
      kind: 'cash';
      rows: CashRow[];
      periodLabel: string;
      totalReceipts: number;
      totalPayments: number;
      endingBalance: number;
    }
  | {
      kind: 'expense';
      rows: ExpenseRow[];
      driverRecords: DriverExpenseRecord[];
      periodLabel: string;
      grandTotal: number;
    }
  | {
      kind: 'recovery';
      rows: RecoveryRow[];
      periodLabel: string;
      total: number;
    };

type CustomerOption = { id: number; shopName: string };
type VendorOption = { id: number; name: string };

const REPORT_CACHE_STORAGE_KEY = 'poultryflow:reports-cache:v4';

const REPORT_TABS: Array<{
  id: ReportTab;
  label: string;
  icon: any;
  autoLoad: boolean;
}> = [
  { id: 'pnl', label: 'Daily P&L', icon: TrendingUp, autoLoad: true },
  { id: 'customer', label: 'Customer Ledger', icon: Users, autoLoad: false },
  { id: 'vendor', label: 'Vendor Ledger', icon: Package, autoLoad: false },
  { id: 'cash', label: 'Cash Book', icon: FileText, autoLoad: true },
  { id: 'expense', label: 'Expenses', icon: Wallet, autoLoad: true },
  { id: 'recovery', label: 'Recovery', icon: DollarSign, autoLoad: true },
];

const formatCurrency = (value: unknown) => `Rs. ${Number(value ?? 0).toLocaleString('en-PK')}`;
const formatWeight = (value: unknown) => `${Number(value ?? 0).toFixed(2)} kg`;

function readReportCache(): Record<string, ReportState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(REPORT_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ReportState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeReportCache(cache: Record<string, ReportState>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REPORT_CACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage quota or access failures; in-memory cache still works.
  }
}

function getReportCacheKey(
  tab: ReportTab,
  filters: { date: string; customerId: string; vendorId: string },
) {
  switch (tab) {
    case 'pnl':
      return `pnl:${filters.date}`;
    case 'customer':
      return `customer:${filters.customerId || 'none'}`;
    case 'vendor':
      return `vendor:${filters.vendorId || 'none'}`;
    case 'cash':
    case 'expense':
    case 'recovery':
      return `${tab}:${filters.date || 'all-time'}`;
    default:
      return tab;
  }
}

function getPKTDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function getDateRangeQuery(date: string) {
  if (!date) return '';
  const start = new Date(`${date}T00:00:00.000+05:00`).toISOString();
  const end = new Date(`${date}T23:59:59.999+05:00`).toISOString();
  return `startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
}

function formatPeriodLabel(date: string) {
  return date
    ? new Date(`${date}T12:00:00+05:00`).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'All Time';
}

const statementColumns: Column<LedgerRow>[] = [
  {
    key: 'date',
    label: 'Date',
    render: (row) => <span className="font-medium text-slate-600">{new Date(row.date).toLocaleDateString('en-PK')}</span>,
  },
  { key: 'narration', label: 'Description', render: (row) => <span className="text-slate-500 italic text-xs">{row.narration || '—'}</span> },
  {
    key: 'type',
    label: 'Type',
    render: (row) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
        row.type.includes('BOUNCED') || row.type.includes('FAILED') || row.type.includes('REOPENED')
          ? 'bg-red-50 text-red-600'
          : row.type === 'UDHAAR' || row.type.includes('PENDING') || row.type === 'DEBIT'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-600'
      }`}>{row.type}</span>
    ),
  },
  {
    key: 'weightKg',
    label: 'Weight',
    align: 'right',
    render: (row) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerWeight(row.weightKg)}</span>,
  },
  {
    key: 'ratePerKg',
    label: 'Rate',
    align: 'right',
    render: (row) => <span className="font-medium text-slate-700 whitespace-nowrap">{formatLedgerRate(row)}</span>,
  },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    render: (row) => <span className="font-bold text-slate-900">{formatCurrency(row.amount)}</span>,
  },
  {
    key: 'runningBalance',
    label: 'Balance',
    align: 'right',
    render: (row) => <span className="font-black text-slate-900">{formatCurrency(row.runningBalance)}</span>,
  },
];

const cashColumns: Column<CashRow>[] = [
  {
    key: 'date',
    label: 'Date',
    render: (row) => <span className="font-medium text-slate-600">{new Date(row.date).toLocaleDateString('en-PK')}</span>,
  },
  {
    key: 'type',
    label: 'Type',
    render: (row) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${
        row.type === 'RECEIPT' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
      }`}>
        {row.type}
      </span>
    ),
  },
  { key: 'narration', label: 'Narration', render: (row) => <span className="text-slate-500 italic text-xs">{row.narration || '—'}</span> },
  {
    key: 'voucherRef',
    label: 'Ref',
    render: (row) => row.voucherRef ? <span className="text-[10px] font-bold text-slate-400">#{row.voucherRef}</span> : '—',
  },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    render: (row) => <span className="font-bold text-slate-900">{formatCurrency(row.amount)}</span>,
  },
  {
    key: 'runningBalance',
    label: 'Balance',
    align: 'right',
    render: (row) => <span className="font-black text-slate-900">{formatCurrency(row.runningBalance)}</span>,
  },
];

const expenseColumns: Column<ExpenseRow>[] = [
  { key: 'expenseAccount', label: 'Expense Account', render: (row) => <span className="font-bold text-slate-900">{row.expenseAccount}</span> },
  { key: 'category', label: 'Category', render: (row) => <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{row.category}</span> },
  { key: 'count', label: 'Entries', align: 'center', render: (row) => <span className="font-medium text-slate-500">{row.count}</span> },
  {
    key: 'total',
    label: 'Total Spent',
    align: 'right',
    render: (row) => <span className="font-black text-red-600">{formatCurrency(row.total)}</span>,
  },
];

const driverExpenseColumns: Column<DriverExpenseRecord>[] = [
  {
    key: 'date',
    label: 'Date',
    render: (row) => <span className="font-medium text-slate-600">{new Date(row.date).toLocaleDateString('en-PK')}</span>,
  },
  { key: 'driver', label: 'Driver', render: (row) => <span className="font-bold text-slate-900">{row.driver}</span> },
  { key: 'source', label: 'Record Type', render: (row) => <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{row.source}</span> },
  { key: 'reference', label: 'Invoice / Purchase', render: (row) => <span className="text-xs font-bold text-emerald-700">{row.reference}</span> },
  { key: 'narration', label: 'Details', render: (row) => <span className="text-xs text-slate-500">{row.narration}</span> },
  { key: 'amount', label: 'Amount', align: 'right', render: (row) => <span className="font-black text-red-600">{formatCurrency(row.amount)}</span> },
];

const recoveryColumns: Column<RecoveryRow>[] = [
  {
    key: 'date',
    label: 'Date',
    render: (row) => <span className="font-medium text-slate-600">{new Date(row.date).toLocaleDateString('en-PK')}</span>,
  },
  { key: 'customer', label: 'Customer', render: (row) => <span className="font-bold text-slate-900">{row.customer || '—'}</span> },
  { key: 'paymentMode', label: 'Mode', render: (row) => <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.paymentMode}</span> },
  { key: 'reference', label: 'Reference', render: (row) => <span className="text-xs text-slate-500">{row.reference || '—'}</span> },
  {
    key: 'amount',
    label: 'Amount',
    align: 'right',
    render: (row) => <span className="font-black text-emerald-600">{formatCurrency(row.amount)}</span>,
  },
];

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: 'emerald' | 'red' | 'blue' | 'amber' }) {
  const borders = {
    emerald: 'border-emerald-200 bg-emerald-50/30 text-emerald-700',
    red: 'border-red-200 bg-red-50/30 text-red-700',
    blue: 'border-blue-200 bg-blue-50/30 text-blue-700',
    amber: 'border-amber-200 bg-amber-50/30 text-amber-700',
  };

  return (
    <div className={`p-5 rounded-2xl border ${borders[color]} shadow-sm transition-all hover:shadow-md print:shadow-none print:bg-white`}>
      <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className="text-xl font-black tracking-tight leading-none mb-1 text-slate-900">{value}</div>
      {sub && <div className="text-[9px] font-bold opacity-75 uppercase tracking-tight text-slate-500">{sub}</div>}
    </div>
  );
}

function getReportPeriodLabel(report: ReportState) {
  if (report.kind === 'pnl') {
    return new Date(report.data.date).toLocaleDateString('en-PK');
  }
  return report.periodLabel;
}

type PdfAlign = 'left' | 'center' | 'right';
type PdfCell = {
  text: string;
  align?: PdfAlign;
  color?: string;
  bold?: boolean;
  italic?: boolean;
};
type PdfColumn = {
  header: string;
  width: number;
  align?: PdfAlign;
};

const PDF_MARGIN = 12;

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  const value = Number.parseInt(expanded, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function formatPdfDate(value: string) {
  return new Date(value).toLocaleDateString('en-PK');
}

function formatPdfDateTime(value: Date = new Date()) {
  return value.toLocaleString('en-PK');
}

function drawFooter(doc: any, pageNumber: number, totalPages: number, generatedAt: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 29;

  doc.setDrawColor(226, 232, 240);
  doc.line(PDF_MARGIN, footerY - 7, pageWidth - PDF_MARGIN, footerY - 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(`SYSTEM GENERATED REPORT - ${generatedAt}`, PDF_MARGIN, footerY);
  doc.text(`PAGE ${String(pageNumber).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`, pageWidth / 2, footerY, { align: 'center' });
  doc.text('AUTHORIZED SIGNATURE', pageWidth - PDF_MARGIN, footerY, { align: 'right' });
  drawVoiceplsPdfFooter(doc, pageWidth, pageHeight);
}

function drawMetricCards(
  doc: any,
  metrics: Array<{ label: string; value: string; sub?: string; color: string }>,
  startY: number,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usableWidth = pageWidth - PDF_MARGIN * 2;
  const gap = 6;
  const columns = metrics.length >= 4 ? 4 : metrics.length === 3 ? 3 : 2;
  const cardWidth = (usableWidth - gap * (columns - 1)) / columns;
  const cardHeight = 26;
  const rowCount = Math.ceil(metrics.length / columns);

  metrics.forEach((metric, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = PDF_MARGIN + col * (cardWidth + gap);
    const y = startY + row * (cardHeight + gap);
    const [r, g, b] = hexToRgb(metric.color);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(r, g, b);
    doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, 'FD');

    doc.setTextColor(r, g, b);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(metric.label.toUpperCase(), x + 3, y + 7);

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(metric.value, x + 3, y + 14);

    if (metric.sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(metric.sub.toUpperCase(), x + 3, y + 20);
    }
  });

  return startY + rowCount * (cardHeight + gap) - gap;
}

function drawInfoPanel(
  doc: any,
  x: number,
  y: number,
  width: number,
  title: string,
  lines: Array<{ label: string; value: string }>,
  accent: string,
) {
  const [r, g, b] = hexToRgb(accent);
  const height = 34 + lines.length * 7;

  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(r, g, b);
  doc.roundedRect(x, y, width, height, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(r, g, b);
  doc.text(title.toUpperCase(), x + 4, y + 8);

  lines.forEach((line, index) => {
    const lineY = y + 15 + index * 7;
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(line.label, x + 4, lineY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(line.value, x + width - 4, lineY, { align: 'right' });
  });

  return y + height;
}

function drawSectionTitle(doc: any, x: number, y: number, title: string, color = '#10b981') {
  const [r, g, b] = hexToRgb(color);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(r, g, b);
  doc.text(title.toUpperCase(), x, y);
}

function drawTable(
  doc: any,
  columns: PdfColumn[],
  rows: PdfCell[][],
  startY: number,
  options?: { compact?: boolean },
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - PDF_MARGIN * 2;
  const compact = options?.compact ?? false;
  const headerHeight = compact ? 8.5 : 10;
  const rowPadding = compact ? 2.5 : 3;
  const lineHeight = compact ? 3.6 : 4.2;
  const bottomLimit = pageHeight - (compact ? 18 : 22);
  let y = startY;

  const drawHeader = () => {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(PDF_MARGIN, y, usableWidth, headerHeight, 'FD');

    let x = PDF_MARGIN;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(compact ? 7.5 : 8);
    doc.setTextColor(51, 65, 85);
    columns.forEach((column) => {
      const textX = column.align === 'right'
        ? x + column.width - rowPadding
        : column.align === 'center'
          ? x + column.width / 2
          : x + rowPadding;

      doc.text(column.header.toUpperCase(), textX, y + (compact ? 5.7 : 6.5), {
        align: column.align ?? 'left',
        maxWidth: column.width - rowPadding * 2,
      });
      x += column.width;
    });
    y += headerHeight;
  };

  drawHeader();

  rows.forEach((row, rowIndex) => {
    const wrapped = row.map((cell, cellIndex) => {
      const width = columns[cellIndex].width - rowPadding * 2;
      return doc.splitTextToSize(cell.text, width);
    });
    const rowHeight = Math.max(compact ? 8.5 : 10, ...wrapped.map((lines: string[]) => (lines.length * lineHeight) + (compact ? 1.5 : 2)));

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = PDF_MARGIN + 6;
      drawHeader();
    }

    let x = PDF_MARGIN;
    doc.setFillColor(rowIndex % 2 === 0 ? 255 : 248, rowIndex % 2 === 0 ? 255 : 250, rowIndex % 2 === 0 ? 255 : 252);
    doc.rect(x, y, usableWidth, rowHeight, 'F');

    doc.setDrawColor(226, 232, 240);
    doc.line(PDF_MARGIN, y, PDF_MARGIN, y + rowHeight);
    doc.line(PDF_MARGIN + usableWidth, y, PDF_MARGIN + usableWidth, y + rowHeight);

    row.forEach((cell, cellIndex) => {
      const column = columns[cellIndex];
      const cellX = x + rowPadding;
      const cellLines = wrapped[cellIndex];
      const cellWidth = column.width - rowPadding * 2;
      const cellY = y + (compact ? 4.2 : 5);
      const textX = cell.align === 'right'
        ? x + column.width - rowPadding
        : cell.align === 'center'
          ? x + column.width / 2
          : cellX;

      doc.setFont('helvetica', cell.bold ? 'bold' : cell.italic ? 'italic' : 'normal');
      doc.setFontSize(compact ? 7.4 : 8.2);
      if (cell.color) {
        const [r, g, b] = hexToRgb(cell.color);
        doc.setTextColor(r, g, b);
      } else {
        doc.setTextColor(15, 23, 42);
      }
      doc.text(cellLines, textX, cellY, {
        align: cell.align ?? column.align ?? 'left',
        baseline: 'top',
        maxWidth: cellWidth,
      });

      x += column.width;
    });
    doc.setDrawColor(226, 232, 240);
    doc.line(PDF_MARGIN, y + rowHeight, PDF_MARGIN + usableWidth, y + rowHeight);

    y += rowHeight;
  });

  return y;
}

async function exportReportPdf(
  report: ReportState,
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  doc.setLineWidth(0.15);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const totalWidth = pageWidth - PDF_MARGIN * 2;
  const generatedAt = formatPdfDateTime();
  const periodLabel = getReportPeriodLabel(report) || 'All Time';
  const reportLabel = REPORT_TABS.find((tab) => tab.id === report.kind)?.label ?? 'Report';
  const reportTitle = report.kind === 'statement' ? report.title : reportLabel;
  const reportSlug = reportTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const colors = {
    navy: '#0f172a',
    green: '#10b981',
    sky: '#3b82f6',
    red: '#ef4444',
    amber: '#f59e0b',
  };

  const addFooter = () => {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      drawFooter(doc, page, totalPages, generatedAt);
    }
  };

  const drawCoverHeader = (subtitle: string) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 38, 'F');
    doc.setFillColor(16, 185, 129);
    doc.rect(0, 38, pageWidth, 3.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('POULTRYFLOW', PDF_MARGIN, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('JAHANIA POULTRY MANAGEMENT', PDF_MARGIN, 17);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(generatedAt, pageWidth - PDF_MARGIN, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('System generated financial report', pageWidth - PDF_MARGIN, 17, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(reportTitle.toUpperCase(), PDF_MARGIN, 25);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(subtitle, PDF_MARGIN, 31);
    doc.setTextColor(15, 23, 42);
  };

  const addTablePage = (heading: string, subtitle: string, columns: PdfColumn[], rows: PdfCell[][]) => {
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(heading, PDF_MARGIN, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, PDF_MARGIN, 22);
    doc.setDrawColor(226, 232, 240);
    doc.line(PDF_MARGIN, 26, pageWidth - PDF_MARGIN, 26);
    drawSectionTitle(doc, PDF_MARGIN, 34, 'Detailed Entries', colors.green);
    drawTable(doc, columns, rows, 38, { compact: true });
  };

  drawCoverHeader(`Period ${periodLabel}`);
  let coverBottom = 52;

  if (report.kind === 'pnl') {
    coverBottom = drawMetricCards(doc, [
      { label: 'Daily Profit / Loss', value: formatCurrency(report.data.dailyProfit), color: report.data.dailyProfit >= 0 ? colors.green : colors.red, sub: report.data.dailyProfit >= 0 ? 'Profit after expenses' : 'Loss after expenses' },
      { label: 'Gross Profit', value: formatCurrency(report.data.grossProfit), color: colors.green, sub: 'Sales less purchases' },
      { label: 'Daily Purchases', value: formatCurrency(report.data.purchaseAmt), color: colors.amber, sub: `${formatWeight(report.data.purchaseWt)} purchased` },
      { label: 'Daily Supply', value: formatCurrency(report.data.salesAmt), color: colors.sky, sub: `${formatWeight(report.data.soldWt)} dispatched` },
      { label: 'Operating Costs', value: formatCurrency(report.data.totalExpenses), color: colors.red, sub: 'Recorded expenses' },
      { label: 'Net Weight Balance', value: formatWeight(report.data.remainShort), color: colors.amber, sub: 'Purchases minus supply' },
    ], coverBottom);
    const panelTop = coverBottom + 8;
    const panelWidth = (totalWidth - 6) / 2;
    const panelHeight = 34 + 3 * 7;
    drawInfoPanel(doc, PDF_MARGIN, panelTop, panelWidth, 'Acquisition Profile', [
      { label: 'Weight Purchased', value: formatWeight(report.data.purchaseWt) },
      { label: 'Capital Outlay', value: formatCurrency(report.data.purchaseAmt) },
      { label: 'Supply Sources', value: `${report.data.purchaseCount} Lots` },
    ], colors.green);
    drawInfoPanel(doc, PDF_MARGIN + panelWidth + 6, panelTop, panelWidth, 'Sales Profile', [
      { label: 'Weight Dispatched', value: formatWeight(report.data.soldWt) },
      { label: 'Gross Revenue', value: formatCurrency(report.data.salesAmt) },
      { label: 'Dispatch Units', value: `${report.data.invoiceCount} Invoices` },
    ], colors.sky);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Brand-led operations summary with key production and sales indicators', PDF_MARGIN, panelTop + panelHeight + 8);
  }

  if (report.kind === 'statement') {
    coverBottom = drawMetricCards(doc, [
      { label: 'Total Transactions', value: String(report.rows.length), color: colors.sky, sub: 'In the given period' },
      { label: 'Closing Balance', value: formatCurrency(report.endingBalance), color: report.endingBalance > 0 ? colors.red : colors.green, sub: 'Current outstanding' },
    ], coverBottom);
    drawInfoPanel(doc, PDF_MARGIN, coverBottom + 8, totalWidth, `${report.subjectLabel} Account`, [
      { label: 'Name', value: report.subjectName },
      { label: 'Contact', value: report.contact || 'N/A' },
      { label: 'Address', value: report.address || 'N/A' },
      { label: 'Balance', value: formatCurrency(report.endingBalance) },
    ], colors.green);
  }

  if (report.kind === 'cash') {
    coverBottom = drawMetricCards(doc, [
      { label: 'Cash Receipts', value: formatCurrency(report.totalReceipts), color: colors.green, sub: 'Total inflow' },
      { label: 'Cash Payments', value: formatCurrency(report.totalPayments), color: colors.red, sub: 'Total outflow' },
      { label: 'Hand Balance', value: formatCurrency(report.endingBalance), color: colors.sky, sub: 'Closing vault' },
    ], coverBottom);
    const panelTop = coverBottom + 8;
    const panelWidth = (totalWidth - 6) / 2;
    drawInfoPanel(doc, PDF_MARGIN, panelTop, panelWidth, 'Cash Movement', [
      { label: 'Receipts', value: String(report.rows.filter((row) => row.type === 'RECEIPT').length) },
      { label: 'Payments', value: String(report.rows.filter((row) => row.type === 'PAYMENT').length) },
      { label: 'Closing Balance', value: formatCurrency(report.endingBalance) },
    ], colors.sky);
    drawInfoPanel(doc, PDF_MARGIN + panelWidth + 6, panelTop, panelWidth, 'Reporting Window', [
      { label: 'Period', value: periodLabel },
      { label: 'Entries', value: String(report.rows.length) },
    ], colors.green);
  }

  if (report.kind === 'expense') {
    coverBottom = drawMetricCards(doc, [
      { label: 'Expense Summary', value: formatCurrency(report.grandTotal), color: colors.red, sub: 'Total spending' },
      { label: 'Budget Centers', value: String(report.rows.length), color: colors.sky, sub: 'Unique categories' },
    ], coverBottom);
    const topCategory = report.rows[0];
    const panelTop = coverBottom + 8;
    const panelWidth = (totalWidth - 6) / 2;
    drawInfoPanel(doc, PDF_MARGIN, panelTop, panelWidth, 'Top Spending Head', [
      { label: 'Account', value: topCategory?.expenseAccount || 'N/A' },
      { label: 'Category', value: topCategory?.category || 'N/A' },
      { label: 'Total', value: topCategory ? formatCurrency(topCategory.total) : formatCurrency(0) },
    ], colors.red);
    drawInfoPanel(doc, PDF_MARGIN + panelWidth + 6, panelTop, panelWidth, 'Expense Window', [
      { label: 'Period', value: periodLabel },
      { label: 'Grand Total', value: formatCurrency(report.grandTotal) },
    ], colors.sky);
  }

  if (report.kind === 'recovery') {
    coverBottom = drawMetricCards(doc, [
      { label: 'Total Recovered', value: formatCurrency(report.total), color: colors.green, sub: 'Collection sum' },
      { label: 'Total Entries', value: String(report.rows.length), color: colors.sky, sub: 'Payments received' },
    ], coverBottom);
    const modeSummary = report.rows.reduce<Record<string, { count: number; total: number }>>((acc, row) => {
      const key = row.paymentMode || 'UNKNOWN';
      acc[key] = acc[key] || { count: 0, total: 0 };
      acc[key].count += 1;
      acc[key].total += row.amount;
      return acc;
    }, {});
    const dominantMode = Object.entries(modeSummary).sort((a, b) => b[1].total - a[1].total)[0];
    const panelTop = coverBottom + 8;
    const panelWidth = (totalWidth - 6) / 2;
    drawInfoPanel(doc, PDF_MARGIN, panelTop, panelWidth, 'Payment Mode Mix', [
      { label: 'Cash', value: formatCurrency(modeSummary.CASH?.total || 0) },
      { label: 'Online', value: formatCurrency(modeSummary.ONLINE?.total || 0) },
      { label: 'Cheque', value: formatCurrency(modeSummary.CHEQUE?.total || 0) },
    ], colors.green);
    drawInfoPanel(doc, PDF_MARGIN + panelWidth + 6, panelTop, panelWidth, 'Recovery Snapshot', [
      { label: 'Top Mode', value: dominantMode ? dominantMode[0] : 'N/A' },
      { label: 'Entries', value: String(report.rows.length) },
      { label: 'Period', value: periodLabel },
    ], colors.sky);
  }

  if (report.kind === 'statement') {
    const columns: PdfColumn[] = [
      { header: 'Date', width: 18 },
      { header: 'Description', width: 55 },
      { header: 'Type', width: 16, align: 'center' },
      { header: 'Weight', width: 23, align: 'right' },
      { header: 'Rate', width: 25, align: 'right' },
      { header: 'Amount', width: 25, align: 'right' },
      { header: 'Balance', width: 24, align: 'right' },
    ];
    const rows: PdfCell[][] = report.rows.map((row) => ([
      { text: formatPdfDate(row.date) },
      { text: row.narration || '-', italic: true },
      { text: row.type, align: 'center', color: row.type === 'DEBIT' ? colors.red : colors.green, bold: true },
      { text: formatLedgerWeight(row.weightKg), align: 'right' },
      { text: formatLedgerRate(row), align: 'right' },
      { text: formatCurrency(row.amount), align: 'right', bold: true },
      { text: formatCurrency(row.runningBalance), align: 'right', bold: true },
    ]));
    addTablePage(`${reportTitle} Ledger`, `${report.subjectName} - ${periodLabel}`, columns, rows);
  }

  if (report.kind === 'cash') {
    const columns: PdfColumn[] = [
      { header: 'Date', width: 20 },
      { header: 'Type', width: 16, align: 'center' },
      { header: 'Narration', width: 68 },
      { header: 'Ref', width: 18, align: 'center' },
      { header: 'Amount', width: 32, align: 'right' },
      { header: 'Balance', width: 32, align: 'right' },
    ];
    const rows: PdfCell[][] = report.rows.map((row) => ([
      { text: formatPdfDate(row.date) },
      { text: row.type, align: 'center', color: row.type === 'RECEIPT' ? colors.green : colors.red, bold: true },
      { text: row.narration || '-', italic: true },
      { text: row.voucherRef ? `#${row.voucherRef}` : '-', align: 'center' },
      { text: formatCurrency(row.amount), align: 'right', bold: true },
      { text: formatCurrency(row.runningBalance), align: 'right', bold: true },
    ]));
    addTablePage('Cash Book', periodLabel, columns, rows);
  }

  if (report.kind === 'expense') {
    const columns: PdfColumn[] = [
      { header: 'Expense Account', width: 80 },
      { header: 'Category', width: 36 },
      { header: 'Entries', width: 22, align: 'center' },
      { header: 'Total Spent', width: 48, align: 'right' },
    ];
    const rows: PdfCell[][] = report.rows.map((row) => ([
      { text: row.expenseAccount, bold: true },
      { text: row.category },
      { text: String(row.count), align: 'center' },
      { text: formatCurrency(row.total), align: 'right', bold: true, color: colors.red },
    ]));
    addTablePage('Expense Summary', periodLabel, columns, rows);
  }

  if (report.kind === 'recovery') {
    const columns: PdfColumn[] = [
      { header: 'Date', width: 20 },
      { header: 'Customer', width: 54 },
      { header: 'Mode', width: 18, align: 'center' },
      { header: 'Reference', width: 28, align: 'center' },
      { header: 'Narration', width: 42 },
      { header: 'Amount', width: 24, align: 'right' },
    ];
    const rows: PdfCell[][] = report.rows.map((row) => ([
      { text: formatPdfDate(row.date) },
      { text: row.customer || '-', bold: true },
      { text: row.paymentMode, align: 'center', color: row.paymentMode === 'ONLINE' ? colors.sky : row.paymentMode === 'CHEQUE' ? colors.amber : colors.green, bold: true },
      { text: row.reference || '-', align: 'center' },
      { text: row.narration || '-', italic: true },
      { text: formatCurrency(row.amount), align: 'right', bold: true, color: colors.green },
    ]));
    addTablePage('Recovery Register', periodLabel, columns, rows);
  }

  addFooter();
  doc.save(`poultryflow-${reportSlug}-${report.kind === 'pnl' ? report.data.date : 'all-time'}.pdf`);
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('pnl');
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [report, setReport] = useState<ReportState | null>(null);
  const reportCacheRef = useRef<Record<string, ReportState>>(readReportCache());
  const requestSeqRef = useRef(0);
  const [filters, setFilters] = useState({
    date: getPKTDate(),
    customerId: '',
    vendorId: '',
  });
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  useEffect(() => {
    api.get('/customers').then((r) => setCustomers(r.data ?? []));
    api.get('/vendors').then((r) => setVendors(r.data ?? []));
  }, []);

  const loadReport = useCallback(
    async (tab: ReportTab = activeTab) => {
      const requestId = ++requestSeqRef.current;
      if ((tab === 'customer' || tab === 'vendor') && !filters.customerId && !filters.vendorId) {
        toast.error(tab === 'customer' ? 'Please select a customer' : 'Please select a vendor');
        return;
      }
      const cacheKey = getReportCacheKey(tab, filters);
      const writeReport = (next: ReportState) => {
        setReport(next);
        const nextCache = { ...reportCacheRef.current, [cacheKey]: next };
        reportCacheRef.current = nextCache;
        writeReportCache(nextCache);
      };
      setLoading(true);
      try {
        const res = await (async () => {
          switch (tab) {
            case 'pnl': return api.get(`/reports/daily-pnl?date=${filters.date}`);
            case 'customer': return api.get(`/reports/customer-statement?customerId=${filters.customerId}`);
            case 'vendor': return api.get(`/reports/vendor-statement?vendorId=${filters.vendorId}`);
            case 'cash': return api.get(`/reports/cash-book?${getDateRangeQuery(filters.date)}`);
            case 'expense': return api.get(`/reports/expense-summary?${getDateRangeQuery(filters.date)}`);
            case 'recovery': return api.get(`/reports/recovery?${getDateRangeQuery(filters.date)}`);
          }
        })();

        if (requestId !== requestSeqRef.current) {
          return;
        }

        const payload = res.data ?? {};
        switch (tab) {
          case 'pnl': writeReport({ kind: 'pnl', data: { date: String(payload.date ?? filters.date), purchaseWt: Number(payload.purchaseWt ?? payload.purchasedWeight ?? 0), soldWt: Number(payload.soldWt ?? payload.soldWeight ?? 0), purchaseAmt: Number(payload.purchaseAmt ?? payload.purchaseAmount ?? 0), salesAmt: Number(payload.salesAmt ?? payload.salesAmount ?? 0), grossProfit: Number(payload.grossProfit ?? 0), totalExpenses: Number(payload.totalExpenses ?? 0), dailyProfit: Number(payload.dailyProfit ?? payload.netProfit ?? 0), remainShort: Number(payload.remainShort ?? 0), purchaseCount: Number(payload.purchaseCount ?? 0), invoiceCount: Number(payload.invoiceCount ?? 0) } }); break;
          case 'customer': {
            const rows = (payload.ledger || []).map((row: any) => ({ date: row.date, narration: row.narration, type: row.type, amount: Number(row.amount), runningBalance: Number(row.runningBalance), weightKg: row.weightKg == null ? null : Number(row.weightKg), ratePerKg: row.ratePerKg == null ? null : Number(row.ratePerKg), rateCount: Number(row.rateCount ?? 0) }));
            writeReport({ kind: 'statement', title: 'Customer Statement', subjectLabel: 'Customer', subjectName: payload.customer?.shopName ?? 'Customer', contact: payload.customer?.contact, address: payload.customer?.address, rows, periodLabel: 'All Time', endingBalance: rows[rows.length - 1]?.runningBalance ?? 0 });
            break;
          }
          case 'vendor': {
            const rows = (payload.ledger || []).map((row: any) => ({ date: row.date, narration: row.narration, type: row.type, amount: Number(row.amount), runningBalance: Number(row.runningBalance), weightKg: row.weightKg == null ? null : Number(row.weightKg), ratePerKg: row.ratePerKg == null ? null : Number(row.ratePerKg), rateCount: Number(row.rateCount ?? 0) }));
            writeReport({ kind: 'statement', title: 'Vendor Statement', subjectLabel: 'Vendor', subjectName: payload.vendor?.name ?? 'Vendor', contact: payload.vendor?.contact, address: payload.vendor?.address, rows, periodLabel: 'All Time', endingBalance: rows[rows.length - 1]?.runningBalance ?? 0 });
            break;
          }
          case 'cash': {
            const rows = (payload || []).map((row: any) => ({ date: row.date, type: row.type, narration: row.narration, amount: Number(row.amount), runningBalance: Number(row.runningBalance), voucherRef: row.voucherRef }));
            writeReport({ kind: 'cash', rows, periodLabel: formatPeriodLabel(filters.date), totalReceipts: rows.filter((r: any) => r.type === 'RECEIPT').reduce((s: any, r: any) => s + r.amount, 0), totalPayments: rows.filter((r: any) => r.type === 'PAYMENT').reduce((s: any, r: any) => s + r.amount, 0), endingBalance: rows[rows.length - 1]?.runningBalance ?? 0 });
            break;
          }
          case 'expense': {
            const sum = payload.summary || [];
            const rows = Array.isArray(sum)
              ? sum.map((row: any) => ({ expenseAccount: row.expenseAccount, category: row.category ?? 'General', total: Number(row.total), count: Number(row.count) }))
              : Object.entries(sum).map(([acc, row]: [string, any]) => ({ expenseAccount: acc, category: row.category ?? 'General', total: Number(row.total), count: Number(row.count) }));
            const driverRecords = (payload.driverRecords ?? []).map((row: any) => ({
              date: row.date,
              driver: row.driver ?? 'Driver',
              source: row.source ?? 'INVOICE',
              reference: row.reference ?? '—',
              amount: Number(row.amount ?? 0),
              narration: row.narration ?? 'Driver transport charge',
            }));
            writeReport({ kind: 'expense', rows: rows.sort((a, b) => b.total - a.total), driverRecords, periodLabel: formatPeriodLabel(filters.date), grandTotal: Number(payload.grandTotal ?? 0) });
            break;
          }
          case 'recovery': {
            const rows = (payload || []).map((row: any) => ({ date: row.date, customer: row.customer, amount: Number(row.amount), paymentMode: row.paymentMode, narration: row.narration, reference: row.reference }));
            writeReport({ kind: 'recovery', rows, periodLabel: formatPeriodLabel(filters.date), total: rows.reduce((s: any, r: any) => s + r.amount, 0) });
            break;
          }
        }
      } catch {
        toast.error('Failed to generate report');
      } finally {
        if (requestId === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [activeTab, filters],
  );

  useEffect(() => {
    const cacheKey = getReportCacheKey(activeTab, filters);
    const cached = reportCacheRef.current[cacheKey];
    if (cached) {
      setReport(cached);
      return;
    }

    const tabConfig = REPORT_TABS.find((tab) => tab.id === activeTab);
    if (tabConfig?.autoLoad) {
      void loadReport(activeTab);
    } else {
      setReport(null);
    }
  }, [activeTab, filters, loadReport]);

  useEffect(() => {
    const handleBusinessDataUpdated = () => {
      reportCacheRef.current = {};
      writeReportCache({});
      void loadReport(activeTab);
    };

    window.addEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
    return () => window.removeEventListener(BUSINESS_DATA_UPDATED_EVENT, handleBusinessDataUpdated);
  }, [activeTab, loadReport]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== REPORT_CACHE_STORAGE_KEY) return;
      reportCacheRef.current = readReportCache();
      const cacheKey = getReportCacheKey(activeTab, filters);
      const cached = reportCacheRef.current[cacheKey];
      if (cached) {
        setReport(cached);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [activeTab, filters]);

  const handleDownloadPdf = useCallback(async () => {
    if (!report) {
      toast.error('Generate the report first');
      return;
    }
    setExportingPdf(true);
    try {
      await exportReportPdf(report);
    } catch (error) {
      console.error('PDF export failed', error);
      toast.error('PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  }, [report]);

  return (
    <AppLayout>
      <div className="no-print flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Reports & Analytics</h1>
          <p className="text-slate-500 font-medium tracking-tight">Access financial statements, cash books, and detailed business intelligence.</p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button onClick={() => window.print()} disabled={!report} title={report ? 'Print report' : 'Generate a report first'} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Printer size={16} /> Print
          </button>
          <button onClick={handleDownloadPdf} disabled={exportingPdf || !report} title={report ? 'Export PDF' : 'Generate a report first'} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exportingPdf ? 'Preparing...' : 'Export PDF'}
          </button>
        </div>
      </div>

      <div className="no-print bg-white border border-slate-200 rounded-3xl p-8 shadow-sm mb-10">
        {/* Tab Navigation */}
        <div className="flex gap-1.5 mb-10 p-1 bg-slate-50 rounded-2xl w-fit overflow-x-auto no-scrollbar">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                  active ? 'bg-white text-emerald-600 shadow-sm shadow-slate-200' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-end">
          {activeTab === 'pnl' && (
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Report Date</label>
              <DatePicker value={filters.date} onChange={d => setFilters(p => ({ ...p, date: d }))} className="!py-2.5 !rounded-xl !text-sm font-bold" />
            </div>
          )}

          {(['cash', 'expense', 'recovery'] as ReportTab[]).includes(activeTab) && (
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Report Date</label>
              <DatePicker value={filters.date} onChange={d => setFilters(p => ({ ...p, date: d }))} className="!py-2.5 !rounded-xl !text-sm font-bold" />
            </div>
          )}

          {activeTab === 'customer' && (
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Target Customer</label>
              <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white outline-none transition-all" value={filters.customerId} onChange={e => setFilters(p => ({ ...p, customerId: e.target.value }))}>
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.shopName}</option>)}
              </select>
            </div>
          )}

          {activeTab === 'vendor' && (
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Target Vendor</label>
              <select className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white outline-none transition-all" value={filters.vendorId} onChange={e => setFilters(p => ({ ...p, vendorId: e.target.value }))}>
                <option value="">Select Vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}

          <button onClick={() => loadReport(activeTab)} disabled={loading} className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
            Generate
          </button>
        </div>
      </div>

      <div className="animate-fade-in print:p-8">
        {!report ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-3xl text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
              <FileText size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1 tracking-tight">Ready to Analyze</h3>
            <p className="text-sm text-slate-400 font-medium max-w-xs">Select a report type and the required filters above to generate your document.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Report Header (Print Ready) */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b-2 border-slate-900 print:mb-10">
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-600 leading-none">Jahania Poultry Service</div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">{REPORT_TABS.find(t => t.id === report.kind)?.label}</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                    <Calendar size={14} /> {report.kind === 'pnl' ? new Date(report.data.date).toLocaleDateString('en-PK') : report.periodLabel}
                  </div>
                </div>
              </div>
              {report.kind === 'statement' && (
                <div className="text-right">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{report.subjectLabel} Account</div>
                  <div className="text-lg font-black text-slate-900 leading-none">{report.subjectName}</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight mt-1">{report.contact}</div>
                </div>
              )}
            </div>

            {/* Metrics Grid */}
            <div className={`grid grid-cols-2 lg:grid-cols-4 gap-6 ${
              report.kind === 'pnl'
                ? 'xl:grid-cols-3 print:grid-cols-3'
                : report.kind === 'cash'
                  ? 'print:grid-cols-3'
                  : 'print:grid-cols-2'
            }`}>
              {report.kind === 'pnl' && (
                <>
                  <MetricCard label="Daily Profit / Loss" value={formatCurrency(report.data.dailyProfit)} color={report.data.dailyProfit >= 0 ? 'emerald' : 'red'} sub={report.data.dailyProfit >= 0 ? 'Profit after expenses' : 'Loss after expenses'} />
                  <MetricCard label="Gross Profit" value={formatCurrency(report.data.grossProfit)} color="emerald" sub="Sales less purchases" />
                  <MetricCard label="Daily Purchases" value={formatCurrency(report.data.purchaseAmt)} color="amber" sub={`${formatWeight(report.data.purchaseWt)} purchased`} />
                  <MetricCard label="Daily Supply" value={formatCurrency(report.data.salesAmt)} color="blue" sub={`${formatWeight(report.data.soldWt)} dispatched`} />
                  <MetricCard label="Operating Costs" value={formatCurrency(report.data.totalExpenses)} color="red" sub="Recorded expenses" />
                  <MetricCard label="Net Weight Balance" value={formatWeight(report.data.remainShort)} color="amber" sub="Purchases minus supply" />
                </>
              )}
              {report.kind === 'statement' && (
                <>
                  <MetricCard label="Total Transactions" value={String(report.rows.length)} color="blue" sub="In the given period" />
                  <MetricCard label="Closing Balance" value={formatCurrency(report.endingBalance)} color={report.endingBalance > 0 ? 'red' : 'emerald'} sub="Current outstanding" />
                </>
              )}
              {report.kind === 'cash' && (
                <>
                  <MetricCard label="Cash Receipts" value={formatCurrency(report.totalReceipts)} color="emerald" sub="Total inflow" />
                  <MetricCard label="Cash Payments" value={formatCurrency(report.totalPayments)} color="red" sub="Total outflow" />
                  <MetricCard label="Hand Balance" value={formatCurrency(report.endingBalance)} color="blue" sub="Closing vault" />
                </>
              )}
              {report.kind === 'expense' && (
                <>
                  <MetricCard label="Expense Summary" value={formatCurrency(report.grandTotal)} color="red" sub="Total spending" />
                  <MetricCard label="Budget Centers" value={String(report.rows.length)} color="blue" sub="Unique categories" />
                </>
              )}
              {report.kind === 'recovery' && (
                <>
                  <MetricCard label="Total Recovered" value={formatCurrency(report.total)} color="emerald" sub="Collection sum" />
                  <MetricCard label="Total Invoices" value={String(report.rows.length)} color="blue" sub="Payments received" />
                </>
              )}
            </div>

            {/* Secondary Intel (PnL only) */}
            {report.kind === 'pnl' && (
              <div className="space-y-8">
                <div className={`flex items-center justify-between gap-4 rounded-3xl border p-6 ${report.data.dailyProfit >= 0 ? 'border-emerald-200 bg-emerald-50/60' : 'border-red-200 bg-red-50/60'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${report.data.dailyProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {report.data.dailyProfit >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                    </div>
                    <div>
                      <div className={`text-[10px] font-black uppercase tracking-widest ${report.data.dailyProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>Daily result</div>
                      <div className="text-sm font-bold text-slate-600">{report.data.dailyProfit >= 0 ? 'The business finished this day in profit.' : 'The business finished this day at a loss.'}</div>
                    </div>
                  </div>
                  <div className={`text-2xl font-black tracking-tight ${report.data.dailyProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(report.data.dailyProfit)}</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-8">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center text-emerald-600"><Package size={14} /></div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Acquisition Profile</h4>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-500">Weight Purchased</span>
                      <span className="text-sm font-black text-slate-900">{formatWeight(report.data.purchaseWt)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-500">Capital Outlay</span>
                      <span className="text-sm font-black text-slate-900">{formatCurrency(report.data.purchaseAmt)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-500">Supply Sources</span>
                      <span className="text-sm font-black text-slate-900">{report.data.purchaseCount} Lots</span>
                    </div>
                  </div>
                </div>
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded bg-emerald-100 flex items-center justify-center text-emerald-600"><TrendingUp size={14} /></div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sales Profile</h4>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-500">Weight Dispatched</span>
                      <span className="text-sm font-black text-slate-900">{formatWeight(report.data.soldWt)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-500">Gross Revenue</span>
                      <span className="text-sm font-black text-slate-900">{formatCurrency(report.data.salesAmt)}</span>
                    </div>
                    <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-500">Dispatch Units</span>
                      <span className="text-sm font-black text-slate-900">{report.data.invoiceCount} Invoices</span>
                    </div>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* Main Table */}
            <div className="bg-white rounded-3xl overflow-hidden border border-slate-200">
              {report.kind === 'statement' && <DataTable columns={statementColumns} data={report.rows} emptyMessage="No transactions found." />}
              {report.kind === 'cash' && <DataTable columns={cashColumns} data={report.rows} emptyMessage="Empty vault ledger." />}
              {report.kind === 'expense' && <DataTable columns={expenseColumns} data={report.rows} emptyMessage="No overheads recorded." />}
              {report.kind === 'recovery' && <DataTable columns={recoveryColumns} data={report.rows} emptyMessage="No collections tracked." />}
            </div>

            {report.kind === 'expense' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Driver Expense Records</h3>
                  <p className="text-xs font-medium text-slate-400">Transport charges generated from sales invoices and purchase records.</p>
                </div>
                <div className="bg-white rounded-3xl overflow-hidden border border-slate-200">
                  <DataTable columns={driverExpenseColumns} data={report.driverRecords ?? []} emptyMessage="No driver charges recorded." />
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 pt-5 text-center text-[10px] font-bold tracking-wide text-slate-400">
              Powered by Voicepls • AI &amp; Software Development Company • <a href={VOICEPLS_URL} className="text-emerald-600 underline underline-offset-2">voicepls.com</a>
            </div>

            {/* Print Footer / Signature Block */}
            <div className="hidden print:block mt-16 pt-8 border-t border-slate-200">
              <div className="flex justify-between items-end text-[10px] font-black uppercase tracking-wider text-slate-400 px-4">
                <div className="text-center">
                  <div className="w-48 border-b border-slate-300 pb-1 mb-2"></div>
                  <div>Prepared By</div>
                </div>
                <div className="text-center text-[8px] text-slate-400 normal-case italic mb-0.5">
                  System Generated Report — {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
                <div className="text-center">
                  <div className="w-48 border-b border-slate-300 pb-1 mb-2"></div>
                  <div>Authorized Signatory</div>
                </div>
              </div>
              <div className="mt-6 text-center text-[9px] font-bold tracking-wide text-slate-400">{VOICEPLS_FOOTER}</div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
