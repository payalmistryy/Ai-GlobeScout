/**
 * Minimal wireframe globe used as the app mark — replaces the emoji-style PNG
 * so the header reads as a product logo rather than a sticker.
 */
export default function GlobeMark({ className = '', size = 18 }) {
  return (
    <span className={`globe-mark ${className}`.trim()} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3.4 9h17.2M3.4 15h17.2" />
      </svg>
    </span>
  )
}
