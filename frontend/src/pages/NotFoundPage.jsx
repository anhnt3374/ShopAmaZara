import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-margin-mobile">
      <div className="text-center max-w-md">
        <Icon name="error" className="text-primary" size={64} />
        <h1 className="text-display-lg text-on-surface mt-4">404</h1>
        <p className="text-body-md text-on-surface-variant mt-2">
          We couldn't find that page on AmaZara.
        </p>
        <Link to="/" className="btn-primary inline-flex mt-6 px-6 py-2 text-body-sm">
          <Icon name="home" size={18} />
          Go home
        </Link>
      </div>
    </div>
  );
}
