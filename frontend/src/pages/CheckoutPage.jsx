import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AddressForm from '../components/AddressForm.jsx';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { createAddress, listAddresses } from '../services/addresses.js';
import { checkout } from '../services/orders.js';

const SHIPPING_OPTIONS = [
  { id: 'Standard', label: 'Standard Delivery', eta: '5-7 business days', price: 5 },
  { id: 'Express', label: 'Express Delivery', eta: '1-2 business days', price: 15 },
];

const PAYMENT_TABS = [
  { id: 'cod', label: 'Cash on Delivery', icon: 'local_shipping' },
  { id: 'card', label: 'Credit Card', icon: 'credit_card' },
  { id: 'ewallet', label: 'E-wallet', icon: 'account_balance_wallet' },
  { id: 'bank', label: 'Bank Transfer', icon: 'account_balance' },
];

export default function CheckoutPage() {
  const { isAuthenticated } = useAuth();
  const { items, selectedItems, clearSelected } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const productIds = useMemo(() => {
    const fromState = location.state?.productIds;
    if (fromState && fromState.length) return fromState;
    return selectedItems.map((i) => i.id);
  }, [location.state, selectedItems]);

  const lineItems = useMemo(
    () => items.filter((i) => productIds.includes(i.id)),
    [items, productIds],
  );

  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [shippingMethod, setShippingMethod] = useState('Standard');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/auth', { replace: true, state: { from: '/checkout' } });
      return;
    }
    if (productIds.length === 0) {
      toast.error('Your selection is empty');
      navigate('/cart', { replace: true });
      return;
    }
    listAddresses()
      .then((r) => {
        setAddresses(r.items);
        const def = r.items.find((a) => a.isDefault) ?? r.items[0];
        if (def) setAddressId(def.id);
        else setAddingAddress(true);
      })
      .catch((err) => toast.error(err?.message ?? 'Could not load addresses'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const sub = lineItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
    const shippingCost = shippingMethod === 'Express' ? 15 : 5;
    const tax = +(sub * 0.08).toFixed(2);
    return {
      sub,
      shipping: sub > 0 ? shippingCost : 0,
      tax,
      total: +(sub + (sub > 0 ? shippingCost : 0) + tax).toFixed(2),
    };
  }, [lineItems, shippingMethod]);

  const saveAddress = async (data) => {
    setSavingAddress(true);
    try {
      const res = await createAddress(data);
      const updated = await listAddresses();
      setAddresses(updated.items);
      setAddressId(res.address.id);
      setAddingAddress(false);
    } catch (err) {
      toast.error(err?.message ?? 'Could not save address');
    } finally {
      setSavingAddress(false);
    }
  };

  const placeOrder = async () => {
    if (!addressId) {
      toast.error('Pick an address');
      return;
    }
    if (paymentMethod === 'card') {
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length < 12) {
        toast.error('Card number looks too short');
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(expiry)) {
        toast.error('Expiry must be MM/YY');
        return;
      }
      if (!/^\d{3,4}$/.test(cvc)) {
        toast.error('CVC invalid');
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await checkout({
        productIds,
        addressId,
        shippingMethod,
        payment: {
          method: paymentMethod,
          cardLast4:
            paymentMethod === 'card'
              ? cardNumber.replace(/\D/g, '').slice(-4)
              : undefined,
        },
      });
      clearSelected();
      toast.success(`Order placed (#${res.orderId}) — $${Number(res.total).toFixed(2)}`);
      navigate(`/orders/${res.orderId}`, { replace: true });
    } catch (err) {
      toast.error(err?.message ?? 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-max py-8">
      <nav className="flex items-center gap-2 text-on-surface-variant text-label-md mb-6">
        <Link to="/cart" className="hover:text-primary">Cart</Link>
        <Icon name="chevron_right" size={14} />
        <span className="text-primary">Checkout</span>
      </nav>

      <div className="flex flex-col lg:flex-row gap-gutter items-start">
        <div className="flex-1 w-full min-w-0 space-y-gutter">
          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-headline-md flex items-center gap-2">
                <Icon name="location_on" className="text-primary" size={20} />
                Delivery Address
              </h2>
              {!addingAddress && (
                <button
                  onClick={() => setAddingAddress(true)}
                  className="text-primary text-label-md hover:underline"
                >
                  Add new address
                </button>
              )}
            </div>
            {addingAddress ? (
              <AddressForm
                onSubmit={saveAddress}
                onCancel={addresses.length ? () => setAddingAddress(false) : undefined}
                submitting={savingAddress}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAddressId(a.id)}
                    className={`text-left rounded-lg p-4 border-2 transition-colors ${
                      addressId === a.id
                        ? 'border-primary bg-surface-container-low'
                        : 'border-outline-variant bg-surface hover:border-primary/40'
                    }`}
                  >
                    <p className="text-label-md uppercase tracking-wider text-on-surface-variant mb-1">
                      {a.label}
                    </p>
                    <p className="font-semibold">{a.recipientName}</p>
                    <p className="text-body-sm text-on-surface-variant leading-relaxed mt-1">
                      {a.line1}
                      {a.line2 ? <><br />{a.line2}</> : null}
                      <br />
                      {a.city}, {a.region} {a.postalCode}
                      <br />
                      {a.country}
                    </p>
                    <p className="text-body-sm text-on-surface-variant mt-2">{a.phone}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <h2 className="text-headline-md flex items-center gap-2 mb-4">
              <Icon name="local_shipping" className="text-primary" size={20} />
              Shipping Method
            </h2>
            <div className="flex flex-col gap-3">
              {SHIPPING_OPTIONS.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center justify-between p-4 rounded-lg border cursor-pointer ${
                    shippingMethod === s.id
                      ? 'border-primary bg-surface-container-low'
                      : 'border-outline-variant hover:border-outline'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="radio"
                      name="shipping"
                      checked={shippingMethod === s.id}
                      onChange={() => setShippingMethod(s.id)}
                      className="w-5 h-5 text-primary focus:ring-primary"
                    />
                    <div>
                      <p className="text-label-md text-on-surface">{s.label}</p>
                      <p className="text-body-sm text-on-surface-variant">{s.eta}</p>
                    </div>
                  </div>
                  <span className="text-label-md text-on-surface">${s.price.toFixed(2)}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="bg-surface border border-outline-variant rounded-xl p-6">
            <h2 className="text-headline-md flex items-center gap-2 mb-4">
              <Icon name="payments" className="text-primary" size={20} />
              Payment Method
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {PAYMENT_TABS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPaymentMethod(p.id)}
                  className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-colors gap-2 ${
                    paymentMethod === p.id
                      ? 'border-primary bg-surface-container-low text-primary'
                      : 'border-outline-variant text-on-surface-variant hover:border-outline'
                  }`}
                >
                  <Icon name={p.icon} size={28} />
                  <span className="text-label-md">{p.label}</span>
                </button>
              ))}
            </div>
            {paymentMethod === 'card' && (
              <div className="space-y-4">
                <Field label="Card Number">
                  <input
                    className="field px-4 py-2"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    inputMode="numeric"
                    maxLength={23}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Expiry">
                    <input
                      className="field px-4 py-2"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      maxLength={5}
                    />
                  </Field>
                  <Field label="CVC">
                    <input
                      className="field px-4 py-2"
                      placeholder="123"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value)}
                      maxLength={4}
                      inputMode="numeric"
                    />
                  </Field>
                </div>
              </div>
            )}
            {paymentMethod === 'cod' && (
              <div className="rounded-lg border border-outline-variant bg-surface-container-low p-4 flex gap-3">
                <Icon name="info" size={20} className="text-primary shrink-0" />
                <div className="text-body-sm text-on-surface-variant">
                  Pay the courier in cash (or QR) when the order arrives.
                  No card details required — you can place the order right away.
                </div>
              </div>
            )}
            {(paymentMethod === 'ewallet' || paymentMethod === 'bank') && (
              <p className="text-body-sm text-on-surface-variant">
                You will be redirected to a mock {paymentMethod === 'ewallet' ? 'e-wallet' : 'bank transfer'}{' '}
                confirmation after you place the order.
              </p>
            )}
          </section>
        </div>

        <aside className="w-full lg:w-96 lg:shrink-0">
          <div className="bg-surface border border-outline-variant rounded-xl p-6 lg:sticky lg:top-24">
            <h3 className="text-headline-md border-b border-outline-variant pb-4 mb-4">
              Order Summary
            </h3>
            <ul className="space-y-3 mb-4">
              {lineItems.map((i) => (
                <li key={i.id} className="flex gap-3">
                  {i.image ? (
                    <img
                      src={i.image}
                      alt={i.name}
                      className="w-16 h-16 rounded-lg object-cover bg-surface-container-low"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-surface-container-low" />
                  )}
                  <div className="flex-1">
                    <p className="text-label-md text-on-surface line-clamp-1">{i.name}</p>
                    <p className="text-body-sm text-on-surface-variant">Qty: {i.quantity}</p>
                    <p className="text-body-md text-primary font-semibold">
                      ${(Number(i.price) * i.quantity).toFixed(2)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-outline-variant pt-4 space-y-2">
              <Row label="Subtotal" value={`$${totals.sub.toFixed(2)}`} />
              <Row label={`Shipping (${shippingMethod})`} value={`$${totals.shipping.toFixed(2)}`} />
              <Row label="Estimated Tax" value={`$${totals.tax.toFixed(2)}`} />
            </div>
            <div className="border-t border-outline-variant pt-4 mt-4 flex justify-between items-center">
              <span className="text-headline-md">Total</span>
              <span className="text-headline-lg text-primary">${totals.total.toFixed(2)}</span>
            </div>
            <button
              type="button"
              onClick={placeOrder}
              disabled={submitting || !addressId || lineItems.length === 0}
              className="btn-primary w-full py-3 mt-6 disabled:opacity-50"
            >
              {submitting ? 'Placing order…' : 'Place Order'}
              {!submitting && <Icon name="arrow_forward" size={16} />}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-on-surface-variant">
      <span>{label}</span>
      <span className="text-data-mono">{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <label className="text-label-md text-on-surface-variant block">{label}</label>
      {children}
    </div>
  );
}
