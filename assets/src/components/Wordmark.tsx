/**
 * The MarkDN mark: four lines meeting at one interchange ring.
 *
 * It is the product's idea in one drawing — documents are lines, and the place
 * you are reading is the station they meet at. Lines bend only at 45° and 90°,
 * as on the diagram it comes from, and it is geometry only, so it survives 16px
 * in a tab and 1024px in an app icon without a second drawing.
 */
export function Wordmark({ size = 22 }: { size?: number }) {
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
        <path className="wordmark__line wordmark__line--scarlet" d="M3 3l9 9" />
        <path className="wordmark__line wordmark__line--cobalt" d="M21 3l-9 9" />
        <path className="wordmark__line wordmark__line--amber" d="M12 12h9" />
        <path className="wordmark__line wordmark__line--green" d="M12 12v9" />
        <circle className="wordmark__ring" cx="12" cy="12" r="4" />
      </svg>
      <span className="wordmark__text">MarkDN</span>
    </span>
  );
}
