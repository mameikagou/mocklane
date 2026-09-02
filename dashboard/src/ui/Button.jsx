// Class names must stay literal: the Tailwind purge scanner only sees strings
// that appear verbatim in source, so `button-${variant}` would lose variants.
const VARIANTS = {
  secondary: 'button-secondary',
  ghost: 'button-ghost',
};

export function Button({ children, variant = 'secondary', className = '', ...props }) {
  return <button className={`button ${VARIANTS[variant] || VARIANTS.secondary} ${className}`} type="button" {...props}>{children}</button>;
}
