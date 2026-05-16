// Backward-compat shim — use ./Logo for new code.
import Logo from './Logo'

export default function FoodOSLogo({ size = 32, style, rounded, ...rest }) {
  return <Logo size={size} style={style} {...rest} />
}
