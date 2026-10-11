import type { CSSProperties, ReactNode } from 'react'
import '../../styles/planner-cards.css'

// The phone's card kit — the React half of the iOS design system (`DesignSystem/Components.swift`),
// not a second design system: same tokens as `styles/waffled.css`, same numbers as the SwiftUI
// originals. Every number here is traceable to a line of Swift; where a value differs from the
// kiosk's, that is because the phone's does (a 15pt row title, not the kiosk's 17pt).
//
// Kept separate from `planner.css` (the shell) so any phone screen can use the kit by importing
// this module, and so the shell's geometry stays readable next to the tab bar it belongs to.

/** `WaffledCard` — white, radius `--r-lg` (22), shadow 1. Kiosk cards are the same surface, so a
 *  phone row group and a kiosk card read as the same material. */
export function PhoneCard({
  children,
  padding = 16,
  className = '',
  style,
}: {
  children: ReactNode
  padding?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={`p-card${className ? ` ${className}` : ''}`} style={{ padding, ...style }}>
      {children}
    </div>
  )
}

/** A card's header row: bold title, optional meta + chevron on the right (TodayView's agenda
 *  header), or an sm-size title with an action (CountdownsCard's "Countdowns … + Add"). */
export function CardHead({
  title,
  meta,
  chevron = false,
  action,
  size = 'lg',
  onClick,
}: {
  title: string
  meta?: string
  chevron?: boolean
  action?: ReactNode
  size?: 'lg' | 'sm'
  onClick?: () => void
}) {
  const inner = (
    <>
      <span className={`p-head-title${size === 'sm' ? ' p-head-title-sm' : ''}`}>{title}</span>
      <span className="p-head-gap" />
      {meta ? <span className="p-head-meta">{meta}</span> : null}
      {chevron ? (
        <svg viewBox="0 0 24 24" className="p-chev" aria-hidden="true">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {action}
    </>
  )
  // A header that goes somewhere is a button; one that doesn't is a plain row, so the
  // phone doesn't advertise a target it can't reach.
  return onClick ? (
    <button type="button" className="p-head" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="p-head">{inner}</div>
  )
}

/** `Avatar` — an emoji in a circular tint. A member's own colour, at the same 16% the app uses
 *  for `colorHex` tints; no colour at all falls back to `--panel`. */
export function PhoneAvatar({
  emoji,
  colorHex,
  size = 34,
  className = '',
}: {
  emoji: string | null | undefined
  colorHex?: string | null
  size?: number
  className?: string
}) {
  const tint = colorHex ? `${colorHex}29` : 'var(--panel)' // 0x29 ≈ 16% alpha
  return (
    <span
      className={`p-av${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, background: tint, fontSize: Math.round(size * 0.52) }}
      aria-hidden="true"
    >
      {emoji || '🙂'}
    </span>
  )
}

/** `WaffledEmojiTile` at the countdown row's scale: a 32pt square, radius 9, tinted. */
export function EmojiTile({
  emoji,
  size = 32,
  radius = 9,
  colorHex,
}: {
  emoji: string | null | undefined
  size?: number
  radius?: number
  colorHex?: string | null
}) {
  return (
    <span
      className="p-tile"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: colorHex ? `${colorHex}29` : 'var(--panel)',
        fontSize: Math.round(size * 0.53),
      }}
      aria-hidden="true"
    >
      {emoji || '📅'}
    </span>
  )
}

/** `SectionLabel` — uppercase, 12.5 heavy, tracked, ink3. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="p-section-label">{children}</div>
}

/** `Pill` — a rounded chip: 12 semibold, panel fill, ink2 text. */
export function PhonePill({ children }: { children: ReactNode }) {
  return <span className="p-pill">{children}</span>
}

/** The 1pt rule the app draws between rows (`WF.hair2`), never around them. */
export function Hair() {
  return <div className="p-hair" aria-hidden="true" />
}

/** `ProgressBar` — a 6pt track, matching the chores card on Today. */
export function ProgressBar({ value, tint = 'var(--primary)' }: { value: number; tint?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className="p-progress" role="presentation">
      <div className="p-progress-fill" style={{ width: `${pct}%`, background: tint }} />
    </div>
  )
}
