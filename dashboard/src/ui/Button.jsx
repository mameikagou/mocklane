export function Button({ children, variant = 'secondary', className = '', ...props }) {
  return <button className={`button button-${variant} ${className}`} type="button" {...props}>{children}</button>;
}
