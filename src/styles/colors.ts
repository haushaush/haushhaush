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
    primary: 'text-primary dark:text-accent-foreground',
    primaryBg: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    primarySubtle: 'bg-accent text-accent-foreground',
  },
};
