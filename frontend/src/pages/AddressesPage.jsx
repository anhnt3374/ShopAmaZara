import { useEffect, useState } from 'react';
import AccountSideNav from '../components/AccountSideNav.jsx';
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

  const submit = async (data) => {
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
  };

  const remove = async (id) => {
    if (!confirm('Delete this address?')) return;
    try {
      await deleteAddress(id);
      toast.info('Address deleted');
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Delete failed');
    }
  };

  const setDefault = async (id) => {
    try {
      await updateAddress(id, { isDefault: true });
      await reload();
    } catch (err) {
      toast.error(err?.message ?? 'Could not set default');
    }
  };

  const current =
    editing && editing !== 'new' ? items.find((a) => a.id === editing) : null;

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
          <button
            onClick={() => setEditing('new')}
            className="btn-primary px-4 py-2 inline-flex items-center gap-2"
          >
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

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.length === 0 && !editing && (
            <div className="md:col-span-2 bg-surface-container-low border border-outline-variant rounded-xl p-8 text-center text-on-surface-variant">
              No saved addresses yet.
            </div>
          )}
          {items.map((a) => (
            <article
              key={a.id}
              className={`bg-surface rounded-xl p-5 border ${
                a.isDefault ? 'border-primary' : 'border-outline-variant'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-label-md uppercase tracking-wider text-on-surface-variant">
                  {a.label}
                </span>
                {a.isDefault && (
                  <span className="text-label-md px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed">
                    Default
                  </span>
                )}
              </div>
              <p className="font-semibold text-on-surface">{a.recipientName}</p>
              <p className="text-body-sm text-on-surface-variant leading-relaxed mt-2">
                {a.line1}
                {a.line2 ? <><br />{a.line2}</> : null}
                <br />
                {a.city}, {a.region} {a.postalCode}
                <br />
                {a.country}
              </p>
              <p className="text-body-sm text-on-surface-variant mt-2">{a.phone}</p>
              <div className="mt-4 flex flex-wrap gap-3 text-label-md">
                <button onClick={() => setEditing(a.id)} className="text-primary hover:underline">
                  Edit
                </button>
                {!a.isDefault && (
                  <button onClick={() => setDefault(a.id)} className="text-primary hover:underline">
                    Set as default
                  </button>
                )}
                <button onClick={() => remove(a.id)} className="text-error hover:underline">
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
