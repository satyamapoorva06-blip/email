// Relay brand mark — matches the favicon (inline SVG, no asset needed).
export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#4F46E5" />
      <rect x="8.5" y="10.5" width="15" height="11.5" rx="2" stroke="#fff" strokeWidth="2" />
      <path d="M9.5 12l6.5 4.8L22.5 12" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
