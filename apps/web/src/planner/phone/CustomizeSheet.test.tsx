import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CustomizeSheet } from './CustomizeSheet'

// The sheet is the app's CustomizeTodaySheet on the phone: drag to reorder, toggle to show
// or hide, a scope picker for whoever may edit the family default, Save, Cancel and Reset.
// The phone draws five of the app's ten cards, so the list holds those five — the caller
// folds the arrangement back into the full order (see mergeOrder).

const ORDER = ['agenda', 'countdowns', 'tonight', 'chores', 'grocery']

function setup(over: Partial<React.ComponentProps<typeof CustomizeSheet>> = {}) {
  const onSave = vi.fn()
  const onReset = vi.fn()
  const onClose = vi.fn()
  const props = { order: ORDER, hidden: [], canEditFamily: false, source: 'default' as const, onSave, onReset, onClose, ...over }
  render(<CustomizeSheet {...props} />)
  return { onSave, onReset, onClose }
}

const rowOrder = () => [...document.querySelectorAll('[data-sheet-index]')].map((el) => el.getAttribute('data-card'))

describe('CustomizeSheet', () => {
  it('lists the cards in the saved order, with a switch per card', () => {
    setup({ hidden: ['tonight'] })
    expect(rowOrder()).toEqual(ORDER)
    expect(screen.getByRole('switch', { name: 'Agenda' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: "Tonight's dinner" })).toHaveAttribute('aria-checked', 'false')
  })

  it('names the cards the way the app names them', () => {
    setup()
    for (const label of ['Agenda', 'Countdowns', "Tonight's dinner", 'Chores', 'Grocery']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('saves the arrangement and the cards switched off', () => {
    const { onSave } = setup()
    fireEvent.click(screen.getByRole('switch', { name: 'Countdowns' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('user', ORDER, ['countdowns'])
  })

  it('cancels without saving', () => {
    const { onSave, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reorders with the grabber and a keyboard', () => {
    setup()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Agenda' }), { key: 'ArrowDown' })
    expect(rowOrder()).toEqual(['countdowns', 'agenda', 'tonight', 'chores', 'grocery'])
    fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder Agenda' }), { key: 'ArrowUp' })
    expect(rowOrder()).toEqual(ORDER)
  })

  it('reorders with a drag on the grabber', () => {
    setup()
    const grab = screen.getByRole('button', { name: 'Reorder Agenda' })
    // What the finger is over while dragging: the row for Tonight's dinner.
    document.elementFromPoint = vi.fn(() => document.querySelector('[data-card="tonight"]')) as unknown as typeof document.elementFromPoint
    fireEvent.pointerDown(grab, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(grab, { pointerId: 1, clientX: 10, clientY: 120 })
    fireEvent.pointerUp(grab, { pointerId: 1 })
    expect(rowOrder()).toEqual(['countdowns', 'tonight', 'agenda', 'chores', 'grocery'])
  })

  it('hides the scope picker from someone who may not edit the family default', () => {
    setup({ canEditFamily: false })
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument()
  })

  it('saves to the family layout when Everyone is chosen', () => {
    const { onSave } = setup({ canEditFamily: true })
    fireEvent.click(screen.getByRole('radio', { name: 'Everyone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith('family', ORDER, [])
  })

  it('says what the family scope means, and what reset will reset', () => {
    setup({ canEditFamily: true, source: 'family' })
    expect(screen.getByRole('radio', { name: 'Everyone' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Just me' }))
    expect(screen.getByText('Only your phone changes. Everyone else keeps their own Today.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Everyone' }))
    expect(screen.getByRole('button', { name: 'Reset everyone to default' })).toBeInTheDocument()
  })

  it('resets the scope it is showing', () => {
    const { onReset } = setup({ canEditFamily: true, source: 'family' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset everyone to default' }))
    expect(onReset).toHaveBeenCalledWith('family')
  })

  it('will not save twice while a save is in flight', () => {
    const { onSave } = setup({ busy: true })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('says so when the save did not stick', () => {
    setup({ error: true })
    expect(screen.getByText('That did not save. Try again.')).toBeInTheDocument()
  })
})
