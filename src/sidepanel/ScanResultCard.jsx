/**
 * A destination Claude found on the current page. Shares the LocationCard
 * silhouette, but the accent-colored pin marks it as AI-extracted rather than
 * saved, and it carries a Save action instead of Delete.
 */
export default function ScanResultCard({ location, onSave }) {
  const meta = [location.region, location.country].filter(Boolean).join(', ')

  return (
    <div
      className="location-card scan-result-card"
      title={location.notability || undefined}
    >
      <div className="location-card__pin" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6.5-8 12-8 12s-8-5.5-8-12a8 8 0 0 1 16 0z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </div>

      <div className="scan-result-card__text">
        <span className="location-card__name">{location.name}</span>
        {meta && <span className="scan-result-card__meta">{meta}</span>}
      </div>

      <button
        className="location-card__delete scan-result-card__save"
        onClick={() => onSave(location)}
        aria-label={`Save ${location.name}`}
        title={`Save ${location.name}`}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  )
}
