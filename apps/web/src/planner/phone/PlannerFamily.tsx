import { useNavigate } from 'react-router'
import { Icon } from '../../kiosk/icons'
import { useChoresToday, useHousehold, usePersons } from '../../lib/api'
import { moduleEnabled } from '../../lib/modules'
import '../../styles/planner-screens.css'
import { PLANNER_ROOT } from '../mode'
import { PhoneAvatar, PhoneCard } from './primitives'

/** FamilyView's phone shape: a serif "Family" title over a row of 64pt member columns
 *  (46pt avatar, name, one line of what they owe today), then "Everything else" as a
 *  two-column grid of the app's module tiles. Tapping a member opens their person page —
 *  the same destination the kiosk's family screen leads to. */

interface Tile {
  key: string
  emoji: string
  name: string
  to: string
}

export function PlannerFamily() {
  const { household } = useHousehold()
  const { persons } = usePersons()
  const { people } = useChoresToday()
  const navigate = useNavigate()

  const choresOn = moduleEnabled(household, 'chores')
  const choresById = new Map(people.map((p) => [p.id, p]))

  const tiles: Tile[] = [
    ...(choresOn ? [{ key: 'tasks', emoji: '🧹', name: 'Chores', to: `${PLANNER_ROOT}/tasks` }] : []),
    ...(moduleEnabled(household, 'goals') ? [{ key: 'goals', emoji: '🎯', name: 'Goals', to: `${PLANNER_ROOT}/goals` }] : []),
    ...(moduleEnabled(household, 'meals') ? [{ key: 'recipes', emoji: '📖', name: 'Recipes', to: `${PLANNER_ROOT}/meals/recipes` }] : []),
    ...(moduleEnabled(household, 'lists') ? [{ key: 'lists', emoji: '📝', name: 'Lists', to: `${PLANNER_ROOT}/lists` }] : []),
    ...(moduleEnabled(household, 'pantry') ? [{ key: 'pantry', emoji: '🥫', name: 'Pantry', to: `${PLANNER_ROOT}/pantry` }] : []),
    { key: 'photos', emoji: '🖼️', name: 'Photos', to: `${PLANNER_ROOT}/family` },
  ]

  return (
    <div className="planner-screen-body">
      <div className="p-fam-head">
        <h1>Family</h1>
        <button type="button" aria-label="Add someone" onClick={() => navigate('/family')}>
          <Icon name="family" />
        </button>
      </div>

      <div className="p-people" data-testid="planner-people">
        {persons.map((p) => {
          const chores = choresById.get(p.id)
          const sub = choresOn && chores && chores.total > 0 ? `${chores.done}/${chores.total} chores` : p.memberType
          return (
            <button type="button" key={p.id} className="p-person" onClick={() => navigate(`${PLANNER_ROOT}/person/${p.id}`)}>
              <PhoneAvatar emoji={p.avatarEmoji ?? '🙂'} colorHex={p.colorHex} size={46} />
              <span className="p-person-name">{p.name}</span>
              <span className="p-person-sub">{sub}</span>
            </button>
          )
        })}
        <button type="button" className="p-person add" onClick={() => navigate('/family')}>
          <span className="p-person-add">
            <Icon name="plus" />
          </span>
          <span className="p-person-name">Add</span>
        </button>
      </div>

      <span className="p-section-label p-fam-label">Everything else</span>
      <div className="p-tiles">
        {tiles.map((t) => (
          <PhoneCard key={t.key} padding={14}>
            <button type="button" className="p-tile-btn" onClick={() => navigate(t.to)}>
              <span className="p-tile-emoji">{t.emoji}</span>
              <span className="p-tile-name">{t.name}</span>
              <Icon name="cr" />
            </button>
          </PhoneCard>
        ))}
      </div>
    </div>
  )
}
