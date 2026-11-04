export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#0f2a5c" />
        <path d="M13 8h6v5h5v6h-5v5h-6v-5H8v-6h5z" fill="#13a08d" />
        <path d="M13 13h6v6h-6z" fill="#fff" />
      </svg>
      <div className="leading-tight">
        <p className="text-[13px] font-bold tracking-wide text-ink">TEC THA</p>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-teal-700">HEALTHCARE</p>
      </div>
    </div>
  );
}
