import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from './roleHome.js';

// Pathless layout guard. Renders the nested routes only when the viewer is
// authenticated AND has the required role. Unauthenticated -> /auth (remembering
// where they were). Wrong role -> that user's own home.
export default function RequireRole({ role }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  if (user?.role !== role) {
    return <Navigate to={roleHome(user)} replace />;
  }
  return <Outlet />;
}
