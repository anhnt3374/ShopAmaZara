import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-surface-container-low border-t border-outline-variant w-full">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 py-8 px-margin-mobile md:px-margin-desktop max-w-container-max mx-auto">
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
          <span className="text-headline-md text-primary font-bold">AmaZara</span>
          <span className="text-body-sm text-outline hidden md:inline border-l border-outline-variant pl-4">
            © 2026 AmaZara. Professional Excellence in Commerce.
          </span>
        </div>
        <nav className="flex flex-wrap justify-center gap-gutter text-label-md">
          <Link to="/policy/privacy" className="text-on-surface-variant hover:text-primary hover:underline transition-all">
            Privacy Policy
          </Link>
          <Link to="/policy/terms" className="text-on-surface-variant hover:text-primary hover:underline transition-all">
            Terms of Use
          </Link>
          <Link to="/policy/shipping" className="text-on-surface-variant hover:text-primary hover:underline transition-all">
            Shipping Guide
          </Link>
          <Link to="/policy/vendor" className="text-on-surface-variant hover:text-primary hover:underline transition-all">
            Vendor Rules
          </Link>
        </nav>
        <div className="text-body-sm text-outline md:hidden text-center w-full">
          © 2026 AmaZara. Professional Excellence in Commerce.
        </div>
      </div>
    </footer>
  );
}
