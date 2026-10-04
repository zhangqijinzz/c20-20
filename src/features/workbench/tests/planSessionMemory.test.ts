import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import {
  formatRelativeTime,
  getPlanSession,
  prunePlanSessions,
  removePlanSession,
  resolveSelectedItemId,
  savePlanSession,
  type PlanSessionMemory,
  type PlanSessionState,
} from '../planSessionMemory'

function session(partial: Partial<PlanSessionState> = {}): PlanSessionState {
  return { selectedItemId: null, scrollTop: 0, lastEditedAt: null, ...partial }
}

describe('plan session memory', () => {
  it('remembers each plan’s editing state independently', () => {
    let memory: PlanSessionMemory = {}
    memory = savePlanSession(memory, 'plan-a', session({ selectedItemId: 'item-1', scrollTop: 320 }))
    memory = savePlanSession(memory, 'plan-b', session({ selectedItemId: 'item-9', scrollTop: 0 }))

    expect(getPlanSession(memory, 'plan-a')).toEqual(session({ selectedItemId: 'item-1', scrollTop: 320 }))
    expect(getPlanSession(memory, 'plan-b')).toEqual(session({ selectedItemId: 'item-9' }))
    expect(getPlanSession(memory, 'plan-unknown')).toBeNull()
  })

  it('forgets the session when its plan is deleted', () => {
    let memory: PlanSessionMemory = {}
    memory = savePlanSession(memory, 'plan-a', session({ selectedItemId: 'item-1' }))
    memory = removePlanSession(memory, 'plan-a')

    expect(getPlanSession(memory, 'plan-a')).toBeNull()
    expect(removePlanSession(memory, 'plan-a')).toBe(memory)
  })

  it('prunes sessions that no longer belong to any existing plan', () => {
    const planA = createPlan('A', false)
    const planB = createPlan('B', false)
    let memory: PlanSessionMemory = {}
    memory = savePlanSession(memory, planA.id, session({ scrollTop: 100 }))
    memory = savePlanSession(memory, planB.id, session({ scrollTop: 200 }))
    memory = savePlanSession(memory, 'plan-ghost', session({ scrollTop: 999 }))

    const pruned = prunePlanSessions(memory, [planA, planB])
    expect(getPlanSession(pruned, planA.id)?.scrollTop).toBe(100)
    expect(getPlanSession(pruned, planB.id)?.scrollTop).toBe(200)
    expect(getPlanSession(pruned, 'plan-ghost')).toBeNull()
    expect(prunePlanSessions(pruned, [planA, planB])).toBe(pruned)
  })

  it('restores the selected item only when it still exists in the plan', () => {
    const plan = createPlan('demo', false)
    const item = createItem('monitor', 0)
    plan.items.push(item)

    expect(resolveSelectedItemId(session({ selectedItemId: item.id }), plan)).toBe(item.id)
    expect(resolveSelectedItemId(session({ selectedItemId: 'item-removed' }), plan)).toBeNull()
    expect(resolveSelectedItemId(session(), plan)).toBeNull()
    expect(resolveSelectedItemId(null, plan)).toBeNull()
  })

  it('starts a duplicated plan with a fresh session instead of inheriting stale selection', () => {
    const source = createPlan('source', true)
    const copy = { ...source, id: 'plan-copy', items: source.items.map((item) => ({ ...item, id: `copy-${item.id}` })) }
    const memory = savePlanSession({}, source.id, session({ selectedItemId: source.items[0].id, scrollTop: 240 }))

    const copySession = getPlanSession(memory, copy.id)
    expect(copySession).toBeNull()
    expect(resolveSelectedItemId(copySession, copy)).toBeNull()
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-04T12:00:00')

  it('describes recent edits in plain words', () => {
    expect(formatRelativeTime('2026-10-04T11:59:40', now)).toBe('刚刚')
    expect(formatRelativeTime('2026-10-04T11:45:00', now)).toBe('15 分钟前')
    expect(formatRelativeTime('2026-10-04T09:00:00', now)).toBe('3 小时前')
    expect(formatRelativeTime('2026-10-01T12:00:00', now)).toBe('3 天前')
  })

  it('handles invalid input without crashing', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('时间未知')
  })
})
