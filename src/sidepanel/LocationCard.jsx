export default function LocationCard({ location, onDelete, onFocus }) {
  const hasCoords =
    typeof location.longitude === 'number' &&
    typeof location.latitude === 'number'

  return (
    <div
      className={`location-card${hasCoords ? ' location-card--clickable' : ''}`}
      onClick={hasCoords ? () => onFocus(location) : undefined}
      title={hasCoords ? `Fly to ${location.name}` : undefined}
    >
      <div className="location-card__pin" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 10c0 6.5-8 12-8 12s-8-5.5-8-12a8 8 0 0 1 16 0z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </div>
      <span className="location-card__name">{location.name}</span>
      <button
        className="location-card__delete"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(location.id)
        }}
        aria-label={`Delete ${location.name}`}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
