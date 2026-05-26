import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useWishlist } from '../context/WishlistContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat } from '../context/ChatContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useBuyerAction } from '../hooks/useBuyerAction.js';
import { getProduct } from '../services/products.js';
import { reviewsService } from '../services/reviews.js';

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState(0);
  const [reviewsState, setReviewsState] = useState({ items: [], total: 0, page: 1, summary: null });
  const [reviewsSort, setReviewsSort] = useState('newest');
  const [reviewsFilter, setReviewsFilter] = useState('');
  const [myReview, setMyReview] = useState(null);
  const [canReview, setCanReview] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ rating: 5, comment: '' });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const runBuyerAction = useBuyerAction();
  const { isAuthenticated } = useAuth();
  const { ensureStoreChat } = useChat();
  const toast = useToast();

  async function contactSeller() {
    if (!isAuthenticated) {
      toast.error('Sign in to message the seller');
      navigate('/auth');
      return;
    }
    try {
      const id = await ensureStoreChat(product.storeId);
      navigate(`/messages/${id}`);
    } catch (err) {
      toast.error(err?.message ?? 'Could not open chat');
    }
  }

  useEffect(() => {
    getProduct(id).then(setProduct);
    setActiveImg(0);
    setQty(1);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadReviews(1);
    if (isAuthenticated) loadMyReview();
    else { setMyReview(null); setCanReview(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAuthenticated, reviewsSort, reviewsFilter]);

  async function loadReviews(page) {
    const params = { page, limit: 10, sort: reviewsSort };
    if (reviewsFilter) params.rating = Number(reviewsFilter);
    const res = await reviewsService.list(id, params);
    setReviewsState((prev) => ({
      ...res,
      items: page === 1 ? res.items : [...prev.items, ...res.items],
    }));
  }

  async function loadMyReview() {
    try {
      const res = await reviewsService.myReview(id);
      setMyReview(res.review);
      setCanReview(res.canReview);
      if (res.review) setDraft({ rating: res.review.rating, comment: res.review.comment ?? '' });
    } catch {
      setMyReview(null);
      setCanReview(false);
    }
  }

  async function submitReview(e) {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/auth', { state: { from: `/product/${id}` } });
      return;
    }
    setSubmitting(true);
    try {
      if (myReview) {
        await reviewsService.update(myReview.id, draft);
        toast.success('Review updated');
      } else {
        await reviewsService.create(id, draft);
        toast.success('Review posted');
      }
      setEditing(false);
      await Promise.all([loadReviews(1), loadMyReview(), getProduct(id).then(setProduct)]);
    } catch (err) {
      toast.error(err?.message ?? 'Failed to save review');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteReview() {
    if (!myReview) return;
    if (!window.confirm('Delete your review?')) return;
    try {
      await reviewsService.remove(myReview.id);
      toast.success('Review deleted');
      setEditing(false);
      setDraft({ rating: 5, comment: '' });
      await Promise.all([loadReviews(1), loadMyReview(), getProduct(id).then(setProduct)]);
    } catch (err) {
      toast.error(err?.message ?? 'Failed to delete review');
    }
  }

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
              onClick={() => runBuyerAction(() => toggle(product))}
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
              onClick={() => runBuyerAction(() => addItem(product, qty))}
              className="btn-secondary flex-1 h-12"
            >
              <Icon name="shopping_cart" />
              Add to Cart
            </button>
            <button
              type="button"
              onClick={() => runBuyerAction(() => addItem(product, qty))}
              className="btn-primary flex-1 h-12 shadow-lifted"
            >
              Buy Now
            </button>
          </div>
          <div className="mt-3">
            <button
              type="button"
              onClick={contactSeller}
              className="btn-secondary px-4 py-2 inline-flex items-center gap-2"
            >
              <Icon name="chat" size={18} /> Contact seller
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

      {/* Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-4">
          <h2 className="text-headline-md text-on-surface mb-6">Customer Reviews</h2>
          {reviewsState.summary && reviewsState.summary.count > 0 ? (
            <div className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/50 mb-6">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-display-lg text-on-surface">{reviewsState.summary.average}</span>
                <div>
                  <div className="flex text-secondary-container mb-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Icon
                        key={s}
                        name={s <= Math.round(reviewsState.summary.average) ? 'star' : 'star_outline'}
                        filled
                        size={18}
                      />
                    ))}
                  </div>
                  <span className="text-body-sm text-on-surface-variant">
                    Based on {reviewsState.summary.count} reviews
                  </span>
                </div>
              </div>
              <div className="space-y-1">
                {[5, 4, 3, 2, 1].map((star) => {
                  const c = reviewsState.summary.breakdown[String(star)] ?? 0;
                  const pct = reviewsState.summary.count ? Math.round((c / reviewsState.summary.count) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-body-sm">
                      <span className="w-6 text-on-surface">{star}★</span>
                      <div className="flex-1 h-2 bg-surface-container rounded">
                        <div className="h-2 bg-secondary-container rounded" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-on-surface-variant text-right">{c}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-body-md text-on-surface-variant mb-6">No reviews yet.</p>
          )}

          {myReview && !editing && (
            <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/50 mb-4">
              <div className="text-label-md text-on-surface mb-1">Your review</div>
              <div className="flex text-secondary-container mb-2">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Icon key={s} name={s <= myReview.rating ? 'star' : 'star_outline'} filled size={16} />
                ))}
              </div>
              {myReview.comment && <p className="text-body-sm text-on-surface mb-3">{myReview.comment}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditing(true)} className="text-label-md text-primary">Edit</button>
                <button type="button" onClick={deleteReview} className="text-label-md text-error">Delete</button>
              </div>
            </div>
          )}

          {(canReview || (myReview && editing)) && (
            <form onSubmit={submitReview} className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/50 space-y-3">
              <div className="text-label-md text-on-surface">{myReview ? 'Edit your review' : 'Write a review'}</div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, rating: s }))}
                    aria-label={`${s} star`}
                    className="text-secondary-container"
                  >
                    <Icon name={s <= draft.rating ? 'star' : 'star_outline'} filled size={24} />
                  </button>
                ))}
              </div>
              <textarea
                value={draft.comment}
                onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
                maxLength={2000}
                rows={3}
                placeholder="Share your experience (optional)"
                className="w-full p-3 rounded-lg border border-outline-variant bg-surface text-body-md"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md disabled:opacity-50"
                >
                  {submitting ? 'Saving…' : myReview ? 'Save' : 'Post review'}
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setDraft({ rating: myReview.rating, comment: myReview.comment ?? '' }); }}
                    className="px-4 py-2 rounded-lg border border-outline-variant text-label-md"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          {reviewsState.total > 0 && (
            <div className="flex flex-wrap gap-3 items-center">
              <select
                value={reviewsSort}
                onChange={(e) => setReviewsSort(e.target.value)}
                className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-body-sm"
              >
                <option value="newest">Newest</option>
                <option value="highest">Highest rating</option>
                <option value="lowest">Lowest rating</option>
              </select>
              <select
                value={reviewsFilter}
                onChange={(e) => setReviewsFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-body-sm"
              >
                <option value="">All ratings</option>
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
            </div>
          )}

          {reviewsState.items
            .filter((r) => !myReview || r.id !== myReview.id)
            .map((r) => (
              <div key={r.id} className="border-b border-outline-variant pb-6">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-label-md">
                      {(r.user?.name ?? '?').slice(0, 1).toUpperCase()}
                    </div>
                    <span className="block text-label-md text-on-surface">{r.user?.name ?? 'Unknown'}</span>
                  </div>
                  <span className="text-body-sm text-outline">{new Date(r.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex text-secondary-container mb-3">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Icon key={s} name={s <= r.rating ? 'star' : 'star_outline'} filled size={18} />
                  ))}
                </div>
                {r.comment && <p className="text-body-md text-on-surface-variant">{r.comment}</p>}
              </div>
            ))}

          {reviewsState.items.length < reviewsState.total && (
            <button
              type="button"
              onClick={() => loadReviews(reviewsState.page + 1)}
              className="px-4 py-2 rounded-lg border border-outline-variant text-label-md"
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
