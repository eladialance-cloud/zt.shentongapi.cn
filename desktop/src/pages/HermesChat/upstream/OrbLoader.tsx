import type { CSSProperties } from 'react'

type OrbLoaderProps = {
  size?: number
  style?: CSSProperties
  invert?: boolean
  className?: string
  [key: string]: unknown
}

export function OrbLoader({
  size = 64,
  style,
  className,
  ...rest
}: OrbLoaderProps): React.JSX.Element {
  const dim = size != null ? { width: size, height: size, ...style } : style
  return (
    <div
      className={['orb-loader', className].filter(Boolean).join(' ')}
      style={dim}
      aria-hidden
      {...rest}
    >
      <span className="orb-loader-core" />
    </div>
  )
}

export default OrbLoader
