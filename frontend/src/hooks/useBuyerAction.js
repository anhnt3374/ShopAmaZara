import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Returns run(action): if the viewer is an authenticated buyer, run the action;
// otherwise redirect to /auth (remembering where to return). Used to gate
// buyer-only actions (add to cart, wishlist) that live on public pages.
export function useBuyerAction() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    (action) => {
      if (!isAuthenticated || user?.role !== 'buyer') {
        navigate('/auth', {
          state: { from: location.pathname + location.search },
        });
        return;
      }
      action();
    },
    [isAuthenticated, user, navigate, location],
  );
}
