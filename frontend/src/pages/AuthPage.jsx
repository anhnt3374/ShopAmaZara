import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const HERO_IMG =
  'https://images.unsplash.com/photo-1503551723145-6c040742065b-v2?auto=format&fit=crop&w=1200&q=80';

export default function AuthPage() {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [role, setRole] = useState('buyer'); // buyer | seller

  return (
    <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-overlay">
      {/* Form */}
      <div className="p-8 md:p-12 flex flex-col">
        <Link to="/" className="text-headline-md font-bold text-primary mb-8 inline-flex items-center gap-2">
          <Icon name="storefront" />
          AmaZara
        </Link>

        <h1 className="text-headline-lg text-on-surface mb-2">
          {mode === 'signin' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-body-sm text-on-surface-variant mb-6">
          {mode === 'signin'
            ? 'Sign in to continue shopping or manage your store.'
            : 'Pick how you want to use AmaZara to get started.'}
        </p>

        <div className="inline-flex bg-surface-container-low border border-outline-variant rounded-full p-1 mb-6 w-fit">
          {[
            { id: 'buyer', label: 'Buyer' },
            { id: 'seller', label: 'Store Owner' },
          ].map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRole(r.id)}
              className={`px-4 py-1.5 rounded-full text-body-sm transition-all ${
                role === r.id
                  ? 'bg-primary text-on-primary shadow'
                  : 'text-on-surface-variant hover:text-primary'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form
          className="space-y-4 flex-1 flex flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.assign(role === 'seller' ? '/store' : '/');
          }}
        >
          {mode === 'signup' && (
            <Field
              label="Full name"
              icon="person"
              placeholder="Jane Doe"
              required
            />
          )}
          <Field
            label="Email"
            icon="mail"
            type="email"
            placeholder="you@email.com"
            required
          />
          <Field
            label="Password"
            icon="lock"
            type="password"
            placeholder="••••••••"
            required
          />

          {mode === 'signin' && (
            <div className="flex items-center justify-between text-body-sm">
              <label className="flex items-center gap-2 text-on-surface-variant">
                <input type="checkbox" className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4" />
                Remember me
              </label>
              <a href="#" className="text-primary hover:underline">
                Forgot password?
              </a>
            </div>
          )}

          <button type="submit" className="btn-primary py-3 px-6 mt-2">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
            <Icon name="arrow_forward" size={18} />
          </button>

          <div className="flex items-center gap-3 text-body-sm text-on-surface-variant my-2">
            <span className="flex-1 border-t border-outline-variant" />
            or
            <span className="flex-1 border-t border-outline-variant" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SocialButton icon="g_translate" label="Google" />
            <SocialButton icon="apple" label="Apple" />
          </div>

          <p className="text-body-sm text-on-surface-variant text-center mt-auto">
            {mode === 'signin' ? (
              <>
                New to AmaZara?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="text-primary hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="text-primary hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </form>
      </div>

      {/* Visual */}
      <div className="hidden lg:block relative bg-primary text-on-primary">
        <img
          src={HERO_IMG}
          alt="Marketplace"
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
        />
        <div className="relative z-10 h-full flex flex-col justify-end p-10 bg-gradient-to-t from-primary/80 to-transparent">
          <span className="text-label-md uppercase tracking-wider text-secondary-fixed-dim">
            Professional Excellence in Commerce
          </span>
          <h2 className="text-display-lg leading-tight mt-3">
            One marketplace, every essential.
          </h2>
          <p className="text-body-lg text-primary-fixed-dim mt-4 max-w-md">
            Join thousands of buyers and sellers building trusted commerce on AmaZara.
          </p>
          <div className="flex items-center gap-6 mt-8 text-body-sm">
            <div className="flex items-center gap-2"><Icon name="verified" /> Verified sellers</div>
            <div className="flex items-center gap-2"><Icon name="local_shipping" /> Global shipping</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon, ...rest }) {
  return (
    <label className="block">
      <span className="text-label-md text-on-surface mb-1 block">{label}</span>
      <div className="relative">
        <input className="field w-full pl-10 pr-3 py-2.5 text-body-sm" {...rest} />
        <Icon name={icon} className="absolute left-3 top-2.5 text-outline" size={20} />
      </div>
    </label>
  );
}

function SocialButton({ icon, label }) {
  return (
    <button
      type="button"
      className="border border-outline-variant rounded-lg py-2.5 px-3 inline-flex items-center justify-center gap-2 text-label-md text-on-surface hover:bg-surface-container-low transition-colors"
    >
      <Icon name={icon} size={20} />
      {label}
    </button>
  );
}
