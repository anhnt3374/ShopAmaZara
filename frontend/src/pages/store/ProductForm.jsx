import { useEffect, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import ImageUploader from './ImageUploader.jsx';

const INITIAL = {
  name: '',
  brand: '',
  model: '',
  category: '',
  sku: '',
  price: '',
  salePrice: '',
  stock: '',
  trackInventory: true,
  isPublished: true,
  imageFirst: '',
  images: [],
  shortDescription: '',
  longDescription: '',
  tags: [],
};

export default function ProductForm({ initial, onSubmit, onDiscard, submitting }) {
  const [v, setV] = useState(() => ({ ...INITIAL, ...(initial ?? {}) }));
  const [dirty, setDirty] = useState(false);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    if (initial) setV({ ...INITIAL, ...initial });
  }, [initial]);

  function patch(p) {
    setV((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (v.tags.includes(t)) {
      setTagInput('');
      return;
    }
    patch({ tags: [...v.tags, t] });
    setTagInput('');
  }

  function removeTag(t) {
    patch({ tags: v.tags.filter((x) => x !== t) });
  }

  function handleDiscard() {
    if (dirty && !confirm('Discard your changes?')) return;
    onDiscard?.();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!v.name.trim() || !v.category.trim() || !v.images.length) return;
    const payload = {
      name: v.name.trim(),
      brand: v.brand.trim() || 'Unknown',
      category: v.category.trim(),
      sku: v.sku.trim() || undefined,
      model: v.model.trim() || undefined,
      price: Number(v.price),
      salePrice: v.salePrice === '' || v.salePrice == null ? undefined : Number(v.salePrice),
      stock: Number(v.stock || 0),
      trackInventory: Boolean(v.trackInventory),
      isPublished: Boolean(v.isPublished),
      imageFirst: v.images[0] ?? v.imageFirst,
      images: v.images,
      shortDescription: v.shortDescription.trim() || undefined,
      longDescription: v.longDescription.trim() || undefined,
      tags: v.tags.length ? v.tags : undefined,
    };
    onSubmit(payload);
  }

  const canSave =
    v.name.trim() &&
    v.category.trim() &&
    v.images.length > 0 &&
    Number(v.price) >= 0 &&
    Number(v.stock) >= 0 &&
    (v.salePrice === '' || Number(v.salePrice) < Number(v.price));

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
      <div className="lg:col-span-2 space-y-gutter">
        <Section icon="info" title="General Information">
          <Field label="Product Title">
            <input className="field px-4 py-2" value={v.name} onChange={(e) => patch({ name: e.target.value })} required maxLength={255} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Brand">
              <input className="field px-4 py-2" value={v.brand} onChange={(e) => patch({ brand: e.target.value })} maxLength={255} />
            </Field>
            <Field label="Product Model">
              <input className="field px-4 py-2" value={v.model} onChange={(e) => patch({ model: e.target.value })} maxLength={128} />
            </Field>
          </div>
          <Field label="Description">
            <textarea className="field px-4 py-2 min-h-[120px]" value={v.longDescription} onChange={(e) => patch({ longDescription: e.target.value })} />
          </Field>
        </Section>

        <Section icon="image" title="Product Media" hint="Recommended: 1000×1000px">
          <ImageUploader value={v.images} onChange={(images) => patch({ images })} />
        </Section>

        <Section icon="payments" title="Pricing & Inventory">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Base Price ($)">
              <input type="number" min="0" step="0.01" className="field px-4 py-2" value={v.price} onChange={(e) => patch({ price: e.target.value })} required />
            </Field>
            <Field label="SKU (Stock Keeping Unit)">
              <input className="field px-4 py-2" value={v.sku} onChange={(e) => patch({ sku: e.target.value })} placeholder="Leave blank to auto-generate" maxLength={64} />
            </Field>
            <Field label="Sale Price ($)">
              <input type="number" min="0" step="0.01" className="field px-4 py-2" value={v.salePrice} onChange={(e) => patch({ salePrice: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Quantity in Stock">
              <input type="number" min="0" className="field px-4 py-2" value={v.stock} onChange={(e) => patch({ stock: e.target.value })} required />
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 mt-2">
            <input type="checkbox" checked={v.trackInventory} onChange={(e) => patch({ trackInventory: e.target.checked })} />
            <span className="text-body-sm">Track inventory for this product</span>
          </label>
        </Section>
      </div>

      <aside className="space-y-gutter">
        <Section icon="category" title="Categorization">
          <Field label="Category">
            <input className="field px-4 py-2" value={v.category} onChange={(e) => patch({ category: e.target.value })} required />
          </Field>
          <Field label="Tags">
            <div className="flex flex-wrap items-center gap-2 border border-outline-variant rounded-lg p-2 bg-surface">
              {v.tags.map((t) => (
                <span key={t} className="bg-surface-container-high text-on-surface px-2 py-0.5 rounded-full text-body-sm inline-flex items-center gap-1">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} aria-label="Remove tag">
                    <Icon name="close" size={12} />
                  </button>
                </span>
              ))}
              <input
                className="flex-1 min-w-[80px] bg-transparent outline-none text-body-sm"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag…"
              />
            </div>
          </Field>
        </Section>

        <Section icon="visibility" title="Visibility">
          <label className="flex items-center justify-between">
            <div>
              <div className="text-label-md">Product Status</div>
              <div className="text-body-sm text-on-surface-variant">Set whether this item is live</div>
            </div>
            <input
              type="checkbox"
              checked={v.isPublished}
              onChange={(e) => patch({ isPublished: e.target.checked })}
              className="w-12 h-6 cursor-pointer accent-primary"
              aria-label="Published"
            />
          </label>
        </Section>

        <div className="flex justify-end gap-3 sticky bottom-4 bg-surface-container-low p-3 rounded-xl border border-outline-variant">
          <button type="button" onClick={handleDiscard} className="px-4 py-2 text-on-surface-variant">Discard</button>
          <button
            type="submit"
            disabled={!canSave || submitting}
            className="btn-primary px-6 py-2 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : initial ? 'Update Product' : 'Save Product'}
          </button>
        </div>
      </aside>
    </form>
  );
}

function Section({ icon, title, hint, children }) {
  return (
    <section className="bg-surface border border-outline-variant rounded-xl p-6">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-headline-md flex items-center gap-2">
          <Icon name={icon} className="text-primary" size={18} />
          {title}
        </h2>
        {hint && <span className="text-body-sm text-on-surface-variant">{hint}</span>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-label-md text-on-surface-variant block">{label}</label>
      {children}
    </div>
  );
}
