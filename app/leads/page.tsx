'use client'

import React, { CSSProperties, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

/**
 * ✅ Ensure these columns exist in your Supabase `leads` table:
 * - id (uuid)
 * - lead_ref (text)   (optional but recommended)
 * - full_name (text)
 * - phone (text)
 * - email (text)
 * - status (text)
 * - source (text)
 * - assigned_to (text) (optional)
 * - created_at (timestamptz)
 *
 * ✅ Notes history table: `lead_notes`
 * - id (uuid)
 * - lead_id (uuid references leads.id on delete cascade)
 * - note (text)
 * - created_at (timestamptz default now())
 */

type Lead = {
  id: string
  lead_ref: string | null
  full_name: string
  phone: string
  email: string
  status: string
  source: string
  assigned_to: string | null
  created_at: string
  notes: string | null // optional summary/legacy column; we keep it for compatibility
}

type LeadNote = {
  id: string
  lead_id: string
  note: string
  created_at: string
}

type TabKey =
  | 'ALL'
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'CALLBACK'
  | 'WON'
  | 'LOST'
  | 'ARCHIVE'

const STATUS_OPTIONS = ['New Lead', 'Contacted', 'Qualified', 'Callback', 'Won', 'Lost', 'Archive'] as const
const SOURCE_OPTIONS = ['Instagram', 'Website', 'Referral', 'WhatsApp', 'Facebook', 'TikTok', 'Other'] as const

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return d
  }
}

function formatDateTime(d: string) {
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

function shortId(id: string) {
  if (!id) return ''
  return id.replace(/-/g, '').slice(0, 6)
}

function makeLeadRefFallback(id: string) {
  return `ECO${shortId(id).toUpperCase()}`
}

const NoteIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
      stroke="currentColor"
      strokeWidth="1.8"
    />
    <path d="M14 3v4a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 12h8M8 16h8M8 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export default function LeadsPage() {
  const router = useRouter()

  // =========================
  // Data state
  // =========================
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [leads, setLeads] = useState<Lead[]>([])

  // =========================
  // UI state: filters/search
  // =========================
  const [tab, setTab] = useState<TabKey>('ALL')
  const [query, setQuery] = useState('')

  // =========================
  // Inline edit state
  // =========================
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Lead | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  // =========================
  // Add lead modal state
  // =========================
  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newLead, setNewLead] = useState({
    lead_ref: '',
    full_name: '',
    phone: '',
    email: '',
    status: 'New Lead',
    source: 'Instagram',
    assigned_to: '',
    notes: '',
  })

  // =========================
  // Notes overlay state
  // =========================
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesLead, setNotesLead] = useState<Lead | null>(null)
  const [notesHistory, setNotesHistory] = useState<LeadNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  // =========================
  // Fetch leads
  // =========================
  const fetchLeads = async () => {
    setErrorMsg(null)
    const { data, error } = await supabase
      .from('leads')
      .select('id, lead_ref, full_name, phone, email, status, source, assigned_to, created_at, notes')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMsg(error.message)
      setLeads([])
      return
    }

    setLeads((data || []) as Lead[])
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      // ✅ Fixed: your auth debug was breaking the file (it was outside async)
      const { data: userData } = await supabase.auth.getUser()
      console.log('AUTH USER:', userData?.user ?? null)

      await fetchLeads()
      setLoading(false)
    })()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchLeads()
    setRefreshing(false)
  }

  // =========================
  // Derived: filtered leads
  // =========================
  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase()

    const byTab = (l: Lead) => {
      if (tab === 'ALL') return true
      if (tab === 'NEW') return (l.status || '').toLowerCase() === 'new lead'
      if (tab === 'CONTACTED') return (l.status || '').toLowerCase() === 'contacted'
      if (tab === 'QUALIFIED') return (l.status || '').toLowerCase() === 'qualified'
      if (tab === 'CALLBACK') return (l.status || '').toLowerCase() === 'callback'
      if (tab === 'WON') return (l.status || '').toLowerCase() === 'won'
      if (tab === 'LOST') return (l.status || '').toLowerCase() === 'lost'
      if (tab === 'ARCHIVE') return (l.status || '').toLowerCase() === 'archive'
      return true
    }

    const bySearch = (l: Lead) => {
      if (!q) return true
      const hay = [
        l.lead_ref || '',
        l.id || '',
        l.full_name || '',
        l.phone || '',
        l.email || '',
        l.status || '',
        l.source || '',
        l.assigned_to || '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    }

    return leads.filter((l) => byTab(l) && bySearch(l))
  }, [leads, tab, query])

  // =========================
  // Inline edit actions
  // =========================
  const startEdit = (lead: Lead) => {
    setEditingLeadId(lead.id)
    setEditDraft({ ...lead })
  }

  const cancelEdit = () => {
    setEditingLeadId(null)
    setEditDraft(null)
  }

  const saveEdit = async () => {
    if (!editDraft) return
    setSavingEdit(true)

    const payload = {
      lead_ref: editDraft.lead_ref,
      full_name: editDraft.full_name,
      phone: editDraft.phone,
      email: editDraft.email,
      status: editDraft.status,
      source: editDraft.source,
      assigned_to: editDraft.assigned_to,
    }

    const { error } = await supabase.from('leads').update(payload).eq('id', editDraft.id)

    if (error) {
      alert(`Failed to save: ${error.message}`)
      setSavingEdit(false)
      return
    }

    setLeads((prev) => prev.map((l) => (l.id === editDraft.id ? { ...l, ...editDraft } : l)))
    setSavingEdit(false)
    cancelEdit()
  }

  // =========================
  // Delete action
  // =========================
  const handleDelete = async (lead: Lead) => {
    const ok = confirm(`Delete ${lead.full_name}? This cannot be undone.`)
    if (!ok) return

    const { error } = await supabase.from('leads').delete().eq('id', lead.id)

    if (error) {
      alert(`Failed to delete: ${error.message}`)
      return
    }

    setLeads((prev) => prev.filter((l) => l.id !== lead.id))
    if (editingLeadId === lead.id) cancelEdit()
    if (notesLead?.id === lead.id) {
      setNotesOpen(false)
      setNotesLead(null)
      setNotesHistory([])
      setNewNote('')
    }
  }

  // =========================
  // Notes overlay actions
  // =========================
  const openNotes = async (lead: Lead) => {
    setNotesLead(lead)
    setNotesHistory([])
    setNewNote('')
    setNotesOpen(true)
    setNotesLoading(true)

    const { data, error } = await supabase
      .from('lead_notes')
      .select('id, lead_id, note, created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })

    if (error) {
      setNotesLoading(false)
      alert(`Notes load failed: ${error.message}`)
      return
    }

    setNotesHistory((data || []) as LeadNote[])
    setNotesLoading(false)
  }

  const closeNotes = () => {
    setNotesOpen(false)
    setNotesLead(null)
    setNotesHistory([])
    setNewNote('')
  }

  const addNote = async () => {
    if (!notesLead) return
    const note = newNote.trim()
    if (!note) return

    setAddingNote(true)
    const { data, error } = await supabase
      .from('lead_notes')
      .insert([{ lead_id: notesLead.id, note }])
      .select('id, lead_id, note, created_at')
      .single()

    if (error) {
      setAddingNote(false)
      alert(`Failed to add note: ${error.message}`)
      return
    }

    if (data) setNotesHistory((prev) => [data as LeadNote, ...prev])
    setNewNote('')
    setAddingNote(false)

    await supabase.from('leads').update({ notes: note }).eq('id', notesLead.id)
    setLeads((prev) => prev.map((l) => (l.id === notesLead.id ? { ...l, notes: note } : l)))
  }

  // =========================
  // Add lead modal actions
  // =========================
  const openAdd = () => setAddOpen(true)
  const closeAdd = () => {
    setAddOpen(false)
    setNewLead({
      lead_ref: '',
      full_name: '',
      phone: '',
      email: '',
      status: 'New Lead',
      source: 'Instagram',
      assigned_to: '',
      notes: '',
    })
  }

  const handleAddLead = async () => {
    if (!newLead.full_name.trim()) return alert('Full name is required.')

    setAdding(true)

    const payload = {
      lead_ref: newLead.lead_ref.trim() || null,
      full_name: newLead.full_name.trim(),
      phone: newLead.phone.trim(),
      email: newLead.email.trim(),
      status: newLead.status,
      source: newLead.source,
      assigned_to: newLead.assigned_to.trim() || null,
      notes: newLead.notes.trim() || null,
    }

    const { data, error } = await supabase
      .from('leads')
      .insert([payload])
      .select('id, lead_ref, full_name, phone, email, status, source, assigned_to, created_at, notes')
      .single()

    if (error) {
      setAdding(false)
      alert(`Failed to add lead: ${error.message}`)
      return
    }

    if (data) setLeads((prev) => [data as Lead, ...prev])
    setAdding(false)
    closeAdd()
  }

  // =========================
  // Page UI
  // =========================
  const title = 'Lead Control Panel'

  return (
    <div style={page}>
      {/* ✅ Sidebar overlay/drawer added */}
      <Sidebar />

      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={container}>
        {/* Header */}
        <div style={headerWrap}>
          <div style={brandRow}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={() => router.push('/dashboard')}
                style={btnGhostSmall}
                title="Back to Dashboard"
              >
                ← Dashboard
              </button>

              <div style={brandPill}>
                <span style={dot} />
                <span style={{ opacity: 0.95 }}>Triple 555 CRM</span>
              </div>
            </div>
          </div>

          <div style={header}>
            <div style={headerLeft}>
              <div style={avatar}>T5</div>
              <div>
                <div style={h1}>{title}</div>
                <div style={subtitle}>View, update, and note every lead in one place.</div>
              </div>
            </div>

            <div style={headerRight}>
              <button
                onClick={handleRefresh}
                style={btnGhost}
                disabled={refreshing}
                aria-disabled={refreshing}
                title="Refresh"
              >
                {refreshing ? 'Refreshing…' : '↻ Refresh'}
              </button>

              <button onClick={openAdd} style={btnCyan}>
                + New Lead
              </button>
            </div>
          </div>

          {/* Tabs + search */}
          <div style={toolbar}>
            <div style={tabs}>
              <TabButton label="All Leads" active={tab === 'ALL'} onClick={() => setTab('ALL')} />
              <TabButton label="New" active={tab === 'NEW'} onClick={() => setTab('NEW')} />
              <TabButton label="Contacted" active={tab === 'CONTACTED'} onClick={() => setTab('CONTACTED')} />
              <TabButton label="Qualified" active={tab === 'QUALIFIED'} onClick={() => setTab('QUALIFIED')} />
              <TabButton label="Callback" active={tab === 'CALLBACK'} onClick={() => setTab('CALLBACK')} />
              <TabButton label="Won" active={tab === 'WON'} onClick={() => setTab('WON')} />
              <TabButton label="Lost" active={tab === 'LOST'} onClick={() => setTab('LOST')} />
              <TabButton label="Archive" active={tab === 'ARCHIVE'} onClick={() => setTab('ARCHIVE')} />
            </div>

            <div style={searchWrap}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search lead_ref, name, phone, email, assigned_to…"
                style={search}
              />
            </div>
          </div>
        </div>

        {/* Error bar */}
        {errorMsg && (
          <div style={errorBar}>
            <b>Supabase error:</b>&nbsp;{errorMsg}
          </div>
        )}

        {/* Table */}
        <div style={panel}>
          <div style={panelHeader}>
            <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Leads</div>
            <div style={{ opacity: 0.85, fontWeight: 700 }}>
              Showing <span style={{ color: 'rgba(120,255,255,0.95)' }}>{filteredLeads.length}</span> of{' '}
              {leads.length}
            </div>
          </div>

          {loading ? (
            <div style={loadingBox}>Loading leads…</div>
          ) : filteredLeads.length === 0 ? (
            <div style={emptyBox}>No leads found. Try switching tabs or clearing your search.</div>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                {/* ✅ Makes the table fit without forcing horizontal scroll */}
                <colgroup>
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>

                <thead>
                  <tr>
                    <th style={th}>Lead Ref</th>
                    <th style={th}>ID</th>
                    <th style={th}>Customer</th>
                    <th style={th}>Phone</th>
                    <th style={th}>Email</th>
                    <th style={th}>Status</th>
                    <th style={th}>Source</th>
                    <th style={th}>Assigned To</th>
                    <th style={th}>Added</th>
                    <th style={th}>Notes</th>
                    <th style={thRight}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLeads.map((lead) => {
                    const isEditing = editingLeadId === lead.id
                    const refToShow = lead.lead_ref || makeLeadRefFallback(lead.id)

                    return (
                      <tr key={lead.id} style={tr}>
                        <td style={tdMono}>
                          {isEditing ? (
                            <input
                              style={inputInline}
                              value={editDraft?.lead_ref || ''}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, lead_ref: e.target.value } : p))}
                              placeholder="ECO0001"
                            />
                          ) : (
                            <span style={pillRef}>{refToShow}</span>
                          )}
                        </td>

                        <td style={tdMono}>
                          <span style={pillId}>{shortId(lead.id)}</span>
                        </td>

                        <td style={td}>
                          {isEditing ? (
                            <input
                              style={inputInline}
                              value={editDraft?.full_name || ''}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, full_name: e.target.value } : p))}
                            />
                          ) : (
                            <span style={{ fontWeight: 900 }}>{lead.full_name}</span>
                          )}
                        </td>

                        <td style={td}>
                          {isEditing ? (
                            <input
                              style={inputInline}
                              value={editDraft?.phone || ''}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, phone: e.target.value } : p))}
                            />
                          ) : (
                            <span style={{ fontWeight: 900 }}>{lead.phone}</span>
                          )}
                        </td>

                        <td style={td}>
                          {isEditing ? (
                            <input
                              style={inputInline}
                              value={editDraft?.email || ''}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, email: e.target.value } : p))}
                            />
                          ) : (
                            <span style={{ fontWeight: 900 }}>{lead.email}</span>
                          )}
                        </td>

                        <td style={td}>
                          {isEditing ? (
                            <select
                              style={selectInline}
                              value={editDraft?.status || 'New Lead'}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, status: e.target.value } : p))}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={statusPill(lead.status)}>{lead.status}</span>
                          )}
                        </td>

                        <td style={td}>
                          {isEditing ? (
                            <select
                              style={selectInline}
                              value={editDraft?.source || 'Instagram'}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, source: e.target.value } : p))}
                            >
                              {SOURCE_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ fontWeight: 900 }}>{lead.source}</span>
                          )}
                        </td>

                        <td style={td}>
                          {isEditing ? (
                            <input
                              style={inputInline}
                              value={editDraft?.assigned_to || ''}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, assigned_to: e.target.value } : p))}
                              placeholder="Georgie"
                            />
                          ) : (
                            <span style={{ fontWeight: 900 }}>{lead.assigned_to || '—'}</span>
                          )}
                        </td>

                        <td style={td}>
                          <span style={pillDate}>{formatDate(lead.created_at)}</span>
                        </td>

                        <td style={td}>
                          <button
                            style={btnNotes}
                            onClick={() => openNotes(lead)}
                            title={lead.notes ? `Latest: ${lead.notes}` : 'Open notes'}
                          >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: 'rgba(120,255,255,0.95)' }}>
                                <NoteIcon size={16} />
                              </span>
                              Notes
                            </span>
                          </button>
                        </td>

                        <td style={tdRight}>
                          {isEditing ? (
                            <div style={actionsRow}>
                              <button style={btnCyanSmall} onClick={saveEdit} disabled={savingEdit}>
                                {savingEdit ? 'Saving…' : 'Save'}
                              </button>
                              <button style={btnGhostSmall} onClick={cancelEdit} disabled={savingEdit}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={actionsRow}>
                              <button style={btnGhostSmall} onClick={() => startEdit(lead)} title="Edit lead">
                                Edit
                              </button>
                              <button style={btnDangerSmall} onClick={() => handleDelete(lead)} title="Delete lead">
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Lead Modal */}
        {addOpen && (
          <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && closeAdd()}>
            <div style={modal}>
              <div style={modalTop}>
                <div>
                  <div style={modalTitle}>Add New Lead</div>
                  <div style={modalSub}>This creates a new record in Supabase.</div>
                </div>
                <button style={btnGhostSmall} onClick={closeAdd}>
                  ✕
                </button>
              </div>

              <div style={formGrid}>
                <Field label="Lead Ref (optional)">
                  <input
                    style={input}
                    value={newLead.lead_ref}
                    onChange={(e) => setNewLead((p) => ({ ...p, lead_ref: e.target.value }))}
                    placeholder="ECO0001"
                  />
                </Field>

                <Field label="Assigned To (optional)">
                  <input
                    style={input}
                    value={newLead.assigned_to}
                    onChange={(e) => setNewLead((p) => ({ ...p, assigned_to: e.target.value }))}
                    placeholder="Georgie"
                  />
                </Field>

                <Field label="Full Name">
                  <input
                    style={input}
                    value={newLead.full_name}
                    onChange={(e) => setNewLead((p) => ({ ...p, full_name: e.target.value }))}
                    placeholder="John Graham"
                  />
                </Field>

                <Field label="Phone">
                  <input
                    style={input}
                    value={newLead.phone}
                    onChange={(e) => setNewLead((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="07..."
                  />
                </Field>

                <Field label="Email">
                  <input
                    style={input}
                    value={newLead.email}
                    onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))}
                    placeholder="name@email.com"
                  />
                </Field>

                <Field label="Status">
                  <select
                    style={select}
                    value={newLead.status}
                    onChange={(e) => setNewLead((p) => ({ ...p, status: e.target.value }))}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Source">
                  <select
                    style={select}
                    value={newLead.source}
                    onChange={(e) => setNewLead((p) => ({ ...p, source: e.target.value }))}
                  >
                    {SOURCE_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Notes (optional)" full>
                  <textarea
                    style={{
                      ...input,
                      minHeight: 160,
                      paddingTop: 14,
                      paddingBottom: 14,
                      resize: 'vertical' as const,
                    }}
                    value={newLead.notes}
                    onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Initial notes..."
                  />
                </Field>
              </div>

              <div style={modalActions}>
                <button style={btnGhost} onClick={closeAdd} disabled={adding}>
                  Cancel
                </button>
                <button style={btnCyan} onClick={handleAddLead} disabled={adding}>
                  {adding ? 'Adding…' : 'Add Lead'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Notes Overlay */}
        {notesOpen && notesLead && (
          <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && closeNotes()}>
            <div style={modalWide}>
              <div style={modalTop}>
                <div>
                  <div style={modalTitle}>
                    Notes — <span style={{ color: 'rgba(120,255,255,0.95)' }}>{notesLead.full_name}</span>
                  </div>
                  <div style={modalSub}>
                    Lead Ref: <b>{notesLead.lead_ref || makeLeadRefFallback(notesLead.id)}</b> • Added:{' '}
                    <b>{formatDate(notesLead.created_at)}</b> • Assigned:{' '}
                    <b>{notesLead.assigned_to || '—'}</b>
                  </div>
                </div>
                <button style={btnGhostSmall} onClick={closeNotes}>
                  ✕
                </button>
              </div>

              <div style={notesLayout}>
                <div style={notesHistoryBox}>
                  <div style={notesHeaderRow}>
                    <div style={notesHeaderTitle}>History</div>
                    <div style={notesHeaderHint}>
                      {notesLoading ? 'Loading…' : `${notesHistory.length} note(s)`}
                    </div>
                  </div>

                  <div style={notesScroll}>
                    {notesLoading ? (
                      <div style={notesEmpty}>Loading notes…</div>
                    ) : notesHistory.length === 0 ? (
                      <div style={notesEmpty}>No notes yet. Add the first one on the right.</div>
                    ) : (
                      notesHistory.map((n) => (
                        <div key={n.id} style={noteCard}>
                          <div style={noteMeta}>{formatDateTime(n.created_at)}</div>
                          <div style={noteText}>{n.note}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={notesComposeBox}>
                  <div style={notesHeaderRow}>
                    <div style={notesHeaderTitle}>Add Note</div>
                    <div style={notesHeaderHint}>Saved into lead_notes</div>
                  </div>

                  <textarea
                    style={notesTextarea}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Write a clear note… e.g. called, no answer, follow up tomorrow 10am."
                  />

                  <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
                    <button style={btnGhost} onClick={closeNotes} disabled={addingNote}>
                      Close
                    </button>
                    <button style={btnCyan} onClick={addNote} disabled={addingNote}>
                      {addingNote ? 'Adding…' : 'Add Note'}
                    </button>
                  </div>

                  <div style={notesTip}>Tip: keep notes short + dated. Your future self will thank you.</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />
    </div>
  )
}

/* -----------------------------
   Small components
------------------------------ */

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} style={active ? tabBtnActive : tabBtn}>
      {label}
    </button>
  )
}

function Field({
  label,
  children,
  full,
}: {
  label: string
  children: React.ReactNode
  full?: boolean
}) {
  return (
    <div
      style={{
        gridColumn: full ? '1 / -1' : undefined,
        marginBottom: 6,
      }}
    >
      <div style={fieldLabel}>{label}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}

/* -----------------------------
   Styles (royal blue + cyan)
------------------------------ */

const page: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.08), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  fontFamily:
    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontWeight: 800,
  position: 'relative',
  overflowX: 'hidden',
}

const bgGlowTop: CSSProperties = {
  position: 'absolute',
  top: -220,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 1100,
  height: 450,
  background: 'radial-gradient(circle, rgba(0,255,255,0.18), transparent 30%)',
  filter: 'blur(28px)',
  pointerEvents: 'none',
}

const bgGlowBottom: CSSProperties = {
  position: 'absolute',
  bottom: -260,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 1100,
  height: 520,
  background: 'radial-gradient(circle, rgba(0,200,255,0.14), transparent 65%)',
  filter: 'blur(30px)',
  pointerEvents: 'none',
}

const container: CSSProperties = {
  position: 'relative',
  maxWidth: 1500, // ✅ wider so you use the full screen
  margin: '0 auto',
  padding: '34px 18px',
}

const headerWrap: CSSProperties = { marginBottom: 18 }

const brandRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
}

const brandPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(0,255,255,0.08)',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 0 0 1px rgba(0,255,255,0.08) inset',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.3,
}

const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: 'rgba(120,255,255,0.95)',
  boxShadow: '0 0 16px rgba(0,255,255,0.7)',
  display: 'inline-block',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: '18px 18px',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow:
    '0 20px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,255,0.08) inset, 0 0 40px rgba(0,255,255,0.10)',
  backdropFilter: 'blur(10px)',
}

const headerLeft: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }

const avatar: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  display: 'grid',
  placeItems: 'center',
  background: 'radial-gradient(circle at 30% 30%, rgba(0,255,255,0.95), rgba(0,130,255,0.65))',
  boxShadow: '0 0 28px rgba(0,255,255,0.35)',
  fontWeight: 1000,
}

const h1: CSSProperties = { fontSize: 22, fontWeight: 1000, letterSpacing: 0.2, lineHeight: 1.1 }
const subtitle: CSSProperties = { marginTop: 2, fontSize: 12.5, fontWeight: 800, opacity: 0.75 }
const headerRight: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center' }

const toolbar: CSSProperties = {
  marginTop: 14,
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
}

const tabs: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' }

const tabBtn: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(255,255,255,0.85)',
  fontWeight: 900,
  cursor: 'pointer',
}

const tabBtnActive: CSSProperties = {
  ...tabBtn,
  background: 'rgba(0,255,255,0.14)',
  border: '1px solid rgba(0,255,255,0.40)',
  color: 'rgba(255,255,255,0.98)',
  boxShadow: '0 0 22px rgba(0,255,255,0.12)',
}

const searchWrap: CSSProperties = { flex: 1, minWidth: 280, maxWidth: 520 }

const search: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.20)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
  boxShadow: '0 0 0 1px rgba(0,255,255,0.06) inset',
}

const panel: CSSProperties = {
  marginTop: 16,
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.25)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,255,0.08) inset',
  overflow: 'hidden',
}

const panelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.18)',
}

const loadingBox: CSSProperties = { padding: 18, fontWeight: 900, opacity: 0.9 }
const emptyBox: CSSProperties = { padding: 18, fontWeight: 900, opacity: 0.85 }

/* ✅ Keep design, but table fits without forcing scroll */
const tableWrap: CSSProperties = {
  width: '100%',
  overflowX: 'auto', // still ok for small screens
}

const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  tableLayout: 'fixed', // ✅ key
}

const th: CSSProperties = {
  textAlign: 'left',
  fontWeight: 1000,
  fontSize: 12,
  letterSpacing: 0.45,
  textTransform: 'uppercase',
  padding: '14px 12px',
  color: 'rgba(200,255,255,0.95)',
  background: 'rgba(0,0,0,0.25)',
  borderBottom: '1px solid rgba(0,255,255,0.22)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const thRight: CSSProperties = { ...th, textAlign: 'right' }

const tr: CSSProperties = { background: 'rgba(0,0,0,0.12)' }

const td: CSSProperties = {
  padding: '12px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  verticalAlign: 'middle',
  fontWeight: 900,
  color: 'rgba(255,255,255,0.95)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const tdRight: CSSProperties = { ...td, textAlign: 'right' }

const tdMono: CSSProperties = {
  ...td,
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  letterSpacing: 0.25,
}

const pillId: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  fontWeight: 1000,
}

const pillRef: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(0,255,255,0.10)',
  border: '1px solid rgba(0,255,255,0.30)',
  color: 'rgba(255,255,255,0.98)',
  boxShadow: '0 0 18px rgba(0,255,255,0.10)',
  fontWeight: 1000,
}

const pillDate: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.10)',
  fontWeight: 1000,
}

const inputInline: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 10,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.22)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const selectInline: CSSProperties = { ...inputInline, cursor: 'pointer' }

function statusPill(status: string) {
  const s = (status || '').toLowerCase()
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    fontWeight: 1000,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.95)',
  }

  if (s === 'new lead') return { ...base, border: '1px solid rgba(0,255,255,0.32)', background: 'rgba(0,255,255,0.10)' }
  if (s === 'contacted') return { ...base, border: '1px solid rgba(0,160,255,0.32)', background: 'rgba(0,160,255,0.10)' }
  if (s === 'qualified') return { ...base, border: '1px solid rgba(140,255,120,0.32)', background: 'rgba(140,255,120,0.10)' }
  if (s === 'callback') return { ...base, border: '1px solid rgba(255,210,90,0.32)', background: 'rgba(255,210,90,0.10)' }
  if (s === 'won') return { ...base, border: '1px solid rgba(0,255,180,0.32)', background: 'rgba(0,255,180,0.10)' }
  if (s === 'lost') return { ...base, border: '1px solid rgba(255,90,90,0.32)', background: 'rgba(255,90,90,0.10)' }
  if (s === 'archive') return { ...base, border: '1px solid rgba(200,200,200,0.22)', background: 'rgba(200,200,200,0.08)' }
  return base
}

const actionsRow: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  justifyContent: 'flex-end',
}

const btnBase: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  fontWeight: 1000,
  cursor: 'pointer',
  border: '1px solid transparent',
  color: '#fff',
}

const btnGhost: CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
}

const btnCyan: CSSProperties = {
  ...btnBase,
  background: 'linear-gradient(135deg, rgba(0,255,255,0.95), rgba(0,140,255,0.90))',
  border: '1px solid rgba(0,255,255,0.55)',
  boxShadow: '0 0 26px rgba(0,255,255,0.22)',
  color: '#001122',
}

const btnGhostSmall: CSSProperties = { ...btnGhost, padding: '8px 10px', borderRadius: 10, fontSize: 12.5 }
const btnCyanSmall: CSSProperties = { ...btnCyan, padding: '8px 10px', borderRadius: 10, fontSize: 12.5 }

const btnDangerSmall: CSSProperties = {
  ...btnBase,
  padding: '8px 10px',
  borderRadius: 10,
  fontSize: 12.5,
  background: 'rgba(255,50,50,0.16)',
  border: '1px solid rgba(255,50,50,0.40)',
  color: 'rgba(255,210,210,0.98)',
}

const btnNotes: CSSProperties = { ...btnGhostSmall, background: 'rgba(0,255,255,0.08)', border: '1px solid rgba(0,255,255,0.26)' }

const errorBar: CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  color: 'rgba(255,230,230,0.98)',
  fontWeight: 900,
}

/* Overlay / Modals */
const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 18,
}

const modal: CSSProperties = {
  width: 860,
  maxWidth: '100%',
  borderRadius: 18,
  border: '1px solid rgba(0,255,255,0.28)',
  background: 'linear-gradient(180deg, rgba(10,18,45,0.95), rgba(6,10,26,0.96))',
  boxShadow: '0 30px 120px rgba(0,0,0,0.65), 0 0 40px rgba(0,255,255,0.12)',
  padding: 16,
}

const modalWide: CSSProperties = { ...modal, width: 980 }

const modalTop: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 14,
  padding: '6px 6px 12px 6px',
  borderBottom: '1px solid rgba(0,255,255,0.16)',
  marginBottom: 12,
}

const modalTitle: CSSProperties = { fontSize: 18, fontWeight: 1000, letterSpacing: 0.2 }
const modalSub: CSSProperties = { marginTop: 3, fontSize: 12.5, fontWeight: 900, opacity: 0.75 }

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 18,
  rowGap: 22,
  padding: '16px 6px',
}

const fieldLabel: CSSProperties = {
  fontSize: 12,
  opacity: 0.85,
  fontWeight: 900,
  marginBottom: 8,
  letterSpacing: 0.35,
}

const input: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.22)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const select: CSSProperties = { ...input, cursor: 'pointer' }

const modalActions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 14,
  padding: '20px 6px 8px',
  borderTop: '1px solid rgba(0,255,255,0.16)',
  marginTop: 20,
}

/* Notes layout */
const notesLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.15fr 0.85fr',
  gap: 12,
  padding: '6px',
}

const notesHistoryBox: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(0,255,255,0.20)',
  background: 'rgba(0,0,0,0.22)',
  overflow: 'hidden',
}

const notesComposeBox: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(0,255,255,0.20)',
  background: 'rgba(0,0,0,0.22)',
  padding: 12,
}

const notesHeaderRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 12px',
  borderBottom: '1px solid rgba(0,255,255,0.14)',
}

const notesHeaderTitle: CSSProperties = { fontWeight: 1000 }
const notesHeaderHint: CSSProperties = { fontWeight: 900, opacity: 0.75, fontSize: 12 }

const notesScroll: CSSProperties = { maxHeight: 360, overflowY: 'auto', padding: 12 }
const notesEmpty: CSSProperties = { opacity: 0.8, fontWeight: 900 }

const noteCard: CSSProperties = {
  padding: '10px 10px',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  marginBottom: 10,
}

const noteMeta: CSSProperties = { fontSize: 11.5, opacity: 0.75, fontWeight: 900, marginBottom: 6 }
const noteText: CSSProperties = { whiteSpace: 'pre-wrap', lineHeight: 1.35, fontWeight: 900 }

const notesTextarea: CSSProperties = {
  width: '100%',
  minHeight: 220,
  borderRadius: 14,
  padding: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.22)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
  resize: 'vertical',
}

const notesTip: CSSProperties = { marginTop: 12, fontSize: 12, opacity: 0.75, fontWeight: 900 }
