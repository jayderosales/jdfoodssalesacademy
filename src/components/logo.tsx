/** Placeholder mark in the brand colours. Replace with the real logo via Settings → Branding. */
export function Logo({ size = 32, src }: { size?: number; src?: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="JD Foods" width={size} height={size} className="rounded-lg object-contain" />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="JD Foods">
      <rect width="48" height="48" rx="12" fill="var(--brand-primary)" />
      <circle cx="38" cy="10" r="6" fill="var(--brand-accent)" />
      <text x="24" y="31" textAnchor="middle" fontSize="18" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
        JD
      </text>
    </svg>
  );
}
