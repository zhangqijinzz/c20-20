import type { WorkspacePlan } from '../../shared/models'

export interface PlanSessionState {
  selectedItemId: string | null
  scrollX: number
  scrollY: number
  lastEditedAt: string
}

export type WorkspaceSessions = Record<string, PlanSessionState>

export function createPlanSession(plan?: WorkspacePlan): PlanSessionState {
  return {
    selectedItemId: null,
    scrollX: 0,
    scrollY: 0,
    lastEditedAt: plan?.updatedAt ?? new Date().toISOString(),
  }
}

export function rememberSelectedItem(sessions: WorkspaceSessions, planId: string, selectedItemId: string | null, plan?: WorkspacePlan): WorkspaceSessions {
  return patchPlanSession(sessions, planId, { selectedItemId }, plan)
}

export function rememberViewport(sessions: WorkspaceSessions, planId: string, scrollX: number, scrollY: number, plan?: WorkspacePlan): WorkspaceSessions {
  return patchPlanSession(sessions, planId, {
    scrollX: finiteScrollPosition(scrollX),
    scrollY: finiteScrollPosition(scrollY),
  }, plan)
}

export function rememberPlanEdit(sessions: WorkspaceSessions, planId: string, editedAt: string, plan?: WorkspacePlan): WorkspaceSessions {
  return patchPlanSession(sessions, planId, { lastEditedAt: editedAt }, plan)
}

export function sanitizePlanSessions(sessions: WorkspaceSessions, plans: WorkspacePlan[]): WorkspaceSessions {
  const next: WorkspaceSessions = {}
  for (const plan of plans) {
    const session = normalizePlanSession(sessions[plan.id], plan)
    next[plan.id] = {
      ...session,
      selectedItemId: plan.items.some((item) => item.id === session.selectedItemId) ? session.selectedItemId : null,
    }
  }
  return next
}

export function formatRelativeTime(iso: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return '时间未知'

  const diffSeconds = Math.max(0, Math.round((Date.now() - time) / 1000))
  if (diffSeconds < 45) return '刚刚'
  if (diffSeconds < 60) return `${diffSeconds} 秒前`

  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} 小时前`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `${diffDays} 天前`

  return new Date(time).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function patchPlanSession(sessions: WorkspaceSessions, planId: string, patch: Partial<PlanSessionState>, plan?: WorkspacePlan): WorkspaceSessions {
  const current = normalizePlanSession(sessions[planId], plan)
  return { ...sessions, [planId]: { ...current, ...patch } }
}

function normalizePlanSession(value: unknown, plan?: WorkspacePlan): PlanSessionState {
  const fallback = createPlanSession(plan)
  if (!value || typeof value !== 'object') return fallback

  const candidate = value as Partial<PlanSessionState>
  const selectedItemId = typeof candidate.selectedItemId === 'string' ? candidate.selectedItemId : null
  const lastEditedAt = typeof candidate.lastEditedAt === 'string' && !Number.isNaN(Date.parse(candidate.lastEditedAt))
    ? candidate.lastEditedAt
    : fallback.lastEditedAt

  return {
    selectedItemId,
    scrollX: finiteScrollPosition(candidate.scrollX),
    scrollY: finiteScrollPosition(candidate.scrollY),
    lastEditedAt,
  }
}

function finiteScrollPosition(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}
