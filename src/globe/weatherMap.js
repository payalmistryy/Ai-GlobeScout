// WMO weather codes → emoji, per the product's locked-in mapping table.
const CODE_GROUPS = [
  { codes: [0], emoji: '🔆', label: 'Clear' },
  { codes: [1, 2, 3], emoji: '🌥️', label: 'Partly cloudy' },
  { codes: [45, 48], emoji: '🌫️', label: 'Fog' },
  { codes: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67], emoji: '☔️', label: 'Rain' },
  { codes: [71, 73, 75, 77], emoji: '☃️', label: 'Snow' },
  { codes: [80, 81, 82], emoji: '🌦️', label: 'Showers' },
  { codes: [85, 86], emoji: '🌨️', label: 'Snow showers' },
  { codes: [95, 96, 99], emoji: '⛈️', label: 'Thunderstorm' },
]

const UNKNOWN = { emoji: '🌡️', label: 'Unknown' }

// Sustained wind at or above this speaks louder than the sky does.
const WINDY_KMH = 30

/**
 * Map current conditions to the emoji and label shown under the temperature.
 * Wind overrides the icon but keeps the sky condition in the label, so
 * "Windy · partly cloudy" still says what it looks like out there.
 */
export function weatherEmojiAndLabel(weatherCode, windSpeedKmh) {
  const group = CODE_GROUPS.find((g) => g.codes.includes(weatherCode))
  const base = group ? { emoji: group.emoji, label: group.label } : UNKNOWN

  if (typeof windSpeedKmh === 'number' && windSpeedKmh >= WINDY_KMH) {
    return { emoji: '💨', label: `Windy · ${base.label.toLowerCase()}` }
  }

  return base
}
