// Chores domain — shared types (rows, inputs, read-models).
import type { QueryResultRow } from 'pg'

export interface ChoreRow extends QueryResultRow {
  id: string
  title: string
  emoji: string | null
  person_id: string | null
  rrule: string | null
  recurrence_start_on: string | null
  recurrence_end_at: Date | null
  reward_currency: string | null
  reward_amount: number
  due_time: string | null
  is_active: boolean
  rollover: boolean
}

export interface CreateChoreInput {
  title: string
  personId?: string | null
  emoji?: string | null
  rewardAmount?: number
  rewardCurrency?: string | null // currency key; defaults to the household default
  rrule?: string | null
  dueTime?: string | null
  requiresApproval?: boolean
  requiresPhoto?: boolean
  // One-off and WEEKLY chores: carry the pending instance forward, keeping its original
  // due_on, until it's done or (WEEKLY only) replaced by the next occurrence. Defaults
  // true; ignored for DAILY chores, which always reset the next day regardless.
  rollover?: boolean
  // One-off only: the date the single instance lands on (YYYY-MM-DD). Defaults to
  // household-local today.
  dueOn?: string
}

export interface PersonChoreSummary {
  id: string
  name: string
  avatarEmoji: string | null
  colorHex: string | null
  memberType: string
  isAdmin: boolean
  total: number
  done: number
  stars: number
}

export interface TodayInstance {
  id: string
  choreId: string
  choreTitle: string
  emoji: string | null
  personId: string | null
  personName: string | null
  personAvatar: string | null
  personColor: string | null
  dueOn: string
  dueTime: string | null
  status: string
  rewardAmount: number | null
  rewardCurrency: string | null
  rrule: string | null
  requiresApproval: boolean
  requiresPhoto: boolean
  proofUrl: string | null
  hadProof: boolean
  streak: number
  // Who actually completed it (may differ from the assignee — e.g. a parent
  // completing on a kid's behalf). Null while pending/awaiting.
  completedBy: { id: string; name: string } | null
}

export type ChoreEditScope = 'this' | 'following' | 'all'
