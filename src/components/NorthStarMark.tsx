export function NorthStarMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M12 1.5 13.9 9.2 21.5 11.1 13.9 13 12 20.6 10.1 13 2.5 11.1 10.1 9.2Z"
        fill="currentColor"
      />
      <circle cx="19.5" cy="4.5" r="1.1" fill="currentColor" opacity="0.55" />
      <circle cx="4.6" cy="18.4" r="0.8" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
