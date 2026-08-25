export function Select({ value, options, onChange, ariaLabel }) {
  return <select className="select-control" value={value} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>;
}
