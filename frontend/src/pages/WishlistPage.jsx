import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { listProducts } from '../services/products.js';

export default function WishlistPage() {
  const { ids, remove } = useWishlist();
  const { addItem } = useCart();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    listProducts().then((res) => setProducts(res.items));
  }, []);

  const wishlist = useMemo(
    () => products.filter((p) => ids.includes(p.id)),
    [products, ids],
  );

  return (
    <div className="container-max py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-headline-lg text-on-surface">My Wishlist</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            {wishlist.length} saved item{wishlist.length === 1 ? '' : 's'}
          </p>
        </div>
        <button type="button" className="btn-secondary px-4 py-2 text-body-sm">
          <Icon name="share" size={18} />
          Share Wishlist
        </button>
      </div>

      {wishlist.length === 0 ? (
        <div className="bg-surface-container-low border border-outline-variant rounded-xl p-12 text-center">
          <Icon name="favorite" className="text-outline" size={48} />
          <p className="text-headline-md text-on-surface mt-4">Your wishlist is empty</p>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Tap the heart on any product to save it for later.
          </p>
          <Link to="/search" className="btn-primary inline-flex mt-6 px-6 py-2 text-body-sm">
            <Icon name="storefront" size={18} />
            Discover products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {wishlist.map((p) => (
            <article
              key={p.id}
              className="bg-surface border border-outline-variant rounded-xl overflow-hidden flex flex-col hover:border-primary hover:shadow-lifted transition-all"
            >
              <Link to={`/product/${p.id}`} className="block">
                <div className="aspect-square overflow-hidden bg-surface-container-low">
                  <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                </div>
              </Link>
              <div className="p-4 flex flex-col flex-1">
                <Link to={`/product/${p.id}`}>
                  <h3 className="text-label-md text-on-surface hover:text-primary truncate">{p.name}</h3>
                </Link>
                <p className="text-body-sm text-on-surface-variant truncate">{p.subtitle}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-headline-sm font-bold text-on-surface">
                    ${p.price.toFixed(2)}
                  </span>
                  <span
                    className={`text-body-sm flex items-center gap-1 ${
                      p.inStock ? 'text-primary' : 'text-error'
                    }`}
                  >
                    <Icon name={p.inStock ? 'check_circle' : 'cancel'} size={16} />
                    {p.inStock ? 'In Stock' : 'Out of Stock'}
                  </span>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => addItem(p)}
                    disabled={!p.inStock}
                    className="btn-primary flex-1 py-2 text-body-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Icon name="add_shopping_cart" size={18} />
                    Add to Cart
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    aria-label="Remove from wishlist"
                    className="p-2 text-on-surface-variant hover:text-error hover:bg-error-container/30 rounded-lg transition-colors border border-outline-variant"
                  >
                    <Icon name="delete" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
