import Icon from './Icon.jsx';

function fmt(d) {
  if (!d) return null;
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

const STEPS = [
  { key: 'created', label: 'Ordered', icon: 'check' },
  { key: 'paid', label: 'Paid', icon: 'payments' },
  { key: 'shipped', label: 'Shipped', icon: 'local_shipping' },
  { key: 'delivered', label: 'Delivered', icon: 'inventory_2' },
];

export default function OrderTimeline({ order }) {
  if (order.status === 'Cancelled') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-6">
        <p className="text-label-md uppercase tracking-wider mb-1">Cancelled</p>
        <p className="text-body-sm">
          This order was cancelled on {fmt(order.cancelledAt) ?? 'an unknown date'}.
          Stock has been restored.
        </p>
      </div>
    );
  }

  const dates = {
    created: order.createdAt,
    paid: order.paidAt,
    shipped: order.shippedAt,
    delivered: order.deliveredAt,
  };

  let lastIdx = -1;
  STEPS.forEach((s, i) => {
    if (dates[s.key]) lastIdx = i;
  });

  const progress = lastIdx <= 0 ? 0 : lastIdx / (STEPS.length - 1);

  return (
    <div className="relative">
      <div className="absolute top-5 left-5 right-5 h-1 bg-surface-container-highest">
        <div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="relative flex justify-between">
        {STEPS.map((s, i) => {
          const done = Boolean(dates[s.key]);
          return (
            <div key={s.key} className="flex flex-col items-center w-1/4">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                  done
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-highest text-outline border-2 border-outline-variant'
                }`}
              >
                <Icon name={s.icon} size={20} />
              </div>
              <span className={`text-label-md ${i === lastIdx ? 'text-primary' : 'text-on-surface'}`}>
                {s.label}
              </span>
              <span className="text-body-sm text-on-surface-variant">
                {fmt(dates[s.key]) ?? 'Pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
