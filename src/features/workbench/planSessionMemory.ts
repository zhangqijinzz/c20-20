import type { WorkspacePlan } from '../../shared/models'

/**
 * 每个方案的「编辑现场」：本次使用过程里的临时记忆。
 * 只存在于内存中，不会写进 WorkspaceDocument，因此导出 / 分享方案数据时不会带上这些浏览痕迹。
 */
export interface PlanSessionState {
  /** 上次选中的设备 id */
  selectedItemId: string | null
  /** 页面停留的滚动位置（window.scrollY） */
  scrollTop: number
  /** 离开该方案时，它最后一次改动的时间（取自 plan.updatedAt） */
  lastEditedAt: string | null
}

export type PlanSessionMemory = Record<string, PlanSessionState>

export function getPlanSession(memory: PlanSessionMemory, planId: string): PlanSessionState | null {
  return memory[planId] ?? null
}

export function savePlanSession(memory: PlanSessionMemory, planId: string, session: PlanSessionState): PlanSessionMemory {
  return { ...memory, [planId]: session }
}

export function removePlanSession(memory: PlanSessionMemory, planId: string): PlanSessionMemory {
  if (!(planId in memory)) return memory
  const next = { ...memory }
  delete next[planId]
  return next
}

/** 清掉所有已经不属于现有方案的记忆（例如方案被删除之后），保证归属干净。 */
export function prunePlanSessions(memory: PlanSessionMemory, plans: WorkspacePlan[]): PlanSessionMemory {
  const planIds = new Set(plans.map((plan) => plan.id))
  let changed = false
  const next: PlanSessionMemory = {}
  for (const [planId, session] of Object.entries(memory)) {
    if (planIds.has(planId)) {
      next[planId] = session
    } else {
      changed = true
    }
  }
  return changed ? next : memory
}

/**
 * 恢复选中设备前先校验它仍然存在于该方案里，
 * 避免出现指向一件已经不存在设备的选中状态。
 */
export function resolveSelectedItemId(session: PlanSessionState | null, plan: WorkspacePlan): string | null {
  if (!session?.selectedItemId) return null
  return plan.items.some((item) => item.id === session.selectedItemId) ? session.selectedItemId : null
}

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return '时间未知'
  const minutes = Math.floor(Math.max(0, now.getTime() - time) / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(time).toLocaleDateString('zh-CN')
}
