export default function TabBar({ active, onChange }) {
  const tabs = [
    { id: 'saved', label: 'Saved Places' },
    { id: 'scan', label: 'Quick Scan' },
  ]

  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`tab-bar__tab ${active === tab.id ? 'tab-bar__tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}