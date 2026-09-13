interface BrandLogoProps {
  provider?: string | null
  size?: number
  matchTheme?: boolean
  className?: string
}

export default function BrandLogo({
  provider = '?',
  size = 16,
  className = '',
}: BrandLogoProps): React.JSX.Element {
  const label = (provider || '?').toString().slice(0, 2).toUpperCase()
  return (
    <span
      className={`brand-logo-fallback ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.round(size * 0.5)),
      }}
      aria-hidden
    >
      {label}
    </span>
  )
}
