import { useEffect, useState } from 'react';
import AccountSideNav from '../components/AccountSideNav.jsx';
import AddressCard from '../components/AddressCard.jsx';
import AddressForm from '../components/AddressForm.jsx';
import Icon from '../components/Icon.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from '../services/addresses.js';

export default function AddressesPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | <id>
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const res = await listAddresses();
    setItems(res.items);
  };

  useEffect(() => {
    reload().catch((e) => toast.error(e?.message ?? 'Could not load addresses'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(data) {
    setBusy(true);
    try {
      if (editing === 'new') {
        await createAddress(data);
        toast.success('Address added');
      } else {
        await updateAddress(editing, data);
        toast.success('Address updated');
      }
      setEditing(null);
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(a) {
    if (a.isDefault) {
      toast.error('Pick another default first');
      return;
    }
    if (!confirm('Delete this address?')) return;
    try {
      await deleteAddress(a.id);
      toast.info('Address deleted');
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Delete failed');
    }
  }

  async function setDefault(a) {
    try {
      await updateAddress(a.id, { isDefault: true });
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Could not set default');
    }
  }

  const current = editing && editing !== 'new' ? items.find((a) => a.id === editing) : null;

  return (
    <div className="container-max py-8 flex gap-gutter">
      <AccountSideNav />
      <main className="flex-1 space-y-gutter">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-headline-lg text-on-surface mb-1">Addresses</h1>
            <p className="text-body-md text-on-surface-variant">
              Saved addresses for checkout and shipping.
            </p>
          </div>
          <button onClick={() => setEditing('new')} className="btn-primary px-4 py-2 inline-flex items-center gap-2">
            <Icon name="add" size={18} /> Add address
          </button>
        </header>

        {editing && (
          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <h2 className="text-headline-md mb-4">
              {editing === 'new' ? 'New address' : 'Edit address'}
            </h2>
            <AddressForm
              initial={current ?? undefined}
              submitting={busy}
              onSubmit={submit}
              onCancel={() => setEditing(null)}
            />
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onEdit={() => setEditing(a.id)}
              onDelete={() => remove(a)}
              onSetDefault={() => setDefault(a)}
            />
          ))}
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="border-2 border-dashed border-outline-variant rounded-xl p-6 flex flex-col items-center justify-center gap-3 hover:border-primary hover:bg-primary/5 transition-all text-on-surface-variant hover:text-primary min-h-[220px]"
          >
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
              <Icon name="add" size={24} />
            </div>
            <p className="text-label-md">Add new address</p>
          </button>
        </section>
      </main>
    </div>
  );
}
