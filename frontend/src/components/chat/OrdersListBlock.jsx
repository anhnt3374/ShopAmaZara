import { Link } from 'react-router-dom';

export function OrdersListBlock({ block }) {
  if (!block.items?.length) {
    return (
      <div className="mt-2 text-body-sm text-on-surface-variant">
        No matching orders.
      </div>
    );
  }
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {block.items.map((o) => (
        <li
          key={o.id}
          className="p-2 bg-surface border border-outline-variant rounded-lg text-body-sm flex justify-between"
        >
          <Link to={`/orders/${o.id}`} className="font-semibold underline">
            #{o.id}
          </Link>
          <span className="text-on-surface-variant">
            {o.status} · {o.total}
          </span>
        </li>
      ))}
    </ul>
  );
}
