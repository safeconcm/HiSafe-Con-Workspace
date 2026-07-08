// src/components/auth/CitySkyline.tsx
// Layered city skyline + tower crane silhouette for the auth hero scene.
// Extracted from login/page.tsx for maintainability — visuals unchanged
// except the window highlights, which now use the single amber accent
// color consistently with the rest of the redesigned login card.

export function CitySkyline({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 320" preserveAspectRatio="xMidYMax slice" fill="none" className={className}>
      {/* back layer — faint, distant buildings */}
      <g fill="rgba(99,130,180,0.20)">
        <rect x="0"   y="150" width="70"  height="170" />
        <rect x="80"  y="110" width="55"  height="210" />
        <rect x="150" y="170" width="90"  height="150" />
        <rect x="640" y="130" width="60"  height="190" />
        <rect x="715" y="165" width="100" height="155" />
        <rect x="830" y="100" width="65"  height="220" />
        <rect x="905" y="160" width="95"  height="160" />
      </g>
      {/* mid layer */}
      <g fill="rgba(45,66,102,0.50)">
        <rect x="30"  y="190" width="80"  height="130" />
        <rect x="120" y="140" width="50"  height="180" />
        <rect x="185" y="205" width="65"  height="115" />
        <rect x="600" y="175" width="70"  height="145" />
        <rect x="690" y="120" width="55"  height="200" />
        <rect x="765" y="200" width="80"  height="120" />
        <rect x="860" y="150" width="60"  height="170" />
      </g>
      {/* front layer — near-black, largest shapes, blends into bg */}
      <g fill="#0a0f1a">
        <rect x="0"   y="230" width="120" height="90" />
        <rect x="140" y="255" width="80"  height="65" />
        <rect x="240" y="215" width="60"  height="105" rx="2" />
        <rect x="256" y="195" width="28"  height="24" />
        <polygon points="256,195 270,175 284,195" />
        <rect x="560" y="240" width="100" height="80" />
        <rect x="720" y="260" width="90"  height="60" />
        <rect x="840" y="220" width="70"  height="100" />
        <rect x="900" y="250" width="100" height="70" />
      </g>
      {/* windows on front-layer buildings — single accent color (amber) */}
      <g fill="rgba(251,191,36,0.30)">
        {Array.from({ length: 5 }).map((_, r) =>
          Array.from({ length: 6 }).map((_, c) => (
            <rect key={`${r}-${c}`} x={12 + c * 17} y={244 + r * 14} width="6" height="8" />
          ))
        )}
      </g>
      {/* tower crane, right of center — amber accent, drawn on once at load */}
      <g stroke="rgba(251,191,36,0.75)" strokeWidth="2.5" strokeLinecap="round">
        <path className="animate-dash" d="M430 320 L430 60" />
        <path className="animate-dash" style={{ animationDelay: '.15s' }} d="M430 70 L340 70" />
        <path className="animate-dash" style={{ animationDelay: '.3s' }} d="M430 70 L520 78" />
        <path className="animate-dash" style={{ animationDelay: '.45s' }} d="M430 100 L400 60 L460 60 Z" />
        <path d="M355 70 L355 95" strokeWidth="1.8" opacity="0.6" />
      </g>
      <circle cx="430" cy="70" r="4" fill="rgba(251,191,36,0.8)" />
      <g stroke="rgba(148,163,184,0.3)" strokeWidth="1">
        <line x1="0" y1="320" x2="1000" y2="320" />
      </g>
    </svg>
  )
}
