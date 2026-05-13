import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { getProduct } from '../services/products.js';

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState(0);
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();

  useEffect(() => {
    getProduct(id).then(setProduct);
    setActiveImg(0);
    setQty(1);
  }, [id]);

  if (!product) {
    return (
      <div className="container-max py-12 flex items-center gap-3 text-on-surface-variant">
        <Icon name="hourglass_top" /> Loading product…
      </div>
    );
  }

  const isWishlisted = has(product.id);

  return (
    <div className="container-max py-8">
      <nav className="text-body-sm text-on-surface-variant mb-6 flex flex-wrap items-center gap-2">
        <Link to="/" className="hover:text-primary">Home</Link>
        <Icon name="chevron_right" size={16} />
        <Link to="/search" className="hover:text-primary">Shop</Link>
        <Icon name="chevron_right" size={16} />
        <span className="text-on-surface">{product.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter mb-16">
        {/* Gallery */}
        <div className="lg:col-span-6">
          <div className="aspect-square bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant">
            <img
              src={product.images[activeImg]}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {product.images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveImg(idx)}
                className={`aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                  idx === activeImg ? 'border-primary' : 'border-outline-variant hover:border-primary'
                }`}
              >
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-6 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-2">
            <span className="text-label-md text-primary uppercase tracking-wider">{product.brand}</span>
            <button
              type="button"
              onClick={() => toggle(product)}
              aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              className={`p-2 rounded-full transition-colors ${
                isWishlisted ? 'text-error bg-error-container/50' : 'text-on-surface-variant hover:text-error hover:bg-surface-container'
              }`}
            >
              <Icon name="favorite" filled={isWishlisted} />
            </button>
          </div>
          <h1 className="text-headline-lg text-on-surface mb-2">{product.name}</h1>
          <p className="text-body-md text-on-surface-variant mb-4">{product.subtitle}</p>

          {product.rating !== undefined && (
            <div className="flex items-center gap-3 mb-6">
              <div className="flex text-secondary-container">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Icon
                    key={s}
                    name={s <= Math.round(product.rating) ? 'star' : 'star_outline'}
                    filled={s <= Math.round(product.rating)}
                    size={20}
                  />
                ))}
              </div>
              <span className="text-body-sm text-on-surface-variant">
                {product.rating} • {product.reviewCount} reviews
              </span>
            </div>
          )}

          <div className="flex items-end gap-3 mb-6">
            <span className="text-display-lg text-on-surface">${product.price.toFixed(2)}</span>
            {product.originalPrice && (
              <span className="text-body-lg text-outline-variant line-through mb-2">
                ${product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>

          <p className="text-body-md text-on-surface-variant mb-6">{product.description}</p>

          {product.colors && (
            <div className="mb-6">
              <div className="text-label-md text-on-surface mb-2">Color</div>
              <div className="flex gap-3">
                {product.colors.map((c, idx) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(idx)}
                    aria-label={`Color ${idx + 1}`}
                    className={`w-10 h-10 rounded-full transition-all ${
                      color === idx
                        ? 'border-2 border-primary ring-2 ring-primary/20'
                        : 'border border-outline-variant hover:border-primary'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 mt-auto">
            <div className="flex items-center border border-outline-variant rounded-lg bg-surface-container-lowest overflow-hidden h-12 w-full sm:w-32">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
                className="px-4 text-on-surface-variant hover:bg-surface-container h-full flex items-center justify-center"
              >
                <Icon name="remove" />
              </button>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="w-full text-center border-none focus:ring-0 text-body-md font-semibold text-on-surface p-0 h-full bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inverse-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
                className="px-4 text-on-surface-variant hover:bg-surface-container h-full flex items-center justify-center"
              >
                <Icon name="add" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => addItem(product, qty)}
              className="btn-secondary flex-1 h-12"
            >
              <Icon name="shopping_cart" />
              Add to Cart
            </button>
            <button
              type="button"
              onClick={() => addItem(product, qty)}
              className="btn-primary flex-1 h-12 shadow-lifted"
            >
              Buy Now
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-6 mt-6 text-body-sm text-on-surface-variant">
            <div className="flex items-center gap-2">
              <Icon name="local_shipping" className="text-primary" size={20} />
              Free Shipping
            </div>
            <div className="flex items-center gap-2">
              <Icon name="verified_user" className="text-primary" size={20} />
              2-Year Warranty
            </div>
            <div className="flex items-center gap-2">
              <Icon name="replay" className="text-primary" size={20} />
              30-Day Returns
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      {product.features?.length > 0 && (
        <div className="mb-16">
          <h2 className="text-headline-md text-on-surface mb-6 border-b border-outline-variant pb-4">
            Product Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {product.features.map((f) => (
              <div
                key={f.title}
                className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/50 hover:shadow-lifted transition-shadow"
              >
                <Icon name={f.icon} className="text-primary mb-4" size={32} />
                <h3 className="text-label-md text-on-surface mb-2">{f.title}</h3>
                <p className="text-body-sm text-on-surface-variant">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highlights — replaces hardcoded "features" with the JSON column we actually have */}
      {Array.isArray(product.highlights) && product.highlights.length > 0 && (
        <div className="mb-16">
          <h2 className="text-headline-md text-on-surface mb-6 border-b border-outline-variant pb-4">
            Highlights
          </h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {product.highlights.map((h, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 bg-surface-container-low p-4 rounded-xl border border-outline-variant/50"
              >
                <Icon name="check_circle" className="text-primary mt-0.5" size={20} />
                <span className="text-body-sm text-on-surface">{String(h)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reviews — backend has no review storage yet, only render when an API supplies them */}
      {product.reviews?.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-4">
            <h2 className="text-headline-md text-on-surface mb-6">Customer Reviews</h2>
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/50 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-display-lg text-on-surface">{product.rating}</span>
                <div>
                  <div className="flex text-secondary-container mb-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Icon
                        key={s}
                        name={s <= Math.round(product.rating) ? 'star' : 'star_half'}
                        filled
                        size={18}
                      />
                    ))}
                  </div>
                  <span className="text-body-sm text-on-surface-variant">
                    Based on {product.reviewCount} reviews
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-8 space-y-6">
            {product.reviews.map((r) => (
              <div key={r.id} className="border-b border-outline-variant pb-6">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-label-md">
                      {r.initials}
                    </div>
                    <div>
                      <span className="block text-label-md text-on-surface">{r.author}</span>
                      {r.verified && <span className="text-body-sm text-on-surface-variant">Verified Buyer</span>}
                    </div>
                  </div>
                  <span className="text-body-sm text-outline">{r.date}</span>
                </div>
                <div className="flex text-secondary-container mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Icon key={s} name={s <= r.rating ? 'star' : 'star_outline'} filled size={18} />
                  ))}
                </div>
                <h4 className="text-body-md font-semibold text-on-surface mb-2">{r.title}</h4>
                <p className="text-body-md text-on-surface-variant">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
