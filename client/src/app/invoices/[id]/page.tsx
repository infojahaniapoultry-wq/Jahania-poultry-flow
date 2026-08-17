'use client';
import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Ban, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { VOICEPLS_URL } from '@/lib/branding';

interface InvoiceItem {
  id: number;
  netWeight: string;
  ratePerKg: string;
  amount: string;
}

interface Invoice {
  id: number;
  invoiceNo: string;
  date: string;
  customer: { shopName: string; contact?: string; address?: string };
  driver?: { name: string; contact?: string; vehicleType?: string; defaultCharge?: string };
  driverCharge?: string;
  route?: { name: string } | null;
  previousBalance: string;
  totalAmount: string;
  totalBalance: string;
  paymentMode?: string;
  paymentStatus?: string;
  paymentReference?: string | null;
  paymentProvider?: string | null;
  isVoided?: boolean;
  voidReason?: string | null;
  voidedAt?: string | null;
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
  settledAmount?: string | number;
  notes?: string;
  items: InvoiceItem[];
}

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');

export default function InvoiceDetailPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    api
      .get(`/invoices/${id}`)
      .then((r) => setInvoice(r.data))
      .catch(() => toast.error('Invoice not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div style={{ textAlign: 'center', paddingTop: '3rem', color: 'var(--text-muted)' }}>Loading...</div>
      </AppLayout>
    );
  }

  if (!invoice) {
    return (
      <AppLayout>
        <div style={{ textAlign: 'center', paddingTop: '3rem', color: 'var(--text-muted)' }}>Invoice not found</div>
      </AppLayout>
    );
  }

  const handleVoid = async () => {
    if (!invoice) return;
    setVoiding(true);
    try {
      const res = await api.patch(`/invoices/${invoice.id}/void`, {
        reason: voidReason.trim() || undefined,
      });
      setInvoice(res.data);
      toast.success('Invoice voided');
      setVoidOpen(false);
      setVoidReason('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to void invoice');
    } finally {
      setVoiding(false);
    }
  };

  const driverCharge = Number(invoice.driverCharge ?? invoice.driver?.defaultCharge ?? 0);
  const paymentLabel = invoice.paymentMode ?? 'CASH';
  const paymentStatus = invoice.paymentStatus ?? 'COMPLETED';
  const paymentReference = invoice.paymentReference || invoice.chequeLog?.chequeNo || invoice.onlinePaymentLog?.referenceNo || '-';
  const settledAmount = Number(invoice.settledAmount ?? 0);
  const remainingBalance = Math.max(Number(invoice.totalBalance ?? 0) - settledAmount, 0);
  const paymentBadgeClass =
    paymentStatus === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : paymentStatus === 'OUTSTANDING'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : paymentStatus === 'BOUNCED'
          ? 'bg-red-50 text-red-700 border-red-100'
          : 'bg-slate-50 text-slate-600 border-slate-200';
  const itemRows = invoice.items.map((row, index) => ({ ...row, index: index + 1 }));

  const itemColumns = [
    { key: 'index', label: '#' },
    { key: 'netWeight', label: 'Chicken Kg', align: 'right' as const, render: (row: (typeof itemRows)[number]) => Number(row.netWeight).toFixed(2) },
    { key: 'ratePerKg', label: 'Rate/kg', align: 'right' as const, render: (row: (typeof itemRows)[number]) => fmt(row.ratePerKg) },
    { key: 'amount', label: 'Amount', align: 'right' as const, render: (row: (typeof itemRows)[number]) => <strong>{fmt(row.amount)}</strong> },
  ];

  return (
    <AppLayout>
      <div className="invoice-print-shell mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="no-print rounded-[28px] border border-slate-200 bg-white/95 shadow-sm backdrop-blur px-5 sm:px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <Link href="/invoices" className="btn btn-ghost btn-sm shrink-0">
                <ArrowLeft size={15} /> Back
              </Link>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">{invoice.invoiceNo}</h1>
                  {invoice.isVoided && (
                    <span className="inline-flex items-center rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-700">
                      Voided
                    </span>
                  )}
                </div>
                <p className="text-sm sm:text-base text-slate-500 font-medium tracking-tight">
                  {new Date(invoice.date).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn btn-ghost bg-white border-slate-200 text-slate-700 shadow-sm"
                onClick={() => window.print()}
              >
                <Printer size={15} /> Print
              </button>
              {user?.role === 'ADMIN' && !invoice.isVoided && (
                <button className="btn btn-danger" onClick={() => setVoidOpen(true)}>
                  <Ban size={15} /> Void Invoice
                </button>
              )}
            </div>
          </div>
        </div>

        {invoice.isVoided && (
          <div className="rounded-2xl border border-red-100 bg-red-50/80 px-5 py-4 text-red-700 shadow-sm">
            <div className="text-sm font-black uppercase tracking-[0.2em]">Voided Invoice</div>
            <div className="mt-1 text-sm text-red-700/90">
              {invoice.voidReason || 'This invoice was voided.'}
              {invoice.voidedAt ? ` Voided on ${new Date(invoice.voidedAt).toLocaleDateString('en-PK')}.` : ''}
            </div>
          </div>
        )}

        <div className="no-print invoice-print-layout grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] items-start">
          <section className="invoice-print-main card overflow-hidden shadow-lg shadow-slate-900/5">
            <div className="invoice-print-header bg-[linear-gradient(135deg,#0f172a_0%,#0f766e_60%,#10b981_100%)] px-6 sm:px-8 py-6 text-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.35em] text-white/70">PoultryFlow</div>
                  <div className="mt-1 text-2xl font-black tracking-tight">Jahania Poultry Management Service</div>
                  <div className="mt-2 text-sm text-white/75 max-w-2xl">
                    Sales invoice summary, payment reference, and itemized billing in one printable record.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">Invoice</div>
                  <div className="text-2xl font-black tracking-tight">{invoice.invoiceNo}</div>
                  <div className="mt-1 text-sm text-white/80">{new Date(invoice.date).toLocaleDateString('en-PK')}</div>
                </div>
              </div>
            </div>

            <div className="invoice-print-content p-5 sm:p-8 space-y-6">
              <div className="invoice-print-summary-grid grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Bill To</div>
                  <div className="mt-2 text-xl font-black text-slate-900">{invoice.customer.shopName}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {invoice.customer.contact && <div>{invoice.customer.contact}</div>}
                    {invoice.customer.address && <div>{invoice.customer.address}</div>}
                  </div>
                </div>

                <div className={`invoice-print-side-card rounded-2xl border p-5 ${paymentBadgeClass}`}>
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">Payment Status</div>
                  <div className="mt-2 text-xl font-black">{paymentLabel}</div>
                  <div className="mt-1 text-sm font-medium opacity-80">{paymentStatus}</div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-white/60 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Reference</div>
                      <div className="mt-1 font-bold text-slate-900">{paymentReference}</div>
                    </div>
                    <div className="rounded-xl bg-white/60 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Mode</div>
                      <div className="mt-1 font-bold text-slate-900">{invoice.paymentProvider || invoice.onlinePaymentLog?.provider || invoice.chequeLog?.bankName || 'Settlement'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="invoice-print-meta-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="invoice-print-meta-card rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600/70">Driver</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{invoice.driver?.name || 'N/A'}</div>
                  <div className="mt-1 text-sm text-slate-600">{invoice.driver?.vehicleType || 'No vehicle recorded'}</div>
                </div>
                <div className="invoice-print-meta-card rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-600/70">Customer</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{invoice.customer.shopName}</div>
                  <div className="mt-1 text-sm text-slate-600">{invoice.customer.contact || invoice.customer.address || 'Customer record'}</div>
                </div>
                <div className="invoice-print-meta-card rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-blue-600/70">Driver Charge</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{fmt(driverCharge)}</div>
                  <div className="mt-1 text-sm text-slate-600">Driver default / override</div>
                </div>
                <div className="invoice-print-meta-card rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Remaining</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{fmt(remainingBalance)}</div>
                  <div className="mt-1 text-sm text-slate-600">Paid: {fmt(settledAmount)}</div>
                </div>
              </div>

              <div className="invoice-print-table rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Line Items</div>
                    <div className="mt-1 text-lg font-black text-slate-900">Chicken Weight Breakdown</div>
                  </div>
                  <div className="text-sm text-slate-500">{itemRows.length} item{itemRows.length === 1 ? '' : 's'}</div>
                </div>
                <DataTable
                  columns={itemColumns}
                  data={itemRows}
                  emptyMessage="No invoice items found"
                  searchPlaceholder="Search invoice items"
                  defaultPageSize={5}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
                <div className="invoice-print-notes rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Notes</div>
                  <div className="mt-2 text-sm text-slate-700 leading-6">
                    {invoice.notes || 'No internal notes were added for this invoice.'}
                  </div>
                </div>

                <div className="invoice-print-totals-card rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Totals</div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span>Previous Balance</span>
                      <span>{fmt(invoice.previousBalance)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-emerald-700">
                      <span>Invoice Amount</span>
                      <span className="font-bold">{fmt(invoice.totalAmount)}</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex items-center justify-between text-base font-black text-amber-600">
                      <span>Total Balance</span>
                      <span>{fmt(invoice.totalBalance)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-slate-200 px-5 py-4 text-center text-[10px] font-bold tracking-wide text-slate-400 sm:px-8">
              Powered by Voicepls • AI &amp; Software Development Company • <a href={VOICEPLS_URL} className="text-emerald-600 underline underline-offset-2">voicepls.com</a>
            </div>
          </section>

          <aside className="invoice-print-aside no-print xl:sticky xl:top-24 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Invoice Snapshot</div>
              <div className="mt-2 text-xl font-black text-slate-900">{invoice.invoiceNo}</div>
              <div className="mt-1 text-sm text-slate-500">
                {new Date(invoice.date).toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Customer</div>
                  <div className="mt-1 font-bold text-slate-900">{invoice.customer.shopName}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Payment</div>
                  <div className="mt-1 font-bold text-slate-900">{paymentLabel}</div>
                  <div className="mt-1 text-sm text-slate-500">{paymentStatus}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Driver</div>
                  <div className="mt-1 font-bold text-slate-900">{invoice.driver?.name || 'N/A'}</div>
                  <div className="mt-1 text-sm text-slate-500">{invoice.driver?.vehicleType || 'No vehicle recorded'}</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-600/70">Financial Summary</div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Settled Amount</span>
                  <span className="font-bold text-slate-900">{fmt(settledAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Outstanding</span>
                  <span className="font-bold text-slate-900">{fmt(remainingBalance)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Driver Charge</span>
                  <span className="font-bold text-slate-900">{fmt(driverCharge)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="hidden print:block">
          <div className="mx-auto max-w-[190mm] bg-white text-slate-900 text-xs p-2">
            {/* Invoice Header */}
            <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-6">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-600 mb-1">PoultryFlow</div>
                <h1 className="text-xl font-extrabold uppercase tracking-tight text-slate-900">Jahania Poultry Service</h1>
                <p className="text-[10px] text-slate-500 mt-1">
                  Plot #12, Grain Market, Jahania, Punjab | Contact: +92 300 1234567 | info@jahania-poultry.com
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-black uppercase tracking-wider text-slate-800">Invoice</h2>
                <div className="mt-1 text-sm font-bold text-emerald-600">{invoice.invoiceNo}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Date: {new Date(invoice.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Bill To & Payment Info */}
            <div className="grid grid-cols-[1.3fr_0.9fr] gap-6 mb-6">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Bill To</h3>
                <div className="text-sm font-black text-slate-900">{invoice.customer.shopName}</div>
                <div className="mt-2 space-y-1 text-slate-600">
                  {invoice.customer.contact && <div>Phone: {invoice.customer.contact}</div>}
                  {invoice.customer.address && <div>Address: {invoice.customer.address}</div>}
                </div>
              </div>

              <div className={`rounded-xl border p-4 ${paymentBadgeClass}`}>
                <h3 className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-2">Payment Details</h3>
                <div className="flex justify-between items-center mb-1">
                  <span className="opacity-80">Mode:</span>
                  <span className="font-bold">{paymentLabel}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="opacity-80">Status:</span>
                  <span className="font-extrabold uppercase tracking-wider text-[10px]">{paymentStatus}</span>
                </div>
                <div className="border-t border-slate-200/50 pt-2 grid grid-cols-2 gap-2 text-[10px]">
                  <div>
                    <div className="opacity-60 uppercase font-bold text-[8px]">Reference</div>
                    <div className="font-bold truncate">{paymentReference}</div>
                  </div>
                  <div>
                    <div className="opacity-60 uppercase font-bold text-[8px]">Provider</div>
                    <div className="font-bold truncate">{invoice.paymentProvider || invoice.onlinePaymentLog?.provider || invoice.chequeLog?.bankName || 'Settlement'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Logistics/Metadata grid */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Driver</div>
                <div className="text-xs font-bold text-slate-900">{invoice.driver?.name || 'N/A'}</div>
                <div className="text-[10px] text-slate-500">{invoice.driver?.vehicleType || 'No vehicle'}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Logistics Route</div>
                <div className="text-xs font-bold text-slate-900">{invoice.route?.name || 'Direct Delivery'}</div>
                <div className="text-[10px] text-slate-500">Route logistics</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Driver Cost</div>
                <div className="text-xs font-bold text-slate-900">{fmt(driverCharge)}</div>
                <div className="text-[10px] text-slate-500">Delivery charges</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Settle Amt</div>
                <div className="text-xs font-bold text-slate-900">{fmt(settledAmount)}</div>
                <div className="text-[10px] text-slate-500">Paid amount</div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden mb-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white text-[9px] uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-black">#</th>
                    <th className="py-2.5 px-4 font-black">Description</th>
                    <th className="py-2.5 px-4 font-black text-right">Net Weight</th>
                    <th className="py-2.5 px-4 font-black text-right">Rate / Kg</th>
                    <th className="py-2.5 px-4 font-black text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {itemRows.map((row) => (
                    <tr key={row.index} className="border-b border-slate-200 hover:bg-slate-50/50 text-xs">
                      <td className="py-3 px-4 font-bold text-slate-400">{row.index}</td>
                      <td className="py-3 px-4 font-medium text-slate-700">Broiler Chicken (Sales)</td>
                      <td className="py-3 px-4 text-right text-slate-700 font-bold">{Number(row.netWeight).toFixed(2)} kg</td>
                      <td className="py-3 px-4 text-right text-slate-700">{fmt(row.ratePerKg)}</td>
                      <td className="py-3 px-4 text-right font-black text-slate-900">{fmt(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Notes & Financial Summary */}
            <div className="grid grid-cols-[1fr_320px] gap-6 mb-8">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Remarks / Special Instructions</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  {invoice.notes || 'No internal notes were added for this invoice.'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200">
                  <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Financial Summary</h3>
                </div>
                <div className="p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Previous Outstanding:</span>
                    <span className="font-medium">{fmt(invoice.previousBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Current Bill Amount:</span>
                    <span className="font-bold text-slate-800">{fmt(invoice.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Paid / Settled:</span>
                    <span className="font-bold text-emerald-600">-{fmt(settledAmount)}</span>
                  </div>
                  <div className="h-px bg-slate-200 my-1" />
                  <div className="flex justify-between items-center bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-black">
                    <span>Total Outstanding:</span>
                    <span>{fmt(remainingBalance)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signature Block */}
            <div className="mt-12 flex justify-between items-end text-[10px] font-black uppercase tracking-wider text-slate-400 px-4">
              <div className="text-center">
                <div className="w-48 border-b border-slate-300 pb-1 mb-2"></div>
                <div>Customer Signature</div>
              </div>
              <div className="text-center text-[8px] text-slate-400 normal-case italic">
                Thank you for choosing Jahania Poultry Service
              </div>
              <div className="text-center">
                <div className="w-48 border-b border-slate-300 pb-1 mb-2"></div>
                <div>Authorized Signatory</div>
              </div>
            </div>
            <div className="mt-6 border-t border-slate-200 pt-3 text-center text-[9px] font-bold tracking-wide text-slate-400">
              Powered by Voicepls • AI &amp; Software Development Company • <a href={VOICEPLS_URL} className="text-emerald-600 underline underline-offset-2">voicepls.com</a>
            </div>
          </div>
        </div>

      </div>

      <Modal
        open={voidOpen}
        onClose={() => {
          if (voiding) return;
          setVoidOpen(false);
          setVoidReason('');
        }}
        title="Void Invoice"
        size="md"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setVoidOpen(false)} disabled={voiding}>
              Cancel
            </button>
            <button className="btn btn-amber" onClick={handleVoid} disabled={voiding}>
              {voiding ? 'Voiding...' : 'Void Invoice'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Voiding will reverse the invoice ledger and stock effects while keeping the record for audit.
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Reason</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-amber-500"
              rows={4}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Optional reason"
            />
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
