/**
 * The MarkDN mark: three stacked rules, the top one marked in signal red.
 *
 * It encodes what the product does rather than decorating around it — blocks of a
 * document with the active one indexed, which is the same idea the sync rail draws
 * between the panes. Geometry only, so it survives 16px in a tab and 1024px in an
 * app icon without a second drawing.
 */
export function Wordmark({ size = 18 }: { size?: number }) {
  return (
    <span className="wordmark">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="wordmark__mark"
      >
        <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="2.25" className="wordmark__frame" />
        <rect x="5" y="7" width="14" height="2.5" rx="0.5" className="wordmark__rule-active" />
        <rect x="5" y="11.75" width="9" height="2" rx="0.5" className="wordmark__rule" />
        <rect x="5" y="15.5" width="11" height="2" rx="0.5" className="wordmark__rule" />
      </svg>
      <span className="wordmark__text">
        Mark<span className="wordmark__text-dn">DN</span>
      </span>
    </span>
  );
}
