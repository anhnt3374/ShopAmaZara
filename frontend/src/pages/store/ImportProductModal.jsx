import { useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { bulkImportProducts, bulkTemplateUrl } from '../../services/uploads.js';

const ACCEPT = '.csv,.xls,.xlsx';

export default function ImportProductModal({ open, onClose, onDone }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  if (!open) return null;

  async function upload(file) {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && !lower.endsWith('.xls') && !lower.endsWith('.xlsx')) {
      toast.error('Pick a .csv, .xls or .xlsx file');
      return;
    }
    if (file.size > 10_000_000) {
      toast.error('File too large (max 10MB)');
      return;
    }
    setSubmitting(true);
    try {
      const res = await bulkImportProducts(file);
      setResult(res);
      if (res.created > 0) onDone?.();
    } catch (err) {
      toast.error(err?.message ?? 'Import failed');
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    if (submitting && !confirm('Cancel the upload?')) return;
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-surface-container-lowest rounded-xl border border-outline-variant w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center px-6 py-4 border-b border-outline-variant">
          <h2 className="text-headline-md">Import products from file</h2>
          <button onClick={close} aria-label="Close" className="p-1 rounded-full hover:bg-surface-container">
            <Icon name="close" />
          </button>
        </header>
        <div className="p-6 overflow-y-auto scrollbar-thin space-y-4">
          {!result && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  upload(e.dataTransfer.files[0]);
                }}
                className="w-full border-2 border-dashed border-outline-variant rounded-lg p-8 flex flex-col items-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary"
              >
                <Icon name="cloud_upload" size={36} />
                <span className="text-body-md">Drag and drop a file, or click to pick</span>
                <span className="text-body-sm">Accepts .csv, .xls, .xlsx (up to 10MB)</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) upload(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-outline-variant rounded-lg p-4">
                  <h3 className="text-label-md text-on-surface mb-2">Data requirements</h3>
                  <ul className="text-body-sm text-on-surface-variant space-y-1">
                    <li>Required columns: name, sku, category, price, stock</li>
                    <li>Numeric values for price and stock</li>
                    <li>SKU must be unique per product</li>
                  </ul>
                </div>
                <div className="border border-outline-variant rounded-lg p-4 flex flex-col gap-2 items-start">
                  <p className="text-body-sm text-on-surface-variant">No template yet?</p>
                  <a
                    href={bulkTemplateUrl()}
                    className="btn-secondary inline-flex items-center gap-2 px-4 py-2"
                  >
                    <Icon name="download" size={18} /> Download template
                  </a>
                </div>
              </div>
            </>
          )}
          {result && (
            <div className="space-y-3">
              <p className="text-body-md">
                <span className="font-bold text-emerald-700">{result.created}</span> created,{' '}
                <span className="font-bold text-error">{result.skippedRows.length}</span> skipped.
              </p>
              {result.skippedRows.length > 0 && (
                <ul className="border border-outline-variant rounded-lg divide-y divide-outline-variant max-h-64 overflow-y-auto">
                  {result.skippedRows.map((r, i) => (
                    <li key={i} className="px-3 py-2 text-body-sm flex justify-between">
                      <span>Row {r.row}</span>
                      <span className="text-on-surface-variant">{r.reason}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <footer className="px-6 py-4 border-t border-outline-variant flex justify-end gap-3">
          <button onClick={close} className="px-4 py-2 text-on-surface-variant">Close</button>
          {result && (
            <button onClick={() => setResult(null)} className="btn-secondary px-4 py-2">
              Import another
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
