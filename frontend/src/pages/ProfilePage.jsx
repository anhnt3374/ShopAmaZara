import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AccountSideNav from '../components/AccountSideNav.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { listAddresses } from '../services/addresses.js';
import { listOrders } from '../services/orders.js';
import { updateMe } from '../services/profile.js';

const DEFAULT_AVATAR =
  'https://ui-avatars.com/api/?background=1e40af&color=fff&size=256&name=Account';

export default function ProfilePage() {
  const { user, refreshUser, setUser } = useAuth();
  const toast = useToast();
  const [orderCount, setOrderCount] = useState(null);
  const [addressCount, setAddressCount] = useState(null);
  const [form, setForm] = useState(() => ({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    avatarUrl: user?.avatarUrl ?? '',
    biography: user?.biography ?? '',
    preferredLanguage: user?.preferredLanguage ?? 'en',
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    refreshUser();
    listOrders().then((r) => setOrderCount(r.items.length)).catch(() => null);
    listAddresses().then((r) => setAddressCount(r.items.length)).catch(() => null);
  }, [refreshUser]);

  useEffect(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName ?? '',
      phone: user.phone ?? '',
      avatarUrl: user.avatarUrl ?? '',
      biography: user.biography ?? '',
      preferredLanguage: user.preferredLanguage ?? 'en',
    });
  }, [user]);

  if (!user) return <div className="container-max py-8">Loading…</div>;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const next = await updateMe({
        fullName: form.fullName,
        phone: form.phone || null,
        avatarUrl: form.avatarUrl || null,
        biography: form.biography || null,
      });
      setUser(next);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err?.message ?? 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <section className="bg-surface border border-outline-variant rounded-xl p-8 flex flex-col md:flex-row items-center gap-8">
          <div className="relative">
            <img
              src={form.avatarUrl || DEFAULT_AVATAR}
              alt={user.fullName}
              className="w-32 h-32 rounded-full object-cover border-4 border-surface-container shadow"
            />
          </div>
          <div className="text-center md:text-left flex-1">
            <h1 className="text-headline-lg text-on-surface mb-1">{user.fullName}</h1>
            <p className="text-body-md text-on-surface-variant mb-4">{user.email}</p>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              <span className="px-3 py-1 bg-primary-fixed text-on-primary-fixed rounded-full text-label-md">
                {user.role === 'seller' ? 'Pro Member' : 'Member'}
              </span>
              <span className="px-3 py-1 bg-secondary-fixed text-on-secondary-fixed rounded-full text-label-md">
                Verified Account
              </span>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BentoCard
            to="/orders"
            icon="shopping_bag"
            title="My Orders"
            subtitle="Track, return, or buy things again."
            cta={orderCount === null ? 'View history' : `View history (${orderCount})`}
          />
          <BentoCard
            to="/account/addresses"
            icon="location_on"
            title="Addresses"
            subtitle="Edit addresses for orders and gifts."
            cta={addressCount === null ? 'Manage saved' : `Manage ${addressCount} saved`}
          />
        </section>

        <form onSubmit={save} className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          <div className="px-8 py-6 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
            <div>
              <h2 className="text-headline-md text-on-surface">Personal Information</h2>
              <p className="text-body-sm text-on-surface-variant">Update your account details and contact info.</p>
            </div>
            <button type="submit" disabled={saving} className="btn-primary px-6 py-2 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field label="Full Name">
              <input className="field px-4 py-2" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required maxLength={255} />
            </Field>
            <Field label="Email Address">
              <input className="field px-4 py-2 opacity-60" value={user.email} disabled />
            </Field>
            <Field label="Phone Number">
              <input className="field px-4 py-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={32} />
            </Field>
            <Field label="Preferred Language">
              <select className="field px-4 py-2" value={form.preferredLanguage} disabled>
                <option value="en">English (US)</option>
              </select>
            </Field>
            <Field label="Avatar URL" wide>
              <input className="field px-4 py-2" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://…" maxLength={512} />
            </Field>
            <Field label="Biography (Optional)" wide>
              <textarea
                className="field px-4 py-2 min-h-[96px]"
                value={form.biography}
                onChange={(e) => setForm({ ...form, biography: e.target.value })}
                rows={4}
                maxLength={2000}
              />
            </Field>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({ label, wide, children }) {
  return (
    <div className={`space-y-1 ${wide ? 'md:col-span-2' : ''}`}>
      <label className="text-label-md text-on-surface-variant block">{label}</label>
      {children}
    </div>
  );
}

function BentoCard({ to, icon, title, subtitle, cta }) {
  return (
    <Link to={to} className="block bg-surface-container-low border border-outline-variant p-6 rounded-xl hover:-translate-y-0.5 hover:shadow-md transition-all">
      <Icon name={icon} size={28} className="text-primary mb-3" />
      <h3 className="text-headline-md text-on-surface mb-1">{title}</h3>
      <p className="text-body-sm text-on-surface-variant">{subtitle}</p>
      <div className="mt-6 inline-flex items-center text-primary text-label-md">
        {cta}
        <Icon name="arrow_forward" size={16} className="ml-1" />
      </div>
    </Link>
  );
}
