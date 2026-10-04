import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import {
  createPlanSession,
  rememberPlanEdit,
  rememberSelectedItem,
  rememberViewport,
  sanitizePlanSessions,
} from '../sessionState'

describe('plan session memory', () => {
  it('remembers selection and viewport separately from the plan document', () => {
    const plan = createPlan('方案 A')
    const item = plan.items[0]
    let sessions = rememberSelectedItem({}, plan.id, item.id, plan)
    sessions = rememberViewport(sessions, plan.id, 120, 340, plan)

    expect(sessions[plan.id]).toMatchObject({ selectedItemId: item.id, scrollX: 120, scrollY: 340 })
    expect(plan.items[0]).not.toHaveProperty('session')
  })

  it('clears selection after its device no longer exists', () => {
    const plan = createPlan('方案 A')
    const removedItem = plan.items[0]
    const sessions = rememberSelectedItem({}, plan.id, removedItem.id, plan)
    const nextPlan = { ...plan, items: plan.items.filter((item) => item.id !== removedItem.id) }

    expect(sanitizePlanSessions(sessions, [nextPlan])[plan.id].selectedItemId).toBeNull()
  })

  it('removes session memory after a plan is deleted without attaching it to another plan', () => {
    const firstPlan = createPlan('方案 A')
    const secondPlan = createPlan('方案 B')
    const sessions = rememberSelectedItem({
      [firstPlan.id]: createPlanSession(firstPlan),
      [secondPlan.id]: createPlanSession(secondPlan),
    }, firstPlan.id, firstPlan.items[0].id, firstPlan)

    const sanitized = sanitizePlanSessions(sessions, [secondPlan])

    expect(sanitized[firstPlan.id]).toBeUndefined()
    expect(sanitized[secondPlan.id].selectedItemId).toBeNull()
  })

  it('does not transfer source selection or viewport when a plan is duplicated', () => {
    const source = createPlan('原方案')
    const copy = { ...createPlan('方案副本'), id: 'plan-copy' }
    let sessions = rememberSelectedItem({}, source.id, source.items[0].id, source)
    sessions = rememberViewport(sessions, source.id, 80, 200, source)
    sessions = { ...sessions, [copy.id]: createPlanSession(copy) }

    expect(sessions[copy.id]).toEqual({
      selectedItemId: null,
      scrollX: 0,
      scrollY: 0,
      lastEditedAt: copy.updatedAt,
    })
    expect(sessions[source.id].selectedItemId).toBe(source.items[0].id)
  })

  it('updates only edit time for content changes while preserving browsing position', () => {
    const plan = createPlan('方案 A')
    const sessions = rememberViewport(rememberSelectedItem({}, plan.id, plan.items[0].id, plan), plan.id, 40, 90, plan)
    const editedAt = new Date('2026-10-04T08:00:00.000Z').toISOString()
    const updated = rememberPlanEdit(sessions, plan.id, editedAt, plan)

    expect(updated[plan.id]).toMatchObject({
      selectedItemId: plan.items[0].id,
      scrollX: 40,
      scrollY: 90,
      lastEditedAt: editedAt,
    })
  })

  it('normalizes invalid restored session data', () => {
    const plan = createPlan('方案 A')
    const item = createItem('lamp')
    const sessions = sanitizePlanSessions({
      [plan.id]: { selectedItemId: item.id, scrollX: -10, scrollY: NaN, lastEditedAt: 'broken' },
    }, [plan])

    expect(sessions[plan.id]).toEqual({
      selectedItemId: null,
      scrollX: 0,
      scrollY: 0,
      lastEditedAt: plan.updatedAt,
    })
  })
})
