import { useState } from 'react'

export default function LocationInput({ onAdd }) {
  const [value, setValue] = useState('')

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <div className="location-input">
      <input
        type="text"
        className="location-input__field"
        placeholder="Add a place — e.g. Mount Hood, Oregon"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        className="location-input__button"
        onClick={handleSubmit}
        disabled={!value.trim()}
        aria-label="Add location"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}