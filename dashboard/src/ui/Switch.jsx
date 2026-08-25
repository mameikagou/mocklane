export function Switch({ checked, onChange, disabled = false, label }) {
  return <label className={`switch ${disabled ? 'is-disabled' : ''}`} title={label}><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="switch-track"><span className="switch-thumb" /></span><span className="sr-only">{label}</span></label>;
}
