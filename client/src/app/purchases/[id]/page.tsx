'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Ban, Loader2, Printer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Purchase {
  id: number;
  purchaseNo: string;
  date: string;
  vendor?: { name?: string; contact?: string; address?: string } | null;
  driver?: { name: string; contact?: string; vehicleType?: string; defaultCharge?: string | number };
  driverCharge?: string | number;
  weightKg: string | number;
  ratePerKg: string | number;
  purchaseAmount: string | number;
  settledAmount?: string | number;
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
  notes?: string;
}

const fmt = (n: string | number) => 'Rs. ' + Number(n ?? 0).toLocaleString('en-PK');

export default function PurchaseDetailPage() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    api
      .get(`/purchases/${id}`)
      .then((r) => setPurchase(r.data))
      .catch(() => toast.error('Purchase not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div style={{ textAlign: 'center', paddingTop: '3rem', color: 'var(--text-muted)' }}>Loading...</div>
      </AppLayout>
    );
  }

  if (!purchase) {
    return (
      <AppLayout>
        <div style={{ textAlign: 'center', paddingTop: '3rem', color: 'var(--text-muted)' }}>Purchase not found</div>
      </AppLayout>
    );
  }

  const handleVoid = async () => {
    if (!purchase) return;
    setVoiding(true);
    try {
      const res = await api.patch(`/purchases/${purchase.id}/void`, {
        reason: voidReason.trim() || undefined,
      });
      setPurchase(res.data);
      toast.success('Purchase voided');
      setVoidOpen(false);
      setVoidReason('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to void purchase');
    } finally {
      setVoiding(false);
    }
  };

  const settledAmount = Number(purchase.settledAmount ?? 0);
  const purchaseAmount = Number(purchase.purchaseAmount ?? 0);
  const remainingBalance = purchaseAmount - settledAmount;
  const driverCharge = Number(purchase.driverCharge ?? purchase.driver?.defaultCharge ?? 0);
  const paymentLabel = purchase.paymentMode ?? 'CASH';
  const paymentStatus = purchase.paymentStatus ?? 'COMPLETED';
  const paymentReference =
    purchase.paymentReference ||
    purchase.chequeLog?.chequeNo ||
    purchase.onlinePaymentLog?.referenceNo ||
    '-';
  const vendorName = purchase.vendor?.name?.trim() || 'Vendor';
  const vendorContact = purchase.vendor?.contact?.trim();
  const vendorAddress = purchase.vendor?.address?.trim();
  const paymentBadgeClass =
    paymentStatus === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : paymentStatus === 'OUTSTANDING'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : paymentStatus === 'BOUNCED'
          ? 'bg-red-50 text-red-700 border-red-100'
          : 'bg-slate-50 text-slate-600 border-slate-200';

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
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">{purchase.purchaseNo}</h1>
                  {purchase.isVoided && (
                    <span className="inline-flex items-center rounded-full border border-red-100 bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-700">
                      Voided
                    </span>
                  )}
                </div>
                <p className="text-sm sm:text-base text-slate-500 font-medium tracking-tight">
                  {new Date(purchase.date).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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
              {user?.role === 'ADMIN' && !purchase.isVoided && (
                <button className="btn btn-danger" onClick={() => setVoidOpen(true)}>
                  <Ban size={15} /> Void Purchase
                </button>
              )}
            </div>
          </div>
        </div>

        {purchase.isVoided && (
          <div className="rounded-2xl border border-red-100 bg-red-50/80 px-5 py-4 text-red-700 shadow-sm">
            <div className="text-sm font-black uppercase tracking-[0.2em]">Voided Purchase</div>
            <div className="mt-1 text-sm text-red-700/90">
              {purchase.voidReason || 'This purchase was voided.'}
              {purchase.voidedAt ? ` Voided on ${new Date(purchase.voidedAt).toLocaleDateString('en-PK')}.` : ''}
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
                    Purchase record summary, vendor details, and settlement overview in one printable record.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm text-right">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-white/70">Purchase</div>
                  <div className="text-2xl font-black tracking-tight">{purchase.purchaseNo}</div>
                  <div className="mt-1 text-sm text-white/80">{new Date(purchase.date).toLocaleDateString('en-PK')}</div>
                </div>
              </div>
            </div>

            <div className="invoice-print-content p-5 sm:p-8 space-y-6">
              <div className="invoice-print-summary-grid grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Purchased From</div>
                  <div className="mt-2 text-xl font-black text-slate-900">{vendorName}</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    {vendorContact && <div>{vendorContact}</div>}
                    {vendorAddress && <div>{vendorAddress}</div>}
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
                      <div className="mt-1 font-bold text-slate-900">{purchase.paymentProvider || purchase.onlinePaymentLog?.provider || purchase.chequeLog?.bankName || 'Settlement'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="invoice-print-meta-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="invoice-print-meta-card rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-600/70">Driver</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{purchase.driver?.name || 'N/A'}</div>
                  <div className="mt-1 text-sm text-slate-600">{purchase.driver?.vehicleType || 'No vehicle recorded'}</div>
                </div>
                <div className="invoice-print-meta-card rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-600/70">Weight</div>
                  <div className="mt-2 text-lg font-black text-slate-900">{Number(purchase.weightKg ?? 0).toFixed(2)} kg</div>
                  <div className="mt-1 text-sm text-slate-600">Rate: {fmt(purchase.ratePerKg)}</div>
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

              <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
                <div className="invoice-print-notes rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Notes</div>
                  <div className="mt-2 text-sm text-slate-700 leading-6">
                    {purchase.notes || 'No internal notes were added for this purchase.'}
                  </div>
                </div>

                <div className="invoice-print-totals-card rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                  <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Totals</div>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <span>Purchase Amount</span>
                      <span>{fmt(purchaseAmount)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-emerald-700">
                      <span>Settled Amount</span>
                      <span className="font-bold">{fmt(settledAmount)}</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex items-center justify-between text-base font-black text-amber-600">
                      <span>Total Balance</span>
                      <span>{fmt(remainingBalance)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="invoice-print-aside no-print xl:sticky xl:top-24 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Purchase Snapshot</div>
              <div className="mt-2 text-xl font-black text-slate-900">{purchase.purchaseNo}</div>
              <div className="mt-1 text-sm text-slate-500">
                {new Date(purchase.date).toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vendor</div>
                  <div className="mt-1 font-bold text-slate-900">{vendorName}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Payment</div>
                  <div className="mt-1 font-bold text-slate-900">{paymentLabel}</div>
                  <div className="mt-1 text-sm text-slate-500">{paymentStatus}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Driver</div>
                  <div className="mt-1 font-bold text-slate-900">{purchase.driver?.name || 'N/A'}</div>
                  <div className="mt-1 text-sm text-slate-500">{purchase.driver?.vehicleType || 'No vehicle recorded'}</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-600/70">Financial Summary</div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Purchase Amount</span>
                  <span className="font-bold text-slate-900">{fmt(purchaseAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Settled Amount</span>
                  <span className="font-bold text-slate-900">{fmt(settledAmount)}</span>
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
            {/* Purchase Header */}
            <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-6">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.3em] text-emerald-600 mb-1">PoultryFlow</div>
                <h1 className="text-xl font-extrabold uppercase tracking-tight text-slate-900">Jahania Poultry Service</h1>
                <p className="text-[10px] text-slate-500 mt-1">
                  Plot #12, Grain Market, Jahania, Punjab | Contact: +92 300 1234567 | info@jahania-poultry.com
                </p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-black uppercase tracking-wider text-slate-800">Purchase Bill</h2>
                <div className="mt-1 text-sm font-bold text-emerald-600">{purchase.purchaseNo}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Date: {new Date(purchase.date).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Vendor & Payment Info */}
            <div className="grid grid-cols-[1.3fr_0.9fr] gap-6 mb-6">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Purchased From</h3>
                <div className="text-sm font-black text-slate-900">{vendorName}</div>
                <div className="mt-2 space-y-1 text-slate-600">
                  {vendorContact && <div>Phone: {vendorContact}</div>}
                  {vendorAddress && <div>Address: {vendorAddress}</div>}
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
                    <div className="opacity-60 uppercase font-bold text-[8px]">Bank/Provider</div>
                    <div className="font-bold truncate">{purchase.paymentProvider || purchase.onlinePaymentLog?.provider || purchase.chequeLog?.bankName || 'Settlement'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Logistics/Metadata grid */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Driver</div>
                <div className="text-xs font-bold text-slate-900">{purchase.driver?.name || 'N/A'}</div>
                <div className="text-[10px] text-slate-500">{purchase.driver?.vehicleType || 'No vehicle'}</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Lot Weight</div>
                <div className="text-xs font-bold text-slate-900">{Number(purchase.weightKg ?? 0).toFixed(2)} kg</div>
                <div className="text-[10px] text-slate-500">Gross purchase weight</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Rate / Kg</div>
                <div className="text-xs font-bold text-slate-900">{fmt(purchase.ratePerKg)}</div>
                <div className="text-[10px] text-slate-500">Unit rate</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Driver Charge</div>
                <div className="text-xs font-bold text-slate-900">{fmt(driverCharge)}</div>
                <div className="text-[10px] text-slate-500">Freight cost</div>
              </div>
            </div>

            {/* Purchase Itemization Table */}
            <div className="rounded-xl border border-slate-200 overflow-hidden mb-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800 text-white text-[9px] uppercase tracking-wider">
                    <th className="py-2.5 px-4 font-black">Item Description</th>
                    <th className="py-2.5 px-4 font-black text-right">Weight</th>
                    <th className="py-2.5 px-4 font-black text-right">Rate / Kg</th>
                    <th className="py-2.5 px-4 font-black text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200 hover:bg-slate-50/50 text-xs">
                    <td className="py-3 px-4 font-medium text-slate-700">Broiler Chicken Lot</td>
                    <td className="py-3 px-4 text-right text-slate-700 font-bold">{Number(purchase.weightKg ?? 0).toFixed(2)} kg</td>
                    <td className="py-3 px-4 text-right text-slate-700">{fmt(purchase.ratePerKg)}</td>
                    <td className="py-3 px-4 text-right font-black text-slate-900">{fmt(purchaseAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Notes & Financial Summary */}
            <div className="grid grid-cols-[1fr_320px] gap-6 mb-8">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Remarks / Special Instructions</h3>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  {purchase.notes || 'No internal notes were added for this purchase.'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200">
                  <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Financial Summary</h3>
                </div>
                <div className="p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Gross Purchase Amount:</span>
                    <span className="font-medium text-slate-800">{fmt(purchaseAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Freight (Driver Charge):</span>
                    <span className="font-medium text-slate-800">{fmt(driverCharge)}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-500">
                    <span>Settled / Paid:</span>
                    <span className="font-bold text-emerald-600">-{fmt(settledAmount)}</span>
                  </div>
                  <div className="h-px bg-slate-200 my-1" />
                  <div className="flex justify-between items-center bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-black">
                    <span>Outstanding Balance:</span>
                    <span>{fmt(remainingBalance)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Signature Block */}
            <div className="mt-12 flex justify-between items-end text-[10px] font-black uppercase tracking-wider text-slate-400 px-4">
              <div className="text-center">
                <div className="w-48 border-b border-slate-300 pb-1 mb-2"></div>
                <div>Supplier Signature</div>
              </div>
              <div className="text-center text-[8px] text-slate-400 normal-case italic">
                Thank you for choosing Jahania Poultry Service
              </div>
              <div className="text-center">
                <div className="w-48 border-b border-slate-300 pb-1 mb-2"></div>
                <div>Authorized Signatory</div>
              </div>
            </div>
          </div>
        </div>

        <Modal
          open={voidOpen}
          onClose={() => setVoidOpen(false)}
          title="Void Purchase"
          footer={(
            <>
              <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setVoidOpen(false)}>Cancel</button>
              <button
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-100 transition-all disabled:opacity-50 flex items-center gap-2"
                onClick={handleVoid}
                disabled={voiding}
              >
                {voiding ? <Loader2 size={16} className="animate-spin" /> : <Ban size={15} />}
                Void Purchase
              </button>
            </>
          )}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Voiding this purchase reverses its ledger impact and keeps the record for audit history.</p>
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Reason</label>
              <textarea
                className="w-full min-h-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition-all focus:border-red-500 focus:bg-white focus:ring-4 focus:ring-red-500/10"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Optional void reason"
              />
            </div>
          </div>
        </Modal>
      </div>
    </AppLayout>
  );
}
