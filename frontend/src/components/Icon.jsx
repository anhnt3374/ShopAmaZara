// Material Symbols Outlined wrapper. Pass `filled` for filled variant.
export default function Icon({ name, filled = false, className = '', size, style, ...rest }) {
  const merged = {
    ...style,
    ...(size ? { fontSize: typeof size === 'number' ? `${size}px` : size } : null),
    ...(filled ? { fontVariationSettings: "'FILL' 1" } : null),
  };
  return (
    <span className={`material-symbols-outlined ${className}`} style={merged} {...rest}>
      {name}
    </span>
  );
}
