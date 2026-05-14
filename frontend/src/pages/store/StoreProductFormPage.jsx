import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import {
  createStoreProduct,
  deleteStoreProduct,
  getStoreProduct,
  updateStoreProduct,
} from '../../services/inventory.js';
import ProductForm from './ProductForm.jsx';

export default function StoreProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const editing = Boolean(id);
  const [initial, setInitial] = useState(editing ? null : {});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    getStoreProduct(id)
      .then((p) => {
        if (cancelled) return;
        setInitial({
          name: p.name,
          brand: p.brand,
          model: p.model ?? '',
          category: p.category,
          sku: p.sku ?? '',
          price: String(p.price ?? ''),
          salePrice: p.salePrice == null ? '' : String(p.salePrice),
          stock: String(p.stock ?? 0),
          trackInventory: p.trackInventory,
          isPublished: p.isPublished,
          imageFirst: p.image,
          images: p.images && p.images.length ? p.images : (p.image ? [p.image] : []),
          shortDescription: p.subtitle ?? '',
          longDescription: p.description ?? '',
          tags: Array.isArray(p.tags) ? p.tags : [],
        });
      })
      .catch((err) => {
        toast.error(err?.message ?? 'Could not load product');
        navigate('/store/inventory', { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [id, editing, navigate, toast]);

  async function save(payload) {
    setSubmitting(true);
    try {
      if (editing) {
        await updateStoreProduct(id, payload);
        toast.success('Product updated');
        navigate('/store/inventory');
      } else {
        const res = await createStoreProduct(payload);
        toast.success('Product created');
        navigate(`/store/products/${res.product.id}`);
      }
    } catch (err) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleArchive() {
    if (!initial) return;
    const next = !initial.isPublished;
    try {
      await updateStoreProduct(id, { isPublished: next });
      setInitial((prev) => ({ ...prev, isPublished: next }));
      toast.info(next ? 'Restored' : 'Archived');
    } catch (err) {
      toast.error(err?.message ?? 'Could not archive');
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await deleteStoreProduct(id);
      toast.info('Deleted');
      navigate('/store/inventory');
    } catch (err) {
      toast.error(err?.message ?? 'Delete failed');
    }
  }

  if (editing && !initial) {
    return <div className="px-4 py-8">Loading…</div>;
  }

  return (
    <div className="space-y-gutter">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-headline-lg">{editing ? 'Edit Product' : 'Add New Product'}</h1>
          {editing && initial?.sku && (
            <p className="text-body-sm text-on-surface-variant">SKU: {initial.sku}</p>
          )}
        </div>
        {editing && (
          <div className="flex flex-wrap gap-2">
            <Link to={`/product/${id}`} target="_blank" className="btn-secondary px-3 py-2 inline-flex items-center gap-1 text-body-sm">
              <Icon name="open_in_new" size={16} /> View on Store
            </Link>
            <button
              type="button"
              onClick={toggleArchive}
              className="btn-secondary px-3 py-2 inline-flex items-center gap-1 text-body-sm"
            >
              <Icon name={initial?.isPublished ? 'archive' : 'unarchive'} size={16} />
              {initial?.isPublished ? 'Archive' : 'Restore'}
            </button>
            <button
              type="button"
              onClick={remove}
              className="px-3 py-2 inline-flex items-center gap-1 text-body-sm text-error border border-error rounded-lg hover:bg-error/5"
            >
              <Icon name="delete" size={16} /> Delete
            </button>
          </div>
        )}
      </header>
      <ProductForm
        initial={initial}
        submitting={submitting}
        onSubmit={save}
        onDiscard={() => navigate('/store/inventory')}
      />
    </div>
  );
}
