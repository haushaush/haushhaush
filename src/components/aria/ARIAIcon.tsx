export function ARIAIcon({ size = 20, animated = false, white = false }: { size?: number; animated?: boolean; white?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={animated ? { animation: 'ariaIconSpin 8s linear infinite' } : {}}
    >
      {!white && (
        <defs>
          <linearGradient id="ariaIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0A9396" />
            <stop offset="50%" stopColor="#0BC2C6" />
            <stop offset="100%" stopColor="#00E5FF" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2 C12 2 13.5 8 12 12 C10.5 8 12 2 12 2Z
           M22 12 C22 12 16 13.5 12 12 C16 10.5 22 12 22 12Z
           M12 22 C12 22 10.5 16 12 12 C13.5 16 12 22 12 22Z
           M2 12 C2 12 8 10.5 12 12 C8 13.5 2 12 2 12Z"
        fill={white ? 'white' : 'url(#ariaIconGrad)'}
      />
      <path
        d="M12 4.5 C12 4.5 13 8.5 12 12 C11 8.5 12 4.5 12 4.5Z
           M19.5 12 C19.5 12 15.5 13 12 12 C15.5 11 19.5 12 19.5 12Z
           M12 19.5 C12 19.5 11 15.5 12 12 C13 15.5 12 19.5 12 19.5Z
           M4.5 12 C4.5 12 8.5 11 12 12 C8.5 13 4.5 12 4.5 12Z"
        fill={white ? 'white' : 'url(#ariaIconGrad)'}
        opacity="0.5"
        transform="rotate(45 12 12)"
      />
    </svg>
  );
}
