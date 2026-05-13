import Icon from './Icon.jsx';

const STYLES = {
  Paid: { cls: 'bg-surface-container-highest text-primary', icon: 'payments' },
  Shipped: { cls: 'bg-surface-container-highest text-primary', icon: 'local_shipping' },
  Delivered: { cls: 'bg-emerald-100 text-emerald-800', icon: 'check_circle' },
  Cancelled: { cls: 'bg-red-50 text-red-700', icon: 'cancel' },
};

export default function OrderStatusBadge({ status }) {
  const s = STYLES[status] ?? STYLES.Paid;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-label-md ${s.cls}`}>
      <Icon name={s.icon} size={14} />
      {status}
    </span>
  );
}
