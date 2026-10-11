import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerListDetail, PlannerLists } from './PlannerLists'

// The real Lists screen. Before this, both the Today card's header and the tab bar's
// "Lists" destination rendered the kiosk's Lists component unmodified — which
// auto-selects and opens the grocery list the instant lists load (a convenience that
// only makes sense next to the kiosk's always-visible sidebar). On the phone that
// meant "Lists" never showed anything but grocery. These are the index + a routed
// detail (grocery hands off whole to the real GroceryBoard; everything else gets a
// lighter, phone-native sectioned list).

const person = { id: 'p1', name: 'Alex', avatarEmoji: '🦊', colorHex: '#2F7FED', capabilities: [] }

type L = { id: string; name: string; emoji: string | null; listType: string; isAutoBuilt: boolean; sortMode: string; itemCount: number }

let lists: L[] = []
let templates: L[] = []
let listItems: Record<string, Array<Record<string, unknown>>> = {}
let deletedIds: string[] = []
let checkedIds: string[] = []
let addedNames: string[] = []

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>()
  return {
    ...actual,
    useLists: () => ({ lists, loading: false, error: false, refetch: () => {} }),
    useTemplates: () => ({ templates, loading: false, error: false, refetch: () => {} }),
    useListDetail: (id: string | null) => ({
      items: id ? listItems[id] ?? [] : [],
      loading: false,
      error: false,
      setItems: () => {},
      refetch: () => {},
    }),
    usePersons: () => ({ persons: [person], loading: false, refetch: () => {} }),
    groceryApi: {
      ...actual.groceryApi,
      deleteList: (id: string) => {
        deletedIds.push(id)
        return Promise.resolve()
      },
      patchListItem: (id: string, patch: Record<string, unknown>) => {
        if (patch.checked) checkedIds.push(id)
        return Promise.resolve({ item: {} })
      },
      deleteItem: (id: string) => {
        deletedIds.push(id)
        return Promise.resolve()
      },
      addListItem: (_listId: string, input: { name: string }) => {
        addedNames.push(input.name)
        return Promise.resolve({ item: {} })
      },
      createList: (input: { name: string; emoji?: string | null }) =>
        Promise.resolve({ list: { id: 'new1', name: input.name, emoji: input.emoji ?? null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 } }),
    },
  }
})

// GroceryBoard pulls in its own data hooks (useGroceryBoard, mealBuilderApi, …) that
// belong to a different test file; it only needs to prove PlannerListDetail hands off
// to it, with a real back control, for a grocery-type list.
vi.mock('../../kiosk/components/GroceryBoard', () => ({
  GroceryBoard: ({ onBack }: { onBack: () => void }) => (
    <div>
      <button type="button" onClick={onBack}>
        mock back
      </button>
      Grocery board
    </div>
  ),
}))

function wrapAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/planner/lists" element={<PlannerLists />} />
        <Route path="/planner/lists/:id" element={<PlannerListDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  lists = []
  templates = []
  listItems = {}
  deletedIds = []
  checkedIds = []
  addedNames = []
})

describe('PlannerLists (index)', () => {
  it('shows the empty state when there are no lists', () => {
    wrapAt('/planner/lists')
    expect(screen.getByText(/No lists yet/)).toBeTruthy()
  })

  it('lists every list with its item count, and opens the one you tap', () => {
    lists = [
      { id: 'l1', name: 'Hardware run', emoji: '🔧', listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 2 },
      { id: 'l2', name: 'Groceries', emoji: null, listType: 'grocery', isAutoBuilt: true, sortMode: 'manual', itemCount: 4 },
    ]
    wrapAt('/planner/lists')
    expect(screen.getByText('Hardware run')).toBeTruthy()
    expect(screen.getByText('Groceries')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    fireEvent.click(screen.getByText('Hardware run'))
    // navigated past the index into the tapped list's own detail
    expect(screen.getByPlaceholderText('Add to Hardware run…')).toBeTruthy()
  })

  it('shows templates in their own group', () => {
    lists = [{ id: 'l1', name: 'Hardware run', emoji: null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 }]
    templates = [{ id: 't1', name: 'Camping', emoji: '🏕️', listType: 'template', isAutoBuilt: false, sortMode: 'manual', itemCount: 6 }]
    wrapAt('/planner/lists')
    expect(screen.getByText('Templates')).toBeTruthy()
    expect(screen.getByText('Camping')).toBeTruthy()
  })
})

describe('PlannerListDetail', () => {
  it('hands off whole to the grocery board for the grocery list, under its own header', () => {
    lists = [{ id: 'l1', name: 'Groceries', emoji: null, listType: 'grocery', isAutoBuilt: true, sortMode: 'manual', itemCount: 0 }]
    wrapAt('/planner/lists/l1')
    expect(screen.getByText('Grocery board')).toBeTruthy()
    // GroceryBoard's own back button registers into a kiosk-only topbar slot that
    // never renders in the planner — this screen supplies a real one of its own.
    expect(screen.getByText('🛒 Groceries')).toBeTruthy()
    fireEvent.click(screen.getByText('Lists'))
    expect(screen.queryByText('Grocery board')).toBeNull()
    expect(screen.getByText('Groceries')).toBeTruthy()
  })

  it('shows a custom list sectioned, and lets you check an item off', async () => {
    lists = [{ id: 'l1', name: 'Hardware run', emoji: '🔧', listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 1 }]
    listItems.l1 = [{ id: 'i1', name: 'Wood screws', quantity: '20', checked: false, section: null, assignee: null, sortOrder: null, checkedAt: null }]
    wrapAt('/planner/lists/l1')
    expect(screen.getByText('🔧 Hardware run')).toBeTruthy()
    expect(screen.getByText('Wood screws')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Check Wood screws'))
    await waitFor(() => expect(checkedIds).toEqual(['i1']))
  })

  it('adds a typed item to the list', async () => {
    lists = [{ id: 'l1', name: 'Hardware run', emoji: null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 }]
    wrapAt('/planner/lists/l1')
    fireEvent.change(screen.getByPlaceholderText('Add to Hardware run…'), { target: { value: 'Sandpaper' } })
    fireEvent.click(screen.getByLabelText('Add item'))
    await waitFor(() => expect(addedNames).toEqual(['Sandpaper']))
  })

  it('deletes the list from its ⋯ menu, after confirming', async () => {
    lists = [{ id: 'l1', name: 'Hardware run', emoji: null, listType: 'custom', isAutoBuilt: false, sortMode: 'manual', itemCount: 0 }]
    wrapAt('/planner/lists/l1')
    fireEvent.click(screen.getByLabelText('List options'))
    fireEvent.click(screen.getByText('Delete list'))
    fireEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(deletedIds).toEqual(['l1']))
  })
})
