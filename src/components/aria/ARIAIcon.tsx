export function ARIAIcon({ size = 36, animated = false, white = false }: { size?: number; animated?: boolean; white?: boolean }) {
  const fillColor = white ? '#FFFFFF' : '#0BC2C6';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={animated ? { animation: 'ariaIconSpin 8s linear infinite' } : {}}
    >
      <path d="M50 5 L58 38 L50 45 L42 38 Z" fill={fillColor} />
      <path d="M50 95 L58 62 L50 55 L42 62 Z" fill={fillColor} />
      <path d="M5 50 L38 42 L45 50 L38 58 Z" fill={fillColor} />
      <path d="M95 50 L62 42 L55 50 L62 58 Z" fill={fillColor} />
      <path d="M18 18 L36 36 L30 42 L14 28 Z" fill={fillColor} opacity="0.85" />
      <path d="M82 18 L64 36 L70 42 L86 28 Z" fill={fillColor} opacity="0.85" />
      <path d="M18 82 L36 64 L30 58 L14 72 Z" fill={fillColor} opacity="0.85" />
      <path d="M82 82 L64 64 L70 58 L86 72 Z" fill={fillColor} opacity="0.85" />
    </svg>
  );
}
