import { defaultColorForName } from './profileColors'

interface ProfileAvatarProps {
  name: string
  color?: string | null
  avatar?: string | null
  size?: number
  defaultLogo?: boolean
  className?: string
}

export default function ProfileAvatar({
  name,
  color,
  avatar,
  size = 24,
  defaultLogo = true,
  className = '',
}: ProfileAvatarProps): React.JSX.Element {
  const resolvedColor = color || defaultColorForName(name)
  const dimension = { width: size, height: size }

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`profile-avatar profile-avatar-img ${className}`}
        style={dimension}
      />
    )
  }

  return (
    <div
      className={`profile-avatar profile-avatar-letter ${className}`}
      style={{
        ...dimension,
        background: resolvedColor,
        fontSize: Math.round(size * 0.46),
      }}
      aria-label={name}
    >
      {(name.trim()[0] || '?').toUpperCase()}
    </div>
  )
}
