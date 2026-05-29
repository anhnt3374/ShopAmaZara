import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleHome } from './roleHome.js';

// Guard for /auth: a logged-in user has no business on the auth page, so send
// them to their role home.
export default function RedirectIfAuthed() {
  const { isAuthenticated, user } = useAuth();
  if (isAuthenticated) {
    return <Navigate to={roleHome(user)} replace />;
  }
  return <Outlet />;
}
