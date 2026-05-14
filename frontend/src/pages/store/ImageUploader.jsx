import { useRef, useState } from 'react';
import Icon from '../../components/Icon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { uploadProductImage } from '../../services/uploads.js';

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MAX_BYTES = 5_000_000;

export default function ImageUploader({ value = [], onChange, max = 10 }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [pending, setPending] = useState([]);

  function pick() {
    inputRef.current?.click();
  }

  async function uploadOne(file) {
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error(`Unsupported type: ${file.name}`);
      return null;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Too big (5MB): ${file.name}`);
      return null;
    }
    const id = `tmp-${Date.now()}-${Math.random()}`;
    setPending((prev) => [...prev, { id, status: 'uploading' }]);
    try {
      const { url } = await uploadProductImage(file);
      setPending((prev) => prev.filter((p) => p.id !== id));
      return url;
    } catch (err) {
      setPending((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'error' } : p)));
      toast.error(err?.message ?? `Upload failed: ${file.name}`);
      return null;
    }
  }

  async function handleFiles(files) {
    const remaining = max - value.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${max} images`);
      return;
    }
    const arr = Array.from(files).slice(0, remaining);
    const urls = [];
    for (let i = 0; i < arr.length; i += 3) {
      const chunk = arr.slice(i, i + 3);
      const results = await Promise.all(chunk.map((f) => uploadOne(f)));
      results.forEach((u) => u && urls.push(u));
    }
    if (urls.length) onChange([...value, ...urls]);
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    handleFiles(e.dataTransfer.files);
  }

  function removeAt(i) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  function moveToFirst(i) {
    if (i === 0) return;
    const next = [...value];
    const [picked] = next.splice(i, 1);
    next.unshift(picked);
    onChange(next);
  }

  return (
    <div>
      <button
        type="button"
        onClick={pick}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="w-full border-2 border-dashed border-outline-variant rounded-lg p-8 flex flex-col items-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
      >
        <Icon name="upload" size={32} />
        <span className="text-body-sm">Click to upload or drag and drop</span>
        <span className="text-[11px] text-outline">PNG, JPG, or WEBP (Max 5MB)</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {(value.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-4 gap-2 mt-3">
          {value.map((url, i) => (
            <div
              key={url}
              className={`relative aspect-square rounded-lg overflow-hidden border ${
                i === 0 ? 'border-primary' : 'border-outline-variant'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i !== 0 && (
                <button
                  type="button"
                  onClick={() => moveToFirst(i)}
                  className="absolute bottom-1 left-1 text-[10px] bg-primary text-on-primary px-2 py-0.5 rounded-full"
                >
                  Set primary
                </button>
              )}
              <button
                type="button"
                onClick={() => removeAt(i)}
                aria-label="Remove"
                className="absolute top-1 right-1 bg-error text-on-error rounded-full w-6 h-6 flex items-center justify-center"
              >
                <Icon name="close" size={14} />
              </button>
              {i === 0 && (
                <span className="absolute top-1 left-1 bg-primary text-on-primary text-[10px] px-1.5 py-0.5 rounded">
                  Primary
                </span>
              )}
            </div>
          ))}
          {pending.map((p) => (
            <div
              key={p.id}
              className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center ${
                p.status === 'error' ? 'border-error text-error' : 'border-outline-variant text-outline-variant'
              }`}
            >
              <Icon name={p.status === 'error' ? 'error' : 'hourglass_top'} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
