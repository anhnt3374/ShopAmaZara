import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useBuyerAction } from '../hooks/useBuyerAction.js';

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const runBuyerAction = useBuyerAction();
  const isWishlisted = has(product.id);
  const discountBadge =
    product.discountLabel ?? (product.discount > 0 ? `-${product.discount}%` : null);

  const MAX_SWATCHES = 3;
  const colors = Array.isArray(product.colors) ? product.colors : [];
  const shownColors = colors.slice(0, MAX_SWATCHES);
  const extraColors = colors.length - shownColors.length;

  return (
    <article className="group relative bg-surface border border-outline-variant rounded-xl overflow-hidden hover:border-primary hover:shadow-lifted transition-all duration-300">
      {discountBadge && (
        <span
          className={`absolute top-3 left-3 z-10 text-[10px] font-bold uppercase tracking-wide py-1 px-2 rounded-sm shadow-sm ${
            discountBadge.startsWith('-')
              ? 'bg-error text-on-error'
              : 'bg-secondary-container text-on-secondary-container'
          }`}
        >
          {discountBadge}
        </span>
      )}
      <button
        type="button"
        onClick={() => runBuyerAction(() => toggle(product))}
        aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
        className={`absolute top-3 right-3 z-10 p-2 bg-surface/80 backdrop-blur-sm rounded-full transition-all duration-200 ${
          isWishlisted
            ? 'text-error opacity-100'
            : 'text-outline hover:text-error opacity-0 group-hover:opacity-100'
        }`}
      >
        <Icon name="favorite" filled={isWishlisted} size={18} />
      </button>

      <Link to={`/product/${product.id}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-surface-container-low">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="object-cover w-full h-full group-hover:scale-[1.02] transition-transform duration-300"
          />
          {colors.length > 0 && (
            <div
              role="img"
              className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-surface/80 backdrop-blur-sm px-2 py-1 shadow-sm"
              aria-label={`${colors.length} ${colors.length === 1 ? 'color' : 'colors'} available`}
            >
              {shownColors.map((c, idx) => (
                <span
                  key={idx}
                  aria-hidden="true"
                  className="w-3.5 h-3.5 rounded-full border border-black/15 ring-1 ring-inset ring-white/40"
                  style={{ backgroundColor: c }}
                />
              ))}
              {extraColors > 0 && (
                <span aria-hidden="true" className="text-[11px] font-semibold text-on-surface-variant">
                  +{extraColors}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="p-4">
        {product.rating !== undefined ? (
          <div className="flex items-center gap-1 mb-1 text-secondary-container">
            <Icon name="star" filled size={14} />
            <span className="text-data-mono text-on-surface-variant mt-0.5">
              {product.rating?.toFixed(1)} ({product.reviewCount ?? 0})
            </span>
          </div>
        ) : (
          <div className="text-body-sm text-on-surface-variant mb-1 truncate">
            {product.brand}
          </div>
        )}
        <Link to={`/product/${product.id}`}>
          <h3 className="text-body-md font-semibold text-on-surface truncate mb-1 hover:text-primary transition-colors">
            {product.name}
          </h3>
        </Link>
        <p className="text-body-sm text-on-surface-variant truncate mb-3">{product.subtitle}</p>
        <div className="flex justify-between items-center">
          <div>
            <span className="text-headline-sm font-bold text-on-surface">
              ${product.price.toFixed(2)}
            </span>
            {product.originalPrice && (
              <span className="text-body-sm text-outline-variant line-through ml-2">
                ${product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => runBuyerAction(() => addItem(product))}
            aria-label="Add to cart"
            disabled={!product.inStock}
            className="bg-surface-container hover:bg-surface-container-high text-primary p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="add_shopping_cart" size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}
