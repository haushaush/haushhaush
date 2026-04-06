export function ARIAIcon({ size = 28, animated = false, white = false }: { size?: number; animated?: boolean; white?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={animated ? { animation: 'ariaIconSpin 8s linear infinite' } : {}}
    >
      {!white && (
        <defs>
          <linearGradient id="ariaIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0BC2C6" />
            <stop offset="50%" stopColor="#0A9396" />
            <stop offset="100%" stopColor="#00E5FF" />
          </linearGradient>
        </defs>
      )}
      {/* Outer ring — top loop */}
      <path
        d="M50 8 C65 8, 78 18, 82 32 C86 46, 80 58, 70 65 C80 70, 88 82, 84 94 C82 98, 76 100, 70 98"
        stroke={white ? 'white' : 'url(#ariaIconGrad)'}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Inner weaving path */}
      <path
        d="M50 8 C35 8, 22 18, 18 32 C14 46, 20 58, 30 65 C20 70, 12 82, 16 94 C18 98, 24 100, 30 98"
        stroke={white ? 'white' : 'url(#ariaIconGrad)'}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Crossing horizontal band */}
      <path
        d="M18 32 C30 28, 42 30, 50 35 C58 30, 70 28, 82 32"
        stroke={white ? 'white' : 'url(#ariaIconGrad)'}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 68 C28 64, 42 66, 50 71 C58 66, 72 64, 84 68"
        stroke={white ? 'white' : 'url(#ariaIconGrad)'}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      {/* Bottom closing arc */}
      <path
        d="M30 98 C38 96, 44 92, 50 92 C56 92, 62 96, 70 98"
        stroke={white ? 'white' : 'url(#ariaIconGrad)'}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
