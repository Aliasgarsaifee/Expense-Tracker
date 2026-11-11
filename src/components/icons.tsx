import type { ReactNode } from 'react'

type IconProps = { size?: number }

// One stroke style for every interface glyph, so icons share a weight and
// take their colour from the surrounding text. Emoji are reserved for
// category and payment marks. Where CSS sizes the svg (tab bar, menu button)
// it overrides the width/height attributes, so `size` is only a default.
function Icon({ size = 24, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15M4.5 12h11.5M4.5 17h15" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </Icon>
  )
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 3.5h11v16.4l-2.2-1.5-2.1 1.5-1.2-.9-1.2.9-2.1-1.5-2.2 1.5z" />
      <path d="M9.4 8h5.2M9.4 11.2h5.2M9.4 14.4h3" />
    </Icon>
  )
}

export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.5 19.5v-6M12 19.5V4.5M18.5 19.5v-10" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </Icon>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15M7.5 12h9M10.5 17h3" />
    </Icon>
  )
}

export function SortIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 19V5M4.5 8.5L8 5l3.5 3.5" />
      <path d="M16 5v14M12.5 15.5L16 19l3.5-3.5" />
    </Icon>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
    </Icon>
  )
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  )
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  )
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5" />
    </Icon>
  )
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 17L17 7M8.5 7H17v8.5" />
    </Icon>
  )
}
