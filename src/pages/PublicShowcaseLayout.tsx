import { useEffect } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Trophy } from 'lucide-react';

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
}

export default function PublicShowcaseLayout() {
  useNoIndex();
  return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950 flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/showcase" className="flex items-center gap-2.5 group">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center shadow-sm">
              <Trophy className="w-5 h-5" />
            </span>
            <span className="font-semibold text-gray-900 dark:text-white tracking-tight">
              Referenz Showcase
            </span>
          </Link>

          <div className="flex items-center gap-5">
            <a
              href="https://leadsharks.de"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-block text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Über uns
            </a>
            <Link
              to="/auth"
              className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              Login →
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
          <div>© {new Date().getFullYear()} Viral Connect GmbH · LeadSharks</div>
          <div className="flex flex-wrap gap-6 justify-center">
            <a href="https://leadsharks.de/impressum" className="hover:text-gray-900 dark:hover:text-white transition-colors">Impressum</a>
            <a href="https://leadsharks.de/datenschutz" className="hover:text-gray-900 dark:hover:text-white transition-colors">Datenschutz</a>
            <a
              href="https://cal.com/leadsharks/erstgespraech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              Termin buchen →
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
