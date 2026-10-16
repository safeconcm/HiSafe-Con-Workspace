'use client'
// src/app/(dashboard)/admin/organization/page.tsx
import { useState }    from 'react'
import { useOrgTree, useUpsertOrgNode, useUpdateOrgNode, useUsers } from '@/hooks/useAdmin'
import { OrgTreeNode } from '@/components/admin/OrgTreeNode'
import { fullNameTH, cn } from '@/utils'
import { Building2, Loader2, X, Save } from 'lucide-react'

export default function OrganizationPage() {
  const { data, isLoading } = useOrgTree()
  const { data: usersData } = useUsers({ status: 'active', limit: 200 })
  const upsert = useUpsertOrgNode()
  const update = useUpdateOrgNode()

  const tree: any[] = data?.tree ?? []
  const flat: any[] = data?.flat ?? []
  const users: any[] = usersData?.users ?? []

  // Users not yet in org tree
  const orgUserIds = new Set(flat.map((n: any) => n.user?.id))
  const unassigned  = users.filter(u => !orgUserIds.has(u.id))

  const [panel, setPanel] = useState<{
    mode:     'add' | 'edit'
    node?:    any
    parentId: string | null
  } | null>(null)

  const [form, setForm] = useState({
    user_id:            '',
    acting_approver_id: '',
  })

  const openAdd = (parentNode?: any) => {
    setForm({ user_id: '', acting_approver_id: parentNode?.acting_approver_id ?? '' })
    setPanel({ mode: 'add', parentId: parentNode?.id ?? null })
  }

  const openEdit = (node: any) => {
    setForm({
      user_id:            node.user?.id ?? '',
      acting_approver_id: node.acting_approver_id ?? '',
    })
    setPanel({ mode: 'edit', node, parentId: node.parent_id })
  }

  const handleSave = async () => {
    if (!panel) return
    if (panel.mode === 'add') {
      if (!form.user_id) return
      await upsert.mutateAsync({
        user_id:            form.user_id,
        parent_id:          panel.parentId,
        acting_approver_id: form.acting_approver_id || null,
      })
    } else if (panel.mode === 'edit' && panel.node) {
      await update.mutateAsync({
        id:                 panel.node.id,
        parent_id:          panel.parentId,
        acting_approver_id: form.acting_approver_id || null,
      })
    }
    setPanel(null)
  }

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-gray-500" />
          <h1>โครงสร้างองค์กร</h1>
        </div>
        <button
          onClick={() => openAdd()}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          + เพิ่มพนักงานใน Org
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Tree */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : !tree.length ? (
            <div className="card p-8 text-center text-gray-400 text-sm">
              ยังไม่มีโครงสร้างองค์กร กรุณาเพิ่มพนักงาน
            </div>
          ) : (
            <div className="space-y-1">
              {tree.map((node: any) => (
                <OrgTreeNode
                  key={node.id}
                  node={node}
                  isAdmin
                  onEdit={openEdit}
                  onAddChild={openAdd}
                />
              ))}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-4">

          {/* Edit / Add panel */}
          {panel && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">
                  {panel.mode === 'add' ? 'เพิ่มพนักงานใน Org' : 'แก้ไขสายบังคับบัญชา'}
                </h3>
                <button onClick={() => setPanel(null)}>
                  <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
              <div className="card-body space-y-4">

                {panel.mode === 'add' && (
                  <div>
                    <label className="form-label">เลือกพนักงาน *</label>
                    <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))} className="form-input">
                      <option value="">— เลือกพนักงาน —</option>
                      {unassigned.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.employee_code} · {fullNameTH(u)}
                        </option>
                      ))}
                    </select>
                    {unassigned.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1">พนักงานทุกคนอยู่ใน Org แล้ว</p>
                    )}
                  </div>
                )}

                {panel.mode === 'edit' && panel.node && (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <p className="font-medium text-gray-900">{fullNameTH(panel.node.user)}</p>
                    <p className="text-xs text-gray-400">{panel.node.user.employee_code}</p>
                  </div>
                )}

                <div>
                  <label className="form-label">ผู้บังคับบัญชา</label>
                  <select
                    value={panel.parentId ?? ''}
                    onChange={e => setPanel(p => p ? { ...p, parentId: e.target.value || null } : p)}
                    className="form-input"
                  >
                    <option value="">— ไม่มี (ระดับสูงสุด / CEO) —</option>
                    {flat.filter((n: any) => n.user?.id !== (panel.node?.user?.id ?? form.user_id)).map((n: any) => (
                      <option key={n.id} value={n.id}>
                        {n.user?.employee_code} · {fullNameTH(n.user)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">ผู้ทำหน้าที่แทน (เมื่อไม่อยู่)</label>
                  <select
                    value={form.acting_approver_id}
                    onChange={e => setForm(f => ({ ...f, acting_approver_id: e.target.value }))}
                    className="form-input"
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {users.filter(u => u.id !== (panel.node?.user?.id ?? form.user_id)).map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.employee_code} · {fullNameTH(u)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleSave}
                  disabled={upsert.isPending || update.isPending || (panel.mode === 'add' && !form.user_id)}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
                >
                  {(upsert.isPending || update.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  บันทึก
                </button>
              </div>
            </div>
          )}

          {/* Unassigned users */}
          {unassigned.length > 0 && !panel && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-sm font-medium text-gray-700">ยังไม่ได้จัดสายบังคับบัญชา ({unassigned.length} คน)</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {unassigned.map((u: any) => (
                  <button
                    key={u.id}
                    onClick={() => { setForm({ user_id: u.id, acting_approver_id: '' }); setPanel({ mode: 'add', parentId: null }) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-medium shrink-0">
                      {u.first_name_th.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{fullNameTH(u)}</p>
                      <p className="text-xs text-gray-400">{u.employee_code}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
