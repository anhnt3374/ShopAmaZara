import { Link } from 'react-router-dom';

export function OrderSuccessBlock({ block }) {
  return (
    <div className="mt-2 p-3 bg-tertiary-container text-on-tertiary-container border border-outline-variant rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <span aria-hidden>✓</span>
        <span className="text-label-md font-semibold">
          Order #{block.orderId} placed
        </span>
      </div>
      <div className="text-body-sm">
        Total {block.total}.{' '}
        <Link to={`/orders/${block.orderId}`} className="underline">
          View order →
        </Link>
      </div>
    </div>
  );
}
