export function ARIAIcon({ size = 32, animated = false, white = false }: { size?: number; animated?: boolean; white?: boolean }) {
  const gradId = `ariaGrad-${size}`;
  const stroke = white ? 'white' : `url(#${gradId})`;

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
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0BC2C6" />
            <stop offset="100%" stopColor="#0A9396" />
          </linearGradient>
        </defs>
      )}
      <path d="M50 50 C46 36, 36 26, 38 18 C40 10, 52 8, 56 16 C60 24, 54 36, 50 50Z" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 50 C61 41, 73 38, 78 30 C83 22, 77 12, 69 14 C61 16, 57 29, 50 50Z" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 50 C63 58, 70 70, 78 72 C86 74, 92 65, 88 58 C84 51, 71 52, 50 50Z" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 50 C54 64, 50 78, 56 84 C62 90, 72 86, 72 78 C72 70, 60 64, 50 50Z" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 50 C46 64, 40 78, 44 84 C48 90, 58 88, 58 80 C58 72, 50 64, 50 50Z" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 50 C37 64, 24 68, 22 76 C20 84, 28 90, 36 86 C44 82, 46 66, 50 50Z" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M50 50 C39 41, 28 36, 22 28 C16 20, 20 10, 28 10 C36 10, 43 24, 50 50Z" stroke={stroke} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
