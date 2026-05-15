/**
 * Semantic color class strings — use instead of raw `bg-white`/`text-gray-900`
 * inside Showcase / new Apple-style surfaces.
 */
export const colors = {
  surface: {
    base: 'bg-[#fafaf7] dark:bg-gray-950',
    raised: 'bg-white dark:bg-gray-900',
    subtle: 'bg-gray-50 dark:bg-gray-800/50',
    overlay: 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md',
  },
  border: {
    subtle: 'border-gray-200/80 dark:border-gray-800',
    base: 'border-gray-200 dark:border-gray-800',
    strong: 'border-gray-300 dark:border-gray-700',
  },
  text: {
    primary: 'text-gray-900 dark:text-white',
    secondary: 'text-gray-600 dark:text-gray-300',
    tertiary: 'text-gray-500 dark:text-gray-400',
    quaternary: 'text-gray-400 dark:text-gray-500',
  },
  accent: {
    primary: 'text-teal-600 dark:text-teal-400',
    primaryBg: 'bg-teal-600 hover:bg-teal-700 text-white',
    primarySubtle: 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300',
  },
};
