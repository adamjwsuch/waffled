import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Icon } from '../../kiosk/icons'
import { ConfirmDialog } from '../../kiosk/components/ConfirmDialog'
import { GroceryBoard } from '../../kiosk/components/GroceryBoard'
import { ListItemModal } from '../../kiosk/components/ListItemModal'
import { ListsModal } from '../../kiosk/components/ListsModal'
import { groupBySection, partitionListItems } from '../../kiosk/Lists'
import {
  groceryApi,
  useLists,
  useListDetail,
  usePersons,
  useTemplates,
  type ListItem,
  type ListSummary,
  type Person,
} from '../../lib/api'
import '../../styles/planner-screens.css'
import { PLANNER_ROOT } from '../mode'
import { EmojiTile, Hair, PhoneCard } from './primitives'

/** ListsIndexView, in React: "Your lists" and "Templates" as two plain-row cards —
 *  tapping a row pushes into ListDetailView. This is the one screen both the Today
 *  Lists card's header and the tab bar's Lists destination land on; previously both
 *  rendered the kiosk's Lists screen unmodified, which auto-opens the grocery list
 *  the instant it loads (a convenience that only makes sense next to the kiosk's
 *  always-visible sidebar) — so neither ever showed the index at all. */
export function PlannerLists() {
  const { lists, loading, refetch } = useLists()
  const { templates } = useTemplates()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const open = (id: string) => navigate(`${PLANNER_ROOT}/lists/${id}`)

  return (
    <div className="planner-screen-body">
      <div className="p-pl-head">
        <h1>Lists</h1>
        <button type="button" aria-label="New list" onClick={() => setCreating(true)}>
          <Icon name="plus" />
        </button>
      </div>

      {loading && lists.length === 0 ? (
        <p className="p-empty">Loading…</p>
      ) : lists.length === 0 ? (
        <p className="p-empty">No lists yet. Add one with the + button.</p>
      ) : (
        <PhoneCard padding={4} className="p-pl-card">
          {lists.map((l, i) => (
            <ListRow key={l.id} list={l} first={i === 0} onClick={() => open(l.id)} />
          ))}
        </PhoneCard>
      )}

      {templates.length > 0 && (
        <>
          <span className="p-section-label p-pl-label">Templates</span>
          <PhoneCard padding={4} className="p-pl-card">
            {templates.map((t, i) => (
              <ListRow key={t.id} list={t} first={i === 0} onClick={() => open(t.id)} />
            ))}
          </PhoneCard>
        </>
      )}

      {creating && (
        <ListsModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            refetch()
            open(id)
          }}
        />
      )}
    </div>
  )
}

function ListRow({ list, first, onClick }: { list: ListSummary; first: boolean; onClick: () => void }) {
  return (
    <div>
      {!first && <Hair />}
      <button type="button" className="p-pl-row" onClick={onClick}>
        <EmojiTile emoji={list.emoji ?? (list.listType === 'template' ? '📑' : '📝')} />
        <span className="p-pl-name">{list.name}</span>
        <span className="p-pl-count">{list.itemCount}</span>
        <Icon name="cr" />
      </button>
    </div>
  )
}

/** ListDetailView, in React. Grocery is never a sectioned list on any surface — it
 *  takes over as the same auto-built board the kiosk opens (GroceryBoard itself,
 *  reused whole), so "Grocery" means one screen everywhere, not a phone copy that
 *  can drift from it. That board registers its own back/share buttons into the
 *  kiosk's topbar slot, which the planner never renders — so without a header of
 *  its own here, the board's content started flush at the very top of the screen
 *  with no way back to Lists at all. Share still isn't reachable from the phone. */
export function PlannerListDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { lists } = useLists()
  const { templates } = useTemplates()
  const list = lists.find((l) => l.id === id) ?? templates.find((t) => t.id === id) ?? null
  const { persons } = usePersons()
  const { items, loading, refetch } = useListDetail(id ?? null)

  const back = () => navigate(`${PLANNER_ROOT}/lists`)

  if (list?.listType === 'grocery') {
    return (
      <div className="planner-screen-body p-pld">
        <div className="p-pld-head">
          <button type="button" className="p-pld-back" onClick={back}>
            <Icon name="cl" /> Lists
          </button>
          <span className="p-pld-title">{list.emoji ?? '🛒'} {list.name}</span>
        </div>
        <GroceryBoard onBack={back} />
      </div>
    )
  }

  return (
    <PlannerListBody list={list} items={items} loading={loading} persons={persons} refetch={refetch} onBack={back} />
  )
}

function PlannerListBody({
  list,
  items,
  loading,
  persons,
  refetch,
  onBack,
}: {
  list: ListSummary | null
  items: ListItem[]
  loading: boolean
  persons: Person[]
  refetch: () => void
  onBack: () => void
}) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [itemModal, setItemModal] = useState<{ item: ListItem | null } | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Mirrors Lists.tsx's own grace window: a just-checked item lingers in its section
  // for a beat instead of jumping straight to Completed.
  const [recent, setRecent] = useState<Set<string>>(new Set())

  const { active, completed } = partitionListItems(items, recent)
  const sections = groupBySection(active)
  const sectionNames = useMemo(
    () => [...new Set(items.map((i) => i.section).filter((s): s is string => !!s))],
    [items]
  )

  async function toggle(item: ListItem) {
    const checked = !item.checked
    if (checked) {
      setRecent((s) => new Set(s).add(item.id))
      setTimeout(() => setRecent((s) => { const n = new Set(s); n.delete(item.id); return n }), 2000)
    }
    await groceryApi.patchListItem(item.id, { checked })
    refetch()
  }

  async function remove(item: ListItem) {
    await groceryApi.deleteItem(item.id)
    refetch()
  }

  async function submitAdd(e: FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name || !list || adding) return
    setAdding(true)
    try {
      await groceryApi.addListItem(list.id, { name })
      setDraft('')
      refetch()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="planner-screen-body p-pld">
      <div className="p-pld-head">
        <button type="button" className="p-pld-back" onClick={onBack}>
          <Icon name="cl" /> Lists
        </button>
        <span className="p-pld-title">
          {list?.emoji ?? '📝'} {list?.name ?? ''}
        </span>
        {list && list.listType !== 'template' && (
          <button type="button" aria-label="List options" onClick={() => setMenuOpen((v) => !v)}>
            <Icon name="menu" />
          </button>
        )}
      </div>
      {menuOpen && (
        <div className="p-pld-menu">
          <button
            type="button"
            onClick={() => {
              setEditing(true)
              setMenuOpen(false)
            }}
          >
            Rename / change emoji
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setConfirmDel(true)
              setMenuOpen(false)
            }}
          >
            Delete list
          </button>
        </div>
      )}

      <form className="p-pld-add" onSubmit={submitAdd}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add to ${list?.name ?? 'list'}…`} />
        <button type="submit" aria-label="Add item" disabled={!draft.trim() || adding}>
          <Icon name="plus" />
        </button>
      </form>

      {loading && items.length === 0 ? (
        <p className="p-empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="p-empty">Nothing on this list yet.</p>
      ) : (
        sections.map((sec) => (
          <PhoneCard key={sec.key} padding={4} className="p-pld-sec">
            <span className="p-section-label p-pld-sec-label">{sec.title}</span>
            {sec.items.map((item, i) => (
              <PlannerListItemRow
                key={item.id}
                item={item}
                first={i === 0}
                onToggle={() => toggle(item)}
                onEdit={() => setItemModal({ item })}
                onDelete={() => remove(item)}
              />
            ))}
          </PhoneCard>
        ))
      )}

      {completed.length > 0 && (
        <PhoneCard padding={4} className="p-pld-sec">
          <span className="p-section-label p-pld-sec-label">Completed</span>
          {completed.map((item, i) => (
            <PlannerListItemRow
              key={item.id}
              item={item}
              first={i === 0}
              onToggle={() => toggle(item)}
              onEdit={() => setItemModal({ item })}
              onDelete={() => remove(item)}
            />
          ))}
        </PhoneCard>
      )}

      {itemModal && list && (
        <ListItemModal
          listId={list.id}
          item={itemModal.item}
          persons={persons}
          sections={sectionNames}
          onClose={() => setItemModal(null)}
          onSaved={() => {
            setItemModal(null)
            refetch()
          }}
        />
      )}
      {editing && list && (
        <ListsModal list={list} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
      {confirmDel && list && (
        <ConfirmDialog
          title={`Delete "${list.name}"?`}
          message="This removes the list and everything on it."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await groceryApi.deleteList(list.id)
            onBack()
          }}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </div>
  )
}

function PlannerListItemRow({
  item,
  first,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ListItem
  first: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div>
      {!first && <Hair />}
      <div className={`p-pld-row${item.checked ? ' done' : ''}`}>
        <button
          type="button"
          className={`p-pld-check${item.checked ? ' on' : ''}`}
          aria-label={item.checked ? `Uncheck ${item.name}` : `Check ${item.name}`}
          onClick={onToggle}
        >
          {item.checked ? <Icon name="tasks" /> : null}
        </button>
        <button type="button" className="p-pld-name" onClick={onEdit}>
          {item.name}
          {item.quantity ? <span className="p-pld-qty">{item.quantity}</span> : null}
        </button>
        {item.assignee ? (
          <span className="p-pld-av" aria-hidden="true">
            {item.assignee.avatarEmoji ?? '🙂'}
          </span>
        ) : null}
        <button type="button" className="p-pld-del" aria-label={`Delete ${item.name}`} onClick={onDelete}>
          ×
        </button>
      </div>
    </div>
  )
}
