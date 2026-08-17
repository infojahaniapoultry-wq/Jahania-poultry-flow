'use client';
import { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import DataTable from '@/components/DataTable';
import Modal from '@/components/Modal';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import { Trash2, Shield, User, Mail, Lock, UserPlus, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getCachedPageData, setCachedPageData } from '@/lib/page-cache';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'DATA_ENTRY';
  isActive: boolean;
  createdAt: string;
}

const emptyForm = { name: '', email: '', password: '', role: 'DATA_ENTRY' as 'ADMIN' | 'DATA_ENTRY' };
const CACHE_KEY = 'users-page';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedPageData<UserRow[]>(CACHE_KEY);
      if (cached) {
        setUsers(cached);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
      setCachedPageData(CACHE_KEY, res.data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      toast.error('Please fill all required fields');
      return;
    }
    setSaving(true);
    try {
      await api.post('/users', form);
      toast.success('User access granted');
      setOpen(false);
      setForm(emptyForm);
      load(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async (id: number) => {
    if (!confirm('Are you sure you want to disable this user? They will lose all access immediately.')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('User access revoked');
      load(true);
    } catch {
      toast.error('Failed to disable user');
    }
  };

  const columns = [
    { 
      key: 'name', 
      label: 'Identity', 
      render: (row: UserRow) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-xs uppercase ${row.role === 'ADMIN' ? 'bg-amber-500 shadow-sm shadow-amber-200' : 'bg-emerald-500 shadow-sm shadow-emerald-200'}`}>
            {row.name.charAt(0)}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-900 leading-tight">{row.name}</span>
            <span className="text-[10px] font-medium text-slate-400">{row.email}</span>
          </div>
        </div>
      ) 
    },
    { 
      key: 'role', 
      label: 'Privileges', 
      render: (row: UserRow) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
          row.role === 'ADMIN' 
            ? 'bg-amber-50 text-amber-700 border-amber-100' 
            : 'bg-blue-50 text-blue-700 border-blue-100'
        }`}>
          <Shield size={10} />
          {row.role === 'ADMIN' ? 'Administrator' : 'Data Entry'}
        </span>
      ) 
    },
    { 
      key: 'isActive', 
      label: 'Status', 
      render: (row: UserRow) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
          row.isActive 
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
            : 'bg-slate-50 text-slate-500 border-slate-100'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${row.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {row.isActive ? 'Active Access' : 'Suspended'}
        </span>
      ) 
    },
    {
      key: 'actions',
      label: '',
      align: 'right' as const,
      render: (row: UserRow) => (
        <button 
          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-0" 
          onClick={() => handleDisable(row.id)} 
          disabled={!row.isActive}
          title="Disable Access"
        >
          <Trash2 size={16} />
        </button>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">User Directory</h1>
          <p className="text-slate-500 font-medium tracking-tight">Manage administrative access and system data-entry permissions.</p>
        </div>
        <button 
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-200 transition-all active:scale-95 self-start"
          onClick={() => setOpen(true)}
        >
          <UserPlus size={18} /> Provision User
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm animate-fade-in">
        <DataTable columns={columns} data={users} loading={loading} emptyMessage="No system users found." />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Provision New System Access"
        size="md"
        footer={(
          <>
            <button className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors" onClick={() => setOpen(false)}>Cancel</button>
            <button 
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 flex items-center gap-2" 
              onClick={handleCreate} 
              disabled={saving}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Grant Access
            </button>
          </>
        )}
      >
        <div className="space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl flex gap-3 text-blue-700">
            <AlertCircle size={20} className="shrink-0" />
            <p className="text-xs font-bold leading-relaxed italic">
              Granting access will allow the user to modify business records based on their assigned role. Admins have full control over financial reports and system configuration.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Identity *</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><User size={16} /></div>
                <input 
                  className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
                  value={form.name} 
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} 
                  placeholder="Employee Full Name"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">System Email / ID *</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Mail size={16} /></div>
                <input 
                  type="email" 
                  className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
                  value={form.email} 
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} 
                  placeholder="user@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">Secure Password *</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Lock size={16} /></div>
                <input 
                  type="password" 
                  className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
                  value={form.password} 
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} 
                  placeholder="Minimum 8 characters"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 ml-1">System Privilege Level *</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Shield size={16} /></div>
                <select 
                  className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-black focus:bg-white focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all" 
                  value={form.role} 
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'ADMIN' | 'DATA_ENTRY' }))}
                >
                  <option value="DATA_ENTRY">DATA ENTRY OPERATOR</option>
                  <option value="ADMIN">ADMINISTRATOR</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
