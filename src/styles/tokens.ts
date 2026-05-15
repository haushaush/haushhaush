/**
 * Design Tokens — single source of truth for the Apple-style design system.
 *
 * Used both by `tailwind.config.ts` (for shadow extension) and directly imported
 * by components that need raw values.
 *
 * NOTE: We intentionally do NOT override Tailwind's `borderRadius` scale here,
 * because shadcn primitives rely on the existing `lg/md/sm` mapping to
 * `var(--radius)`. Components should use Tailwind's existing
 * `rounded-xl` (12px), `rounded-2xl` (16px), `rounded-full` directly.
 */

export const tokens = {
  /** Border radius scale — matches Tailwind defaults, documented for consistency. */
  radius: {
    sm: '0.5rem',    // 8px  — chips
    md: '0.75rem',   // 12px — buttons, inputs
    lg: '1rem',      // 16px — small cards
    xl: '1.25rem',   // 20px — hero cards (note: Tailwind's rounded-xl = 0.75rem, use rounded-2xl instead)
    '2xl': '1rem',   // 16px — Tailwind's rounded-2xl — primary card radius
    full: '9999px',  // pills, badges
  },

  /** 4px-based spacing scale. */
  space: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
    '3xl': '4rem',
  },

  /** Apple-soft shadow stack. Injected into tailwind.config.ts via `boxShadow`. */
  shadow: {
    'apple-sm': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
    'apple-md': '0 4px 12px -2px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
    'apple-lg': '0 12px 32px -8px rgb(0 0 0 / 0.10), 0 4px 8px -4px rgb(0 0 0 / 0.06)',
    'apple-hover': '0 8px 24px -6px rgb(0 0 0 / 0.10), 0 4px 8px -4px rgb(0 0 0 / 0.06)',
  },

  /** Typography helper class strings. */
  text: {
    eyebrow: 'text-[11px] font-bold uppercase tracking-[0.08em]',
    body: 'text-sm font-medium',
    bodyLg: 'text-base font-medium',
    title: 'text-lg font-extrabold tracking-tight leading-tight',
    titleLg: 'text-2xl font-extrabold tracking-tight leading-tight',
    display: 'text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]',
    displayLg: 'text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]',
  },

  /** Apple-typical motion presets. */
  motion: {
    fast: 'transition-all duration-150 ease-out',
    base: 'transition-all duration-200 ease-out',
    smooth: 'transition-all duration-300 ease-out',
  },
};
