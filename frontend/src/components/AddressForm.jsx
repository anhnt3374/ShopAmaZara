import { useState } from 'react';

const empty = {
  label: '', recipientName: '', phone: '', line1: '', line2: '',
  city: '', region: '', postalCode: '', country: '', isDefault: false,
};

export default function AddressForm({ initial, onSubmit, onCancel, submitting }) {
  const [v, setV] = useState({ ...empty, ...(initial ?? {}) });
  const set = (k) => (e) => setV((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ ...v, line2: v.line2 || null });
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Label (e.g. Home)">
        <input className="field px-4 py-2" value={v.label} onChange={set('label')} required maxLength={64} />
      </Field>
      <Field label="Recipient name">
        <input className="field px-4 py-2" value={v.recipientName} onChange={set('recipientName')} required maxLength={255} />
      </Field>
      <Field label="Phone">
        <input className="field px-4 py-2" value={v.phone} onChange={set('phone')} required maxLength={32} />
      </Field>
      <Field label="Country">
        <input className="field px-4 py-2" value={v.country} onChange={set('country')} required maxLength={128} />
      </Field>
      <Field label="Address line 1" wide>
        <input className="field px-4 py-2" value={v.line1} onChange={set('line1')} required maxLength={255} />
      </Field>
      <Field label="Address line 2 (optional)" wide>
        <input className="field px-4 py-2" value={v.line2} onChange={set('line2')} maxLength={255} />
      </Field>
      <Field label="City">
        <input className="field px-4 py-2" value={v.city} onChange={set('city')} required maxLength={128} />
      </Field>
      <Field label="State / Region">
        <input className="field px-4 py-2" value={v.region} onChange={set('region')} required maxLength={128} />
      </Field>
      <Field label="Postal code">
        <input className="field px-4 py-2" value={v.postalCode} onChange={set('postalCode')} required maxLength={32} />
      </Field>
      <Field label="Default address">
        <label className="inline-flex items-center gap-2 mt-3">
          <input
            type="checkbox"
            checked={Boolean(v.isDefault)}
            onChange={(e) => setV((p) => ({ ...p, isDefault: e.target.checked }))}
          />
          <span className="text-body-sm">Set as default</span>
        </label>
      </Field>
      <div className="md:col-span-2 flex justify-end gap-3 mt-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-on-surface-variant">
            Cancel
          </button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary px-6 py-2 disabled:opacity-50">
          {submitting ? 'Saving…' : 'Save address'}
        </button>
      </div>
    </form>
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
