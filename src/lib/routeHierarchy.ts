// Zentrale Eltern-/Hierarchie-Map für konsistente Back-Navigation.
export interface RouteInfo {
  parent: string;
  label: string;
}

export const ROUTE_HIERARCHY: Record<string, RouteInfo> = {
  '/sales/referenz-showcase/websites': { parent: '/sales/referenz-showcase', label: 'Referenzen' },
  '/sales/referenz-showcase/werbeanzeigen': { parent: '/sales/referenz-showcase', label: 'Referenzen' },
  '/sales/referenz-showcase/ad-performance': { parent: '/sales/referenz-showcase', label: 'Referenzen' },
  '/sales/referenz-showcase/werbeanzeigen/:id': { parent: '/sales/referenz-showcase/werbeanzeigen', label: 'Anzeigen' },
  '/sales/referenz-showcase/websites/:id': { parent: '/sales/referenz-showcase/websites', label: 'Websites' },
  '/sales/referenz-showcase/ad-performance/:id': { parent: '/sales/referenz-showcase/ad-performance', label: 'Kampagnen' },
  '/admin/import-blacklist': { parent: '/sales/referenz-showcase/werbeanzeigen', label: 'Anzeigen' },
};

export function getParentRoute(pathname: string): RouteInfo | null {
  if (ROUTE_HIERARCHY[pathname]) return ROUTE_HIERARCHY[pathname];

  for (const [pattern, info] of Object.entries(ROUTE_HIERARCHY)) {
    if (!pattern.includes(':')) continue;
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$');
    if (regex.test(pathname)) return info;
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 1) {
    return { parent: '/' + parts.slice(0, -1).join('/'), label: 'Zurück' };
  }
  return null;
}
