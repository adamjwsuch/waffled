import { useRef, useState } from 'react'
import { Icon } from '../../kiosk/icons'
import { MOBILE_CARD_LABELS, moveCard } from './todayOrder'

/** Customize Today — the phone's version of the app's CustomizeTodaySheet.
 *
 *  TodayView.swift presents this from the slider button in the header: a list of the cards,
 *  drag to reorder, toggle to show or hide, a scope picker for whoever may edit the family
 *  default ("Just me" / "Everyone"), Save, Cancel, and Reset. The phone draws five of the
 *  app's ten cards, so the list holds those five; the arrangement is folded back into the
 *  full saved order by the caller (mergeOrder), which keeps the other five where they are.
 *
 *  The drag is a pointer drag on the grabber — the touch gesture the app has — and the same
 *  grabber is a real button: with a keyboard, ArrowUp/ArrowDown move a card, so reordering
 *  is not gesture-only. */

export interface CustomizeSheetProps {
  order: string[]
  hidden: string[]
  canEditFamily: boolean
  source: 'family' | 'user' | 'default'
  busy?: boolean
  error?: boolean
  onSave: (scope: 'family' | 'user', order: string[], hidden: string[]) => void
  onReset: (scope: 'family' | 'user') => void
  onClose: () => void
}

export function CustomizeSheet({
  order,
  hidden,
  canEditFamily,
  source,
  busy = false,
  error = false,
  onSave,
  onReset,
  onClose,
}: CustomizeSheetProps) {
  const [rows, setRows] = useState(order)
  const [off, setOff] = useState(() => new Set(hidden))
  const [scope, setScope] = useState<'family' | 'user'>(canEditFamily && source === 'family' ? 'family' : 'user')
  const drag = useRef<number | null>(null)

  const move = (from: number, to: number) => setRows((r) => moveCard(r, from, to))

  function reorder(from: number, to: number) {
    if (to < 0 || to >= rows.length) return
    move(from, to)
  }

  function onHandleDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    drag.current = index
    e.currentTarget.setPointerCapture?.(e.pointerId)
    // Keep the page from scrolling under the finger while the card is being dragged.
    e.preventDefault()
  }

  function onHandleMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (drag.current === null) return
    const under = document.elementFromPoint?.(e.clientX, e.clientY)?.closest('[data-sheet-index]')
    const to = Number(under?.getAttribute('data-sheet-index'))
    if (!Number.isNaN(to) && to !== drag.current) {
      const from = drag.current
      drag.current = to
      move(from, to)
    }
  }

  function onHandleUp(e: React.PointerEvent<HTMLButtonElement>) {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  function toggle(key: string) {
    setOff((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="p-cust-scrim" role="presentation" onClick={onClose}>
      <div
        className="p-cust"
        role="dialog"
        aria-modal="true"
        aria-label="Customize Today"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-cust-top">
          <button type="button" className="p-cust-act" onClick={onClose}>
            Cancel
          </button>
          <span className="p-cust-title">Customize Today</span>
          <button
            type="button"
            className="p-cust-act is-save"
            disabled={busy}
            onClick={() => onSave(scope, rows, [...off])}
          >
            Save
          </button>
        </div>

        {canEditFamily && (
          <div className="p-cust-scope">
            <div className="p-seg" role="radiogroup" aria-label="Who this layout applies to">
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'user'}
                className={scope === 'user' ? 'p-seg-on' : undefined}
                onClick={() => setScope('user')}
              >
                Just me
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={scope === 'family'}
                className={scope === 'family' ? 'p-seg-on' : undefined}
                onClick={() => setScope('family')}
              >
                Everyone
              </button>
            </div>
            <p className="p-cust-foot">
              {scope === 'family'
                ? "This becomes the default everybody sees on their phone, until they customize their own."
                : 'Only your phone changes. Everyone else keeps their own Today.'}
            </p>
          </div>
        )}

        <p className="p-cust-hint">Drag to reorder · toggle to show or hide</p>

        <ul className="p-cust-list">
          {rows.map((key, index) => {
            const visible = !off.has(key)
            return (
              <li key={key} className="p-cust-row" data-sheet-index={index} data-card={key}>
                <button
                  type="button"
                  className="p-cust-grab"
                  aria-label={`Reorder ${MOBILE_CARD_LABELS[key] ?? key}`}
                  onPointerDown={(e) => onHandleDown(e, index)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      reorder(index, index - 1)
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      reorder(index, index + 1)
                    }
                  }}
                >
                  <Icon name="grip" />
                </button>
                <span className="p-cust-name">{MOBILE_CARD_LABELS[key] ?? key}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={visible}
                  aria-label={MOBILE_CARD_LABELS[key] ?? key}
                  className={visible ? 'p-sw is-on' : 'p-sw'}
                  onClick={() => toggle(key)}
                >
                  <span className="p-sw-knob" />
                </button>
              </li>
            )
          })}
        </ul>

        {error && <p className="p-cust-err">That did not save. Try again.</p>}

        <button
          type="button"
          className="p-cust-reset"
          disabled={busy}
          onClick={() => onReset(scope)}
        >
          {scope === 'family' ? 'Reset everyone to default' : 'Reset to default'}
        </button>
      </div>
    </div>
  )
}
