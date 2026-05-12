import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns true when the current view should be treated as a public/anonymous
 * showcase view — either because the route lives under /showcase or because
 * there is no authenticated user.
 *
 * Used to hide admin/edit affordances and to skip joins on sensitive tables.
 */
export function useIsPublicView() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const isPublicRoute = pathname.startsWith('/showcase');
  const isUnauthenticated = !user;

  return isPublicRoute || isUnauthenticated;
}
