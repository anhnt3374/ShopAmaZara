import Icon from './Icon.jsx';

export default function AddressCard({ address, onEdit, onDelete, onSetDefault }) {
  return (
    <article
      className={`bg-surface rounded-xl p-6 border ${
        address.isDefault ? 'border-primary' : 'border-outline-variant'
      } hover:border-primary transition-all hover:shadow-md flex flex-col justify-between`}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col">
          <span className="text-label-md text-on-surface">{address.recipientName}</span>
          <p className="text-body-md text-on-surface-variant">{address.phone}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider ${
            address.isDefault
              ? 'bg-primary-fixed text-on-primary-fixed'
              : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          {address.label}
        </span>
      </div>
      <div className="mb-4">
        <p className="text-body-md text-on-surface leading-relaxed">
          {address.line1}
          {address.line2 ? <><br />{address.line2}</> : null}
          <br />
          {address.city}, {address.region} {address.postalCode}
          <br />
          {address.country}
        </p>
      </div>
      <div className="flex items-center gap-4 pt-4 border-t border-outline-variant text-label-md">
        <button onClick={onEdit} className="text-primary hover:underline">Edit</button>
        {!address.isDefault && (
          <button onClick={onSetDefault} className="text-on-surface-variant hover:text-primary hover:underline">
            Set as default
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={address.isDefault}
          className={`hover:underline ${address.isDefault ? 'text-on-surface-variant opacity-50 cursor-not-allowed' : 'text-error'}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
