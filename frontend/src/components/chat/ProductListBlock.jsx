import { Link } from 'react-router-dom';
import { addCartItem } from '../../services/cart';
import { addWishlistItem } from '../../services/wishlist';

export function ProductListBlock({ block }) {
  const onAdd = async (id) => {
    try {
      await addCartItem(id, 1);
    } catch (_err) {
      // toast block from server already explains success/failure
    }
  };
  const onSave = async (id) => {
    try {
      await addWishlistItem(id);
    } catch (_err) {
      // ignored
    }
  };
  return (
    <div className="flex flex-col gap-2 mt-2">
      {block.items.map((p) => (
        <div
          key={p.id}
          className="flex gap-3 p-2 bg-surface border border-outline-variant rounded-lg"
        >
          {p.image ? (
            <img
              src={p.image}
              alt={p.name}
              className="w-20 h-20 rounded-md object-cover flex-none bg-surface-container"
            />
          ) : (
            <div className="w-20 h-20 rounded-md bg-surface-container flex-none" />
          )}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <Link
              to={`/products/${p.id}`}
              className="text-body-sm font-semibold text-on-surface hover:underline truncate"
            >
              {p.name}
            </Link>
            <div className="flex gap-2 text-body-xs text-on-surface-variant items-center">
              <span className="font-semibold text-error">{p.price}</span>
              {p.rating != null && <span>★ {Number(p.rating).toFixed(1)}</span>}
              {p.stock === 'out' && (
                <span className="text-error">Out of stock</span>
              )}
              {p.stock === 'low' && <span>Low stock</span>}
            </div>
            <div className="flex gap-1.5 mt-1">
              {p.actions?.includes('wishlist') && (
                <button
                  onClick={() => onSave(p.id)}
                  className="text-body-xs px-2.5 py-1 rounded-md border border-outline-variant bg-surface hover:bg-surface-container"
                >
                  ♡ Save
                </button>
              )}
              {p.actions?.includes('view') && (
                <Link
                  to={`/products/${p.id}`}
                  className="text-body-xs px-2.5 py-1 rounded-md border border-outline-variant bg-surface hover:bg-surface-container"
                >
                  Details
                </Link>
              )}
              {p.actions?.includes('add_to_cart') && p.stock !== 'out' && (
                <button
                  onClick={() => onAdd(p.id)}
                  className="text-body-xs px-2.5 py-1 rounded-md bg-on-surface text-surface hover:opacity-90"
                >
                  + Add to cart
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
