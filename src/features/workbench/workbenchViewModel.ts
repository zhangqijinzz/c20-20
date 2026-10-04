import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createId,
  createInitialDocument,
  createPlan,
  type DeskItem,
  type DeviceType,
  type LayoutAnalysis,
  type WorkspaceDocument,
  type WorkspacePlan,
  type WorkspaceStatus,
} from '../../shared/models'
import { clampDeskSize, clampItemDimension } from '../../shared/layoutRules'
import { moveCanvasItem, rotateCanvasItem } from '../canvas/canvasViewModel'
import { createMaterialDraft } from '../materials/materialsViewModel'
import { inspectPlan } from '../inspection/inspectionViewModel'
import { LocalWorkspaceRepository, type WorkspaceRepository } from './workspaceRepository'
import {
  createPlanSession,
  rememberPlanEdit,
  rememberSelectedItem,
  rememberViewport,
  sanitizePlanSessions,
  type PlanSessionState,
  type WorkspaceSessions,
} from './sessionState'

export interface WorkspaceViewModel {
  status: WorkspaceStatus
  document: WorkspaceDocument | null
  activePlan: WorkspacePlan | null
  activeSession: PlanSessionState | null
  selectedItem: DeskItem | null
  analysis: LayoutAnalysis
  issueIds: string[]
  issueCount: number
  feedback: string
  isPreviewOpen: boolean
  selectItem: (id: string | null) => void
  addItem: (type: DeviceType) => void
  removeItem: (id: string) => void
  moveItem: (id: string, x: number, y: number) => void
  rotateItem: (id: string, delta: number) => void
  updateItem: (id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => void
  updateDesk: (field: 'deskWidthMm' | 'deskHeightMm', value: number) => void
  createNewPlan: () => void
  duplicatePlan: () => void
  selectPlan: (id: string) => void
  deleteCurrentPlan: () => void
  openPreview: () => void
  closePreview: () => void
}

const emptyInspection = { analysis: { overlapIds: [], outOfBoundsIds: [], coveragePercent: 0, status: 'clear' as const }, issueIds: [], issueCount: 0 }

export function useWorkspaceViewModel(repository?: WorkspaceRepository): WorkspaceViewModel {
  const repositoryRef = useRef(repository ?? new LocalWorkspaceRepository())
  const [status, setStatus] = useState<WorkspaceStatus>('loading')
  const [document, setDocument] = useState<WorkspaceDocument | null>(null)
  const [sessions, setSessions] = useState<WorkspaceSessions>({})
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [feedback, setFeedback] = useState('正在准备你的工作台…')
  const sessionsRef = useRef(sessions)

  useEffect(() => {
    sessionsRef.current = sessions
  })

  useEffect(() => {
    let active = true
    void repositoryRef.current.load().then((loaded) => {
      if (!active) return
      const nextDocument = loaded ?? createInitialDocument()
      setDocument(nextDocument)
      setSessions(Object.fromEntries(nextDocument.plans.map((plan) => [plan.id, createPlanSession(plan)])))
      setStatus('ready')
      setFeedback(loaded ? '已恢复上次编辑状态' : '已创建示例工作台，可以直接拖动设备')
    }).catch(() => {
      if (!active) return
      const fallbackDocument = createInitialDocument()
      setDocument(fallbackDocument)
      setSessions(Object.fromEntries(fallbackDocument.plans.map((plan) => [plan.id, createPlanSession(plan)])))
      setStatus('error')
      setFeedback('本地数据读取失败，当前使用临时工作台')
    })
    return () => { active = false }
  }, [])

  const activePlan = useMemo(
    () => document?.plans.find((plan) => plan.id === document.activePlanId) ?? null,
    [document],
  )
  const activeSession = activePlan ? sessions[activePlan.id] ?? createPlanSession(activePlan) : null
  const selectedItemId = activeSession?.selectedItemId ?? null
  const selectedItem = activePlan?.items.find((item) => item.id === selectedItemId) ?? null
  const inspection = useMemo(() => activePlan ? inspectPlan(activePlan) : emptyInspection, [activePlan])
  const { analysis, issueIds, issueCount } = inspection

  useEffect(() => {
    if (!document) return
    setSessions((current) => sanitizePlanSessions(current, document.plans))
  }, [document])

  const persist = useCallback(async (nextDocument: WorkspaceDocument, message: string) => {
    setDocument(nextDocument)
    setStatus('saving')
    setFeedback(message)
    try {
      await repositoryRef.current.save(nextDocument)
      setStatus('ready')
    } catch {
      setStatus('error')
      setFeedback('自动保存失败，请检查浏览器本地存储权限')
    }
  }, [])

  const captureActiveViewport = useCallback(() => {
    if (!activePlan) return
    setSessions((current) => rememberViewport(current, activePlan.id, window.scrollX, window.scrollY, activePlan))
  }, [activePlan])

  const changePlan = useCallback((nextDocument: WorkspaceDocument, message: string) => {
    captureActiveViewport()
    void persist(nextDocument, message)
  }, [captureActiveViewport, persist])

  const updateActivePlan = useCallback((updater: (plan: WorkspacePlan) => WorkspacePlan, message: string) => {
    if (!document || !activePlan) return
    const editedAt = new Date().toISOString()
    const nextPlan = { ...updater(activePlan), updatedAt: editedAt }
    const nextDocument = { ...document, plans: document.plans.map((plan) => plan.id === nextPlan.id ? nextPlan : plan) }
    setSessions((current) => rememberPlanEdit(current, nextPlan.id, editedAt, nextPlan))
    void persist(nextDocument, message)
  }, [activePlan, document, persist])

  const selectItem = useCallback((id: string | null) => {
    if (!activePlan) return
    setSessions((current) => rememberSelectedItem(current, activePlan.id, id, activePlan))
  }, [activePlan])

  const addItem = useCallback((type: DeviceType) => {
    if (!activePlan) return
    const draft = createMaterialDraft(type, activePlan.items.length)
    updateActivePlan((plan) => ({ ...plan, items: [...plan.items, draft.item] }), draft.feedback)
    setSessions((current) => rememberSelectedItem(current, activePlan.id, draft.item.id, activePlan))
  }, [activePlan, updateActivePlan])

  const removeItem = useCallback((id: string) => {
    if (!activePlan) return
    updateActivePlan((plan) => ({ ...plan, items: plan.items.filter((item) => item.id !== id) }), '设备已移除')
    setSessions((current) => rememberSelectedItem(current, activePlan.id, null, activePlan))
  }, [activePlan, updateActivePlan])

  const moveItem = useCallback((id: string, x: number, y: number) => {
    updateActivePlan((plan) => ({ ...plan, items: moveCanvasItem(plan.items, id, x, y) }), '位置已更新')
  }, [updateActivePlan])

  const rotateItem = useCallback((id: string, delta: number) => {
    updateActivePlan((plan) => ({ ...plan, items: rotateCanvasItem(plan.items, id, delta) }), '角度已更新')
  }, [updateActivePlan])

  const updateItem = useCallback((id: string, patch: Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>) => {
    updateActivePlan((plan) => ({
      ...plan,
      items: plan.items.map((item) => item.id === id ? {
        ...item,
        ...patch,
        widthMm: patch.widthMm === undefined ? item.widthMm : clampItemDimension(patch.widthMm, item.widthMm),
        heightMm: patch.heightMm === undefined ? item.heightMm : clampItemDimension(patch.heightMm, item.heightMm),
      } : item),
    }), '尺寸参数已更新')
  }, [updateActivePlan])

  const updateDesk = useCallback((field: 'deskWidthMm' | 'deskHeightMm', value: number) => {
    if (!activePlan) return
    updateActivePlan((plan) => ({ ...plan, [field]: clampDeskSize(value, plan[field]) }), '桌面尺寸已更新')
  }, [activePlan, updateActivePlan])

  const createNewPlan = useCallback(() => {
    if (!document) return
    const plan = createPlan(`工作台 ${document.plans.length + 1}`, false)
    changePlan({ ...document, plans: [...document.plans, plan], activePlanId: plan.id }, '已创建空白方案')
    setSessions((current) => ({ ...current, [plan.id]: createPlanSession(plan) }))
  }, [changePlan, document])

  const duplicatePlan = useCallback(() => {
    if (!document || !activePlan) return
    const copy: WorkspacePlan = {
      ...activePlan,
      id: createId('plan'),
      name: `${activePlan.name} · 副本`,
      items: activePlan.items.map((item) => ({ ...item, id: createId('item') })),
      updatedAt: new Date().toISOString(),
    }
    changePlan({ ...document, plans: [...document.plans, copy], activePlanId: copy.id }, '方案已复制')
    setSessions((current) => ({ ...current, [copy.id]: createPlanSession(copy) }))
  }, [activePlan, changePlan, document])

  const selectPlan = useCallback((id: string) => {
    if (!document || !document.plans.some((plan) => plan.id === id)) return
    const targetPlan = document.plans.find((plan) => plan.id === id)
    setSessions((current) => current[id] ? current : { ...current, [id]: createPlanSession(targetPlan) })
    changePlan({ ...document, activePlanId: id }, '已切换方案')
  }, [changePlan, document])

  const deleteCurrentPlan = useCallback(() => {
    if (!document || !activePlan || document.plans.length <= 1) {
      setFeedback('至少保留一个工作台方案')
      return
    }
    const remaining = document.plans.filter((plan) => plan.id !== activePlan.id)
    const nextActivePlan = remaining[0]
    changePlan({ ...document, plans: remaining, activePlanId: nextActivePlan.id }, '方案已删除')
    setSessions((current) => {
      const nextSessions = { ...current }
      delete nextSessions[activePlan.id]
      if (!nextSessions[nextActivePlan.id]) nextSessions[nextActivePlan.id] = createPlanSession(nextActivePlan)
      return nextSessions
    })
  }, [activePlan, changePlan, document])

  const openPreview = useCallback(() => setIsPreviewOpen(true), [])
  const closePreview = useCallback(() => setIsPreviewOpen(false), [])

  useEffect(() => {
    const planId = activePlan?.id
    if (!planId) return
    let frame = 0
    let ticking = false
    const captureViewport = () => {
      if (ticking) return
      ticking = true
      frame = window.requestAnimationFrame(() => {
        ticking = false
        setSessions((current) => rememberViewport(current, planId, window.scrollX, window.scrollY))
      })
    }
    window.addEventListener('scroll', captureViewport, { passive: true })
    return () => {
      window.removeEventListener('scroll', captureViewport)
      window.cancelAnimationFrame(frame)
    }
  }, [activePlan?.id])

  useEffect(() => {
    const planId = activePlan?.id
    if (!planId) return
    const session = sessionsRef.current[planId]
    if (session) window.scrollTo(session.scrollX, session.scrollY)
  }, [activePlan?.id])

  return {
    status,
    document,
    activePlan,
    activeSession,
    selectedItem,
    analysis,
    issueIds,
    issueCount,
    feedback,
    isPreviewOpen,
    selectItem,
    addItem,
    removeItem,
    moveItem,
    rotateItem,
    updateItem,
    updateDesk,
    createNewPlan,
    duplicatePlan,
    selectPlan,
    deleteCurrentPlan,
    openPreview,
    closePreview,
  }
}
