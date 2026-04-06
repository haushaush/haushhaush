import { useARIA } from '@/contexts/ARIAContext';

export function ARIAGlow() {
  const { isOpen } = useARIA();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[99999] transition-opacity duration-300"
      style={{
        border: '2px solid transparent',
        backgroundImage: `
          linear-gradient(hsl(var(--background)), hsl(var(--background))) padding-box,
          linear-gradient(90deg, hsl(174 90% 31%), hsl(180 80% 45%), hsl(185 100% 50%), hsl(180 80% 45%), hsl(174 90% 31%)) border-box
        `,
        backgroundSize: '100% 100%, 300% 300%',
        animation: 'ariaGlow 3s linear infinite',
        boxShadow: 'inset 0 0 60px hsla(174, 90%, 31%, 0.08), 0 0 30px hsla(174, 90%, 31%, 0.15)',
      }}
    />
  );
}
