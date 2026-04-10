import { useMemo } from 'react'
import { useRoute, useNavigate } from './router'

// ── Sub-view navigation ────────────────────────────────────────────

export interface SubViewNavigation {
  currentView: 'list' | 'create' | 'edit' | 'view'
  entityId: number | undefined
  goToList: () => void
  goToCreate: () => void
  goToEdit: (id: number) => void
  goToView: (id: number) => void
}

export function useSubViewNavigation(basePath: string): SubViewNavigation {
  const { params, path } = useRoute()
  const navigate = useNavigate()

  return useMemo(() => {
    let currentView: 'list' | 'create' | 'edit' | 'view' = 'list'
    let entityId: number | undefined

    if (path.startsWith(`${basePath}/create`)) {
      currentView = 'create'
    } else if (path.startsWith(`${basePath}/edit/`)) {
      currentView = 'edit'
      entityId = params.id ? Number(params.id) : undefined
    } else if (path.startsWith(`${basePath}/view/`)) {
      currentView = 'view'
      entityId = params.id ? Number(params.id) : undefined
    }

    return {
      currentView,
      entityId,
      goToList: () => navigate(basePath),
      goToCreate: () => navigate(`${basePath}/create`),
      goToEdit: (id: number) => navigate(`${basePath}/edit/${id}`),
      goToView: (id: number) => navigate(`${basePath}/view/${id}`),
    }
  }, [params, path, basePath, navigate])
}

// ── Master-detail navigation ───────────────────────────────────────

export interface MasterDetailNavigation {
  selectedId: number | null
  mode: 'view' | 'edit' | 'create' | null
  goToList: () => void
  goToCreate: () => void
  goToView: (id: number) => void
  goToEdit: (id: number) => void
}

export function useMasterDetailNavigation(
  basePath: string,
): MasterDetailNavigation {
  const { params, path } = useRoute()
  const navigate = useNavigate()

  return useMemo(() => {
    let selectedId: number | null = null
    let mode: 'view' | 'edit' | 'create' | null = null

    if (path.endsWith('/create')) {
      mode = 'create'
    } else if (path.endsWith('/edit')) {
      mode = 'edit'
      selectedId = params.id ? Number(params.id) : null
    } else if (params.id) {
      mode = 'view'
      selectedId = Number(params.id)
    }

    return {
      selectedId,
      mode,
      goToList: () => navigate(basePath),
      goToCreate: () => navigate(`${basePath}/create`),
      goToView: (id: number) => navigate(`${basePath}/${id}`),
      goToEdit: (id: number) => navigate(`${basePath}/${id}/edit`),
    }
  }, [params, path, basePath, navigate])
}
