import { initials } from '../utils';

// Deterministic initials avatar. `size` in px.
export default function Avatar({ name = '', color = '#4F46E5', size = 36, className = '' }) {
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold select-none shrink-0 ${className}`}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.36), letterSpacing: 0 }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
