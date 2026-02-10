'use client'

import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { CAMPAIGNS, CampaignKey } from '@/lib/campaignConfig'

/**
 * ✅ Supabase columns needed in `leads`:
 * - id (uuid)
 * - campaign (text) ✅ REQUIRED for campaign filtering
 * - lead_ref (text)   (optional)
 * - full_name (text)
 * - phone (text)
 * - email (text)
 * - status (text)
 * - source (text)
 * - assigned_to (text) (optional)
 * - created_at (timestamptz)
 * - notes (text) (optional)
 * - callback_at (timestamptz) (optional)
 * - callback_note (text) (optional)
 * - sent_by_name (text) (optional)        ✅ when status = Sent To Client
 * - sent_to_client (text) (optional)      ✅ when status = Sent To Client
 * - prospect_by_name (text) (optional)    ✅ when status = Prospect Client
 *
 * ✅ Notes history table: `lead_notes`
 * - id (uuid)
 * - lead_id (uuid references leads.id on delete cascade)
 * - note (text)
 * - created_at (timestamptz default now())
 *
 * ✅ DNC backlog table (recommended):
 * - dnc_backlog (phone unique)
 *   - lead_id, full_name, phone, email, lead_ref, source, assigned_to, status, notes, reason, created_by, created_at
 */

type Lead = {
  id: string
  campaign?: string | null
  lead_ref: string | null
  full_name: string
  phone: string
  email: string
  status: string
  source: string
  assigned_to: string | null
  created_at: string
  notes: string | null
  callback_at?: string | null
  callback_note?: string | null

  sent_by_name?: string | null
  sent_to_client?: string | null
  prospect_by_name?: string | null
}

type LeadNote = {
  id: string
  lead_id: string
  note: string
  created_at: string
}

type SheetKey = 'ALL' | 'ACTIVE' | 'ARCHIVE' | 'CLIENTS' | 'PROSPECTS'
const STATUS_ALL = '__ALL__'

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

function makeLeadRefFallback(id: string, prefix = 'ECO') {
  return `${prefix}${shortId(id).toUpperCase()}`
}

function csvEscape(v: unknown) {
  const s = (v ?? '').toString()
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n') + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toLocalInputValue(iso: string) {
  try {
    const d = new Date(iso)
    const tzOffset = d.getTimezoneOffset() * 60000
    const local = new Date(d.getTime() - tzOffset)
    return local.toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

function localInputToIso(v: string) {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

const NoteIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" />
    <path d="M14 3v4a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 12h8M8 16h8M8 8h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

export default function LeadsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ✅ campaign from URL: /leads?campaign=ECO4
  const rawCampaign = (searchParams.get('campaign') || 'ECO4') as CampaignKey
  const campaign: CampaignKey = (rawCampaign in CAMPAIGNS ? rawCampaign : 'ECO4') as CampaignKey
  const cfg = CAMPAIGNS[campaign] || CAMPAIGNS.ECO4

  const LEAD_REF_PREFIX = cfg.leadRefPrefix
  const title = cfg.label

  const STATUS_OPTIONS = (cfg.statusOptions || []) as readonly string[]
  const ACTIVE_STATUSES = (cfg.activeStatuses || []) as readonly string[]
  const ARCHIVE_STATUSES = (cfg.archiveStatuses || []) as readonly string[]
  const SOURCE_OPTIONS = (cfg.sourceOptions || []) as readonly string[]

  const UI_ZOOM = 0.75
  const [useCssZoom, setUseCssZoom] = useState(true)

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
    const isFirefox = ua.includes('firefox')
    setUseCssZoom(!isFirefox)
  }, [])

  const [vw, setVw] = useState<number>(1200)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 1200)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isMobile = vw < 820

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])

  const [sheet, setSheet] = useState<SheetKey>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>(STATUS_ALL)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setStatusFilter(STATUS_ALL)
  }, [sheet])

  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Lead | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [cbOpen, setCbOpen] = useState(false)
  const [cbLead, setCbLead] = useState<Lead | null>(null)
  const [cbWhen, setCbWhen] = useState('')
  const [cbNote, setCbNote] = useState('')
  const [cbSaving, setCbSaving] = useState(false)

  const openCallbackModal = (lead: Lead) => {
    setCbLead(lead)
    setCbNote(lead.callback_note || '')
    setCbWhen(lead.callback_at ? toLocalInputValue(lead.callback_at) : '')
    setCbOpen(true)
  }

  const closeCallbackModal = () => {
    setCbOpen(false)
    setCbLead(null)
    setCbWhen('')
    setCbNote('')
  }

  const saveCallbackForLead = async () => {
    if (!cbLead) return
    const iso = localInputToIso(cbWhen)
    if (!iso) return alert('Pick a callback date & time.')

    setCbSaving(true)

    const payload = {
      status: 'Callback',
      callback_at: iso,
      callback_note: cbNote.trim() || null,
    }

    const { error } = await supabase.from('leads').update(payload).eq('id', cbLead.id)

    if (error) {
      setCbSaving(false)
      alert(`Failed to save callback: ${error.message}`)
      return
    }

    setLeads((prev) => prev.map((l) => (l.id === cbLead.id ? { ...l, status: 'Callback', callback_at: iso, callback_note: cbNote.trim() || null } : l)))

    setCbSaving(false)
    closeCallbackModal()
    alert('✅ Callback saved.')
  }

  const [spOpen, setSpOpen] = useState(false)
  const [spLead, setSpLead] = useState<Lead | null>(null)
  const [spMode, setSpMode] = useState<'SENT' | 'PROSPECT'>('SENT')
  const [spStaff, setSpStaff] = useState('')
  const [spSentTo, setSpSentTo] = useState('')
  const [spSaving, setSpSaving] = useState(false)

  const STAFF_OPTIONS = ['Georgie', 'Admin', 'Staff 1', 'Staff 2'] as const

  const openSentProspectModal = (lead: Lead, mode: 'SENT' | 'PROSPECT') => {
    setSpLead(lead)
    setSpMode(mode)
    setSpStaff(mode === 'SENT' ? lead.sent_by_name || '' : lead.prospect_by_name || '')
    setSpSentTo(mode === 'SENT' ? lead.sent_to_client || '' : '')
    setSpOpen(true)
  }

  const closeSentProspectModal = () => {
    setSpOpen(false)
    setSpLead(null)
    setSpStaff('')
    setSpSentTo('')
    setSpSaving(false)
  }

  const saveSentProspect = async () => {
    if (!spLead) return
    const staff = spStaff.trim()
    const sentTo = spSentTo.trim()

    if (!staff) return alert('Select the staff/admin name.')
    if (spMode === 'SENT' && !sentTo) return alert('Enter who it was sent to.')

    setSpSaving(true)

    const payload: any =
      spMode === 'SENT'
        ? { status: 'Sent To Client', sent_by_name: staff, sent_to_client: sentTo }
        : { status: 'Prospect Client', prospect_by_name: staff }

    const { error } = await supabase.from('leads').update(payload).eq('id', spLead.id)

    if (error) {
      setSpSaving(false)
      alert(`Failed to save: ${error.message}`)
      return
    }

    setLeads((prev) =>
      prev.map((l) =>
        l.id === spLead.id
          ? {
              ...l,
              status: payload.status,
              ...(spMode === 'SENT' ? { sent_by_name: staff, sent_to_client: sentTo } : { prospect_by_name: staff }),
            }
          : l
      )
    )

    setSpSaving(false)
    closeSentProspectModal()
    alert('✅ Saved.')
  }

  const updateLeadStatusQuick = async (lead: Lead, nextStatus: string) => {
    const trigger = cfg.statusTriggers?.[nextStatus] || 'NONE'

    if (trigger === 'CALLBACK') return openCallbackModal(lead)
    if (trigger === 'SENT_TO_CLIENT') return openSentProspectModal(lead, 'SENT')
    if (trigger === 'PROSPECT_CLIENT') return openSentProspectModal(lead, 'PROSPECT')

    const leavingCallback = (lead.status || '').toLowerCase() === 'callback' && nextStatus.toLowerCase() !== 'callback'
    const payload: any = { status: nextStatus }
    if (leavingCallback) {
      payload.callback_at = null
      payload.callback_note = null
    }

    const { error } = await supabase.from('leads').update(payload).eq('id', lead.id)
    if (error) return alert(`Failed to update status: ${error.message}`)

    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: nextStatus, ...(leavingCallback ? { callback_at: null, callback_note: null } : {}) } : l)))
  }

  const alertedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem('t555_callback_alerted') || '[]'
      const arr = JSON.parse(raw) as string[]
      alertedRef.current = new Set(arr)
    } catch {
      alertedRef.current = new Set()
    }
  }, [])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      const windowMs = 60 * 1000

      const due = leads
        .filter((l) => (l.status || '').toLowerCase() === 'callback' && !!l.callback_at)
        .filter((l) => {
          const t = new Date(l.callback_at as string).getTime()
          if (Number.isNaN(t)) return false
          return t <= now + windowMs
        })
        .sort((a, b) => new Date(a.callback_at as string).getTime() - new Date(b.callback_at as string).getTime())

      for (const l of due) {
        const key = `${l.id}:${l.callback_at}`
        if (alertedRef.current.has(key)) continue

        alertedRef.current.add(key)
        try {
          localStorage.setItem('t555_callback_alerted', JSON.stringify(Array.from(alertedRef.current).slice(-500)))
        } catch {}

        const ref = l.lead_ref || makeLeadRefFallback(l.id, LEAD_REF_PREFIX)
        const when = l.callback_at ? formatDateTime(l.callback_at) : ''
        const note = l.callback_note ? `\n\nNote: ${l.callback_note}` : ''
        alert(`⏰ CALLBACK DUE\n\n${ref} • ${l.full_name}\n${when}${note}`)
        break
      }
    }

    const id = window.setInterval(tick, 25_000)
    return () => window.clearInterval(id)
  }, [leads, LEAD_REF_PREFIX])

  const [addOpen, setAddOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newLead, setNewLead] = useState({
    lead_ref: '',
    full_name: '',
    phone: '',
    email: '',
    status: STATUS_OPTIONS?.[0] || 'New Lead',
    source: SOURCE_OPTIONS?.[0] || 'Other',
    assigned_to: '',
    notes: '',
  })

  // keep defaults aligned when campaign changes
  useEffect(() => {
    setNewLead((p) => ({
      ...p,
      status: STATUS_OPTIONS?.includes(p.status) ? p.status : STATUS_OPTIONS?.[0] || 'New Lead',
      source: SOURCE_OPTIONS?.includes(p.source) ? p.source : SOURCE_OPTIONS?.[0] || 'Other',
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign])

  const [notesOpen, setNotesOpen] = useState(false)
  const [notesLead, setNotesLead] = useState<Lead | null>(null)
  const [notesHistory, setNotesHistory] = useState<LeadNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  const fetchLeads = async () => {
    setErrorMsg(null)

    const { data, error } = await supabase
      .from('leads')
      .select('id, campaign, lead_ref, full_name, phone, email, status, source, assigned_to, created_at, notes, callback_at, callback_note, sent_by_name, sent_to_client, prospect_by_name')
      .eq('campaign', campaign)
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
      await fetchLeads()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchLeads()
    setRefreshing(false)
  }

  const sheetStatuses = useMemo(() => {
    if (sheet === 'ACTIVE') return [...ACTIVE_STATUSES]
    if (sheet === 'ARCHIVE') return [...ARCHIVE_STATUSES]
    if (sheet === 'CLIENTS') return ['Sent To Client'] as const
    if (sheet === 'PROSPECTS') return ['Prospect Client'] as const
    return [...STATUS_OPTIONS]
  }, [sheet, STATUS_OPTIONS, ACTIVE_STATUSES, ARCHIVE_STATUSES])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of leads) {
      const s = (l.status || '').trim()
      if (!s) continue
      counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [leads])

  const filteredLeads = useMemo(() => {
    const q = query.trim().toLowerCase()

    const inSheet = (l: Lead) => {
      const status = (l.status || '').trim().toLowerCase()

      if (sheet === 'ALL') return true
      if (sheet === 'CLIENTS') return status === 'sent to client'
      if (sheet === 'PROSPECTS') return status === 'prospect client'

      const list = sheet === 'ACTIVE' ? ACTIVE_STATUSES : ARCHIVE_STATUSES
      return list.some((s) => s.toLowerCase() === status)
    }

    const inStatus = (l: Lead) => {
      if (statusFilter === STATUS_ALL) return true
      const status = (l.status || '').trim()
      return status.toLowerCase() === statusFilter.toLowerCase()
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
        l.callback_at || '',
        l.sent_to_client || '',
        l.sent_by_name || '',
        l.prospect_by_name || '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    }

    return leads.filter((l) => inSheet(l) && inStatus(l) && bySearch(l))
  }, [leads, sheet, statusFilter, query, ACTIVE_STATUSES, ARCHIVE_STATUSES])

  const exportCurrentView = () => {
    const headers = [
      'campaign',
      'lead_ref',
      'full_name',
      'phone',
      'email',
      'status',
      'source',
      'assigned_to',
      'created_at',
      'callback_at',
      'callback_note',
      'sent_by_name',
      'sent_to_client',
      'prospect_by_name',
      'latest_note',
      'id',
    ]

    const rows = filteredLeads.map((l) => [
      l.campaign || campaign,
      l.lead_ref || makeLeadRefFallback(l.id, LEAD_REF_PREFIX),
      l.full_name || '',
      l.phone || '',
      l.email || '',
      l.status || '',
      l.source || '',
      l.assigned_to || '',
      l.created_at || '',
      l.callback_at || '',
      l.callback_note || '',
      l.sent_by_name || '',
      l.sent_to_client || '',
      l.prospect_by_name || '',
      l.notes || '',
      l.id || '',
    ])

    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`triple555_${String(campaign).toLowerCase()}_leads_export_${stamp}.csv`, headers, rows)
  }

  const exportNotesForOpenLead = () => {
    if (!notesLead) return
    const headers = ['campaign', 'lead_ref', 'full_name', 'phone', 'lead_id', 'note_id', 'note_created_at', 'note']
    const rows = (notesHistory || []).map((n) => [
      notesLead.campaign || campaign,
      notesLead.lead_ref || makeLeadRefFallback(notesLead.id, LEAD_REF_PREFIX),
      notesLead.full_name || '',
      notesLead.phone || '',
      notesLead.id,
      n.id,
      n.created_at,
      n.note,
    ])
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(
      `triple555_${String(campaign).toLowerCase()}_notes_${(notesLead.lead_ref || makeLeadRefFallback(notesLead.id, LEAD_REF_PREFIX)).replace(/\s/g, '')}_${stamp}.csv`,
      headers,
      rows
    )
  }

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

      sent_by_name: editDraft.sent_by_name ?? null,
      sent_to_client: editDraft.sent_to_client ?? null,
      prospect_by_name: editDraft.prospect_by_name ?? null,
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
    if (notesLead?.id === lead.id) closeNotes()
  }

  const handleDNC = async (lead: Lead) => {
    const ok = confirm(`Move ${lead.full_name} to DNC backlog and wipe from CRM?`)
    if (!ok) return

    const reason = (prompt('DNC reason (optional):') || 'Do Not Call').trim() || 'Do Not Call'

    const { data: userData } = await supabase.auth.getUser()
    const createdBy = userData?.user?.id ?? null

    const { error: insErr } = await supabase.from('dnc_backlog').insert([
      {
        lead_id: lead.id,
        full_name: lead.full_name,
        phone: lead.phone,
        email: lead.email,
        lead_ref: lead.lead_ref,
        source: lead.source,
        assigned_to: lead.assigned_to,
        status: lead.status,
        notes: lead.notes,
        reason,
        created_by: createdBy,
      },
    ])

    const msg = (insErr?.message || '').toLowerCase()
    const isDuplicatePhone = msg.includes('duplicate key') || msg.includes('already exists') || msg.includes('unique') || msg.includes('dnc_backlog_phone_unique')

    if (insErr && !isDuplicatePhone) {
      alert(`Failed to add to DNC backlog: ${insErr.message}`)
      return
    }

    const { error: delErr } = await supabase.from('leads').delete().eq('id', lead.id)

    if (delErr) {
      alert(`Added to DNC backlog but failed to delete lead: ${delErr.message}`)
      return
    }

    setLeads((prev) => prev.filter((l) => l.id !== lead.id))
    if (editingLeadId === lead.id) cancelEdit()
    if (notesLead?.id === lead.id) closeNotes()

    alert('✅ Lead moved to DNC backlog and wiped from CRM.')
  }

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
    const { data, error } = await supabase.from('lead_notes').insert([{ lead_id: notesLead.id, note }]).select('id, lead_id, note, created_at').single()

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

  const openAdd = () => setAddOpen(true)
  const closeAdd = () => {
    setAddOpen(false)
    setNewLead({
      lead_ref: '',
      full_name: '',
      phone: '',
      email: '',
      status: STATUS_OPTIONS?.[0] || 'New Lead',
      source: SOURCE_OPTIONS?.[0] || 'Other',
      assigned_to: '',
      notes: '',
    })
  }

  const handleAddLead = async () => {
    if (!newLead.full_name.trim()) return alert('Full name is required.')
    setAdding(true)

    const payload: any = {
      campaign, // ✅ ensures correct “sheet” (campaign)

      lead_ref: newLead.lead_ref.trim() || null,
      full_name: newLead.full_name.trim(),
      phone: newLead.phone.trim(),
      email: newLead.email.trim(),
      status: newLead.status,
      source: newLead.source,
      assigned_to: newLead.assigned_to.trim() || null,
      notes: newLead.notes.trim() || null,
      callback_at: null,
      callback_note: null,

      sent_by_name: null,
      sent_to_client: null,
      prospect_by_name: null,
    }

    const { data, error } = await supabase
      .from('leads')
      .insert([payload])
      .select('id, campaign, lead_ref, full_name, phone, email, status, source, assigned_to, created_at, notes, callback_at, callback_note, sent_by_name, sent_to_client, prospect_by_name')
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

  const zoomWrap: CSSProperties = useCssZoom
    ? { zoom: UI_ZOOM }
    : {
        transform: `scale(${UI_ZOOM})`,
        transformOrigin: 'top left',
        width: `${100 / UI_ZOOM}%`,
      }

  return (
    <div style={page}>
      <Sidebar />

      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={zoomWrap}>
        <div style={{ ...container, padding: isMobile ? '18px 12px' : '34px 18px' }}>
          <div style={headerWrap}>
            <div style={brandRow}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => router.push('/dashboard')} style={btnSm} title="Back to Dashboard">
                  ← Dashboard
                </button>

                <div style={brandPill}>
                  <span style={dot} />
                  <span style={{ opacity: 0.95 }}>Triple 555 CRM</span>
                </div>

                {/* ✅ RESTORED CAMPAIGN DROPDOWN */}
                <div style={{ ...brandPill, background: 'rgba(0,140,255,0.10)', border: '1px solid rgba(0,140,255,0.30)', gap: 8 }}>
                  <span style={{ ...dot, background: 'rgba(0,140,255,0.95)' }} />
                  <span style={{ opacity: 0.95 }}>{String(campaign)}</span>

                  <select
                    value={campaign}
                    onChange={(e) => {
                      const next = e.target.value as CampaignKey
                      router.push(`/leads?campaign=${next}`)
                    }}
                    style={{
                      ...selectInline,
                      minWidth: 180,
                      maxWidth: 260,
                      borderRadius: 999,
                      height: 34,
                      padding: '0 10px',
                      background: 'rgba(0,0,0,0.35)',
                    }}
                    title="Pick campaign"
                  >
                    {Object.keys(CAMPAIGNS).map((k) => {
                      const key = k as CampaignKey
                      return (
                        <option key={key} value={key}>
                          {CAMPAIGNS[key].label}
                        </option>
                      )
                    })}
                  </select>
                </div>
              </div>
            </div>

            <div
              style={{
                ...header,
                flexDirection: isMobile ? ('column' as const) : ('row' as const),
                alignItems: isMobile ? ('stretch' as const) : ('center' as const),
              }}
            >
              <div style={headerLeft}>
                <div style={avatar}>T5</div>
                <div>
                  <div style={h1}>{title}</div>
                  <div style={subtitle}>Status dropdown → campaign triggers open overlays → saved into Supabase.</div>
                </div>
              </div>

              <div
                style={{
                  ...headerRight,
                  justifyContent: isMobile ? 'flex-start' : 'flex-end',
                  flexWrap: 'wrap',
                  gap: 10,
                  width: isMobile ? '100%' : undefined,
                }}
              >
                <button onClick={handleRefresh} style={btnSm} disabled={refreshing} aria-disabled={refreshing} title="Refresh">
                  {refreshing ? 'Refreshing…' : '↻ Refresh'}
                </button>

                <button onClick={() => router.push('/leads/import')} style={btnSm} title="Import leads from CSV">
                  Import
                </button>

                <button onClick={exportCurrentView} style={btnSm} title="Export what you’re currently viewing">
                  Export CSV
                </button>

                <button onClick={openAdd} style={btnPrimary}>
                  + New Lead
                </button>
              </div>
            </div>

            <div style={{ ...toolbar, alignItems: isMobile ? 'stretch' : 'center' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <TabButton label="All" active={sheet === 'ALL'} onClick={() => setSheet('ALL')} />
                <TabButton label="Active" active={sheet === 'ACTIVE'} onClick={() => setSheet('ACTIVE')} />
                <TabButton label="Archive" active={sheet === 'ARCHIVE'} onClick={() => setSheet('ARCHIVE')} />
                <TabButton label="Clients" active={sheet === 'CLIENTS'} onClick={() => setSheet('CLIENTS')} />
                <TabButton label="Prospects" active={sheet === 'PROSPECTS'} onClick={() => setSheet('PROSPECTS')} />
              </div>

              <div style={{ ...searchWrap, maxWidth: isMobile ? '100%' : 620 }}>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lead_ref, name, phone, email, assigned_to, sent to, staff…" style={search} />
              </div>
            </div>

            <div style={statusChipsRow}>
              <button onClick={() => setStatusFilter(STATUS_ALL)} style={statusFilter === STATUS_ALL ? statusChipActive : statusChip} title="Show all statuses in this sheet">
                All <span style={countPill}>{filteredCountForAll(sheet, leads, ACTIVE_STATUSES, ARCHIVE_STATUSES)}</span>
              </button>

              {sheetStatuses.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)} style={statusFilter === s ? statusChipActive : statusChip} title={`Filter: ${s}`}>
                  {s} <span style={countPill}>{statusCounts[s] || 0}</span>
                </button>
              ))}
            </div>
          </div>

          {errorMsg && (
            <div style={errorBar}>
              <b>Supabase error:</b>&nbsp;{errorMsg}
            </div>
          )}

          <div style={panel}>
            <div style={panelHeader}>
              <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Leads</div>
              <div style={{ opacity: 0.85, fontWeight: 800 }}>
                Showing <span style={{ color: 'rgba(120,255,255,0.95)' }}>{filteredLeads.length}</span> of {leads.length}
              </div>
            </div>

            {loading ? (
              <div style={loadingBox}>Loading leads…</div>
            ) : filteredLeads.length === 0 ? (
              <div style={emptyBox}>No leads found. Try changing sheet/status or clearing your search.</div>
            ) : isMobile ? (
              <div style={cardsWrap}>
                {filteredLeads.map((lead) => {
                  const isEditing = editingLeadId === lead.id
                  const refToShow = lead.lead_ref || makeLeadRefFallback(lead.id, LEAD_REF_PREFIX)
                  const lowerStatus = (lead.status || '').toLowerCase()

                  return (
                    <div key={lead.id} style={card}>
                      <div style={cardTopRow}>
                        <span style={pillRef}>{refToShow}</span>
                        <span style={pillDate}>{formatDate(lead.created_at)}</span>
                      </div>

                      <div style={cardNameRow}>
                        {isEditing ? (
                          <input style={inputInline} value={editDraft?.full_name || ''} onChange={(e) => setEditDraft((p) => (p ? { ...p, full_name: e.target.value } : p))} />
                        ) : (
                          <div style={cardName}>{lead.full_name}</div>
                        )}

                        {!isEditing && (
                          <select style={{ ...selectInline, maxWidth: 210 }} value={lead.status} onChange={(e) => updateLeadStatusQuick(lead, e.target.value)} title="Change status">
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {lowerStatus === 'callback' && lead.callback_at && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span style={pillDate}>⏰ {formatDateTime(lead.callback_at)}</span>
                          {lead.callback_note ? <span style={pillId}>📝 {lead.callback_note}</span> : null}
                        </div>
                      )}

                      {lowerStatus === 'sent to client' && lead.sent_to_client ? (
                        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span style={pillDate}>🏷 {lead.sent_to_client}</span>
                          {lead.sent_by_name ? <span style={pillId}>🧑‍💼 {lead.sent_by_name}</span> : null}
                        </div>
                      ) : null}

                      {lowerStatus === 'prospect client' && lead.prospect_by_name ? (
                        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <span style={pillDate}>🧑‍💼 {lead.prospect_by_name}</span>
                        </div>
                      ) : null}

                      <div style={cardGrid}>
                        <div style={cardItem}>
                          <div style={cardLabel}>Phone</div>
                          {isEditing ? (
                            <input style={inputInline} value={editDraft?.phone || ''} onChange={(e) => setEditDraft((p) => (p ? { ...p, phone: e.target.value } : p))} />
                          ) : (
                            <div style={cardValue}>{lead.phone || '—'}</div>
                          )}
                        </div>

                        <div style={cardItem}>
                          <div style={cardLabel}>Email</div>
                          {isEditing ? (
                            <input style={inputInline} value={editDraft?.email || ''} onChange={(e) => setEditDraft((p) => (p ? { ...p, email: e.target.value } : p))} />
                          ) : (
                            <div style={cardValue}>{lead.email || '—'}</div>
                          )}
                        </div>

                        <div style={cardItem}>
                          <div style={cardLabel}>Source</div>
                          {isEditing ? (
                            <select
                              style={selectInline}
                              value={editDraft?.source || (SOURCE_OPTIONS?.[0] || 'Other')}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, source: e.target.value } : p))}
                            >
                              {SOURCE_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div style={cardValue}>{lead.source || '—'}</div>
                          )}
                        </div>

                        <div style={cardItem}>
                          <div style={cardLabel}>Assigned</div>
                          {isEditing ? (
                            <input style={inputInline} value={editDraft?.assigned_to || ''} onChange={(e) => setEditDraft((p) => (p ? { ...p, assigned_to: e.target.value } : p))} />
                          ) : (
                            <div style={cardValue}>{lead.assigned_to || '—'}</div>
                          )}
                        </div>

                        <div style={{ ...cardItem, gridColumn: '1 / -1' }}>
                          <div style={cardLabel}>Status (Edit Mode)</div>
                          {isEditing ? (
                            <select
                              style={selectInline}
                              value={editDraft?.status || (STATUS_OPTIONS?.[0] || 'New Lead')}
                              onChange={(e) => setEditDraft((p) => (p ? { ...p, status: e.target.value } : p))}
                            >
                              {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div style={{ marginTop: 6 }}>
                              <span style={statusPill(lead.status)}>{lead.status}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={cardActions}>
                        {isEditing ? (
                          <>
                            <button style={btnPrimarySm} onClick={saveEdit} disabled={savingEdit}>
                              {savingEdit ? 'Saving…' : 'Save'}
                            </button>
                            <button style={btnSm} onClick={cancelEdit} disabled={savingEdit}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button style={btnIcon} onClick={() => openNotes(lead)} title={lead.notes ? `Latest: ${lead.notes}` : 'Open notes'} aria-label="Open notes">
                              <NoteIcon size={16} />
                            </button>

                            <button style={btnSm} onClick={() => startEdit(lead)} title="Edit lead">
                              Edit
                            </button>

                            <button style={btnWarnSm} onClick={() => handleDNC(lead)} title="DNC (Wipe)">
                              DNC
                            </button>

                            <button style={btnDangerSm} onClick={() => handleDelete(lead)} title="Delete lead">
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={tableWrap}>
                <table style={table}>
                  <colgroup>
                    <col style={{ width: 120 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 320 }} />
                    <col style={{ width: 420 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 170 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 240 }} />
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
                      <th style={th}>Assigned</th>
                      <th style={th}>Added</th>
                      <th style={th}>Notes</th>
                      <th style={thRight}>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredLeads.map((lead, i) => {
                      const isEditing = editingLeadId === lead.id
                      const refToShow = lead.lead_ref || makeLeadRefFallback(lead.id, LEAD_REF_PREFIX)
                      const lowerStatus = (lead.status || '').toLowerCase()

                      return (
                        <tr key={lead.id} style={{ ...tr, background: i % 2 === 0 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.02)' }}>
                          <td style={tdMono}>
                            {isEditing ? (
                              <input
                                style={inputInline}
                                value={editDraft?.lead_ref || ''}
                                onChange={(e) => setEditDraft((p) => (p ? { ...p, lead_ref: e.target.value } : p))}
                                placeholder={`${LEAD_REF_PREFIX}0001`}
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
                              <input style={inputInline} value={editDraft?.full_name || ''} onChange={(e) => setEditDraft((p) => (p ? { ...p, full_name: e.target.value } : p))} />
                            ) : (
                              <span style={{ fontWeight: 950 }}>{lead.full_name}</span>
                            )}
                          </td>

                          <td style={td}>
                            {isEditing ? (
                              <input style={inputInline} value={editDraft?.phone || ''} onChange={(e) => setEditDraft((p) => (p ? { ...p, phone: e.target.value } : p))} />
                            ) : (
                              <span style={{ fontWeight: 950 }}>{lead.phone}</span>
                            )}
                          </td>

                          <td style={td}>
                            {isEditing ? (
                              <input style={inputInline} value={editDraft?.email || ''} onChange={(e) => setEditDraft((p) => (p ? { ...p, email: e.target.value } : p))} />
                            ) : (
                              <span style={{ fontWeight: 900 }}>{lead.email}</span>
                            )}
                          </td>

                          <td style={td}>
                            {isEditing ? (
                              <select
                                style={selectInline}
                                value={editDraft?.status || (STATUS_OPTIONS?.[0] || 'New Lead')}
                                onChange={(e) => setEditDraft((p) => (p ? { ...p, status: e.target.value } : p))}
                              >
                                {STATUS_OPTIONS.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                                <select
                                  style={{ ...selectInline, minWidth: 170 }}
                                  value={lead.status}
                                  onChange={(e) => updateLeadStatusQuick(lead, e.target.value)}
                                  title="Change status (campaign triggers open overlays)"
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>

                                {lowerStatus === 'callback' && lead.callback_at ? (
                                  <span style={pillDate} title={lead.callback_note || ''}>
                                    ⏰ {formatDateTime(lead.callback_at)}
                                  </span>
                                ) : null}

                                {lowerStatus === 'sent to client' && lead.sent_to_client ? (
                                  <span style={pillDate} title={lead.sent_by_name || ''}>
                                    🏷 {lead.sent_to_client}
                                    {lead.sent_by_name ? ` • ${lead.sent_by_name}` : ''}
                                  </span>
                                ) : null}

                                {lowerStatus === 'prospect client' && lead.prospect_by_name ? (
                                  <span style={pillDate} title="Prospect owner">
                                    🧑‍💼 {lead.prospect_by_name}
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </td>

                          <td style={td}>
                            {isEditing ? (
                              <select
                                style={selectInline}
                                value={editDraft?.source || (SOURCE_OPTIONS?.[0] || 'Other')}
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
                            <button style={btnIcon} onClick={() => openNotes(lead)} title={lead.notes ? `Latest: ${lead.notes}` : 'Open notes'} aria-label="Open notes">
                              <NoteIcon size={16} />
                            </button>
                          </td>

                          <td style={tdRight}>
                            {isEditing ? (
                              <div style={actionsRow}>
                                <button style={btnPrimarySm} onClick={saveEdit} disabled={savingEdit}>
                                  {savingEdit ? 'Saving…' : 'Save'}
                                </button>
                                <button style={btnSm} onClick={cancelEdit} disabled={savingEdit}>
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={actionsRow}>
                                <button style={btnSm} onClick={() => startEdit(lead)} title="Edit lead">
                                  Edit
                                </button>

                                <button style={btnWarnSm} onClick={() => handleDNC(lead)} title="DNC (Wipe)">
                                  DNC
                                </button>

                                <button style={btnDangerSm} onClick={() => handleDelete(lead)} title="Delete lead">
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

          {/* Add Lead (✅ FIXED: header + removed duplicate close button) */}
          {addOpen && (
            <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && closeAdd()}>
              <div style={modal}>
                <div style={modalTop}>
                  <div>
                    <div style={modalTitle}>Add New Lead</div>
                    <div style={modalSub}>This creates a new record in Supabase.</div>

                    <div style={{ ...modalSub, marginTop: 6, opacity: 0.95 }}>
                      This will be saved to: <b>{cfg.label}</b> ({campaign})
                    </div>
                  </div>

                  <button style={btnSm} onClick={closeAdd} disabled={adding}>
                    ✕
                  </button>
                </div>

                <div style={{ ...formGrid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                  <Field label="Lead Ref (optional)">
                    <input style={input} value={newLead.lead_ref} onChange={(e) => setNewLead((p) => ({ ...p, lead_ref: e.target.value }))} placeholder={`${LEAD_REF_PREFIX}0001`} />
                  </Field>

                  <Field label="Assigned To (optional)">
                    <input style={input} value={newLead.assigned_to} onChange={(e) => setNewLead((p) => ({ ...p, assigned_to: e.target.value }))} placeholder="Georgie" />
                  </Field>

                  <Field label="Full Name">
                    <input style={input} value={newLead.full_name} onChange={(e) => setNewLead((p) => ({ ...p, full_name: e.target.value }))} placeholder="John Graham" />
                  </Field>

                  <Field label="Phone">
                    <input style={input} value={newLead.phone} onChange={(e) => setNewLead((p) => ({ ...p, phone: e.target.value }))} placeholder="07..." />
                  </Field>

                  <Field label="Email">
                    <input style={input} value={newLead.email} onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))} placeholder="name@email.com" />
                  </Field>

                  <Field label="Status">
                    <select style={select} value={newLead.status} onChange={(e) => setNewLead((p) => ({ ...p, status: e.target.value }))}>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Source">
                    <select style={select} value={newLead.source} onChange={(e) => setNewLead((p) => ({ ...p, source: e.target.value }))}>
                      {SOURCE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Notes (optional)" full>
                    <textarea
                      style={{ ...input, minHeight: 160, paddingTop: 14, paddingBottom: 14, resize: 'vertical' as const }}
                      value={newLead.notes}
                      onChange={(e) => setNewLead((p) => ({ ...p, notes: e.target.value }))}
                      placeholder="Initial notes..."
                    />
                  </Field>
                </div>

                <div style={modalActions}>
                  <button style={btnSm} onClick={closeAdd} disabled={adding}>
                    Cancel
                  </button>
                  <button style={btnPrimary} onClick={handleAddLead} disabled={adding}>
                    {adding ? 'Adding…' : 'Add Lead'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {notesOpen && notesLead && (
            <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && closeNotes()}>
              <div style={modalWide}>
                <div style={modalTop}>
                  <div>
                    <div style={modalTitle}>
                      Notes — <span style={{ color: 'rgba(120,255,255,0.95)' }}>{notesLead.full_name}</span>
                    </div>
                    <div style={modalSub}>
                      Lead Ref: <b>{notesLead.lead_ref || makeLeadRefFallback(notesLead.id, LEAD_REF_PREFIX)}</b> • Added: <b>{formatDate(notesLead.created_at)}</b> • Assigned:{' '}
                      <b>{notesLead.assigned_to || '—'}</b>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={btnSm} onClick={exportNotesForOpenLead} title="Export notes history CSV">
                      Export Notes
                    </button>
                    <button style={btnSm} onClick={closeNotes}>
                      ✕
                    </button>
                  </div>
                </div>

                <div style={{ ...notesLayout, gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr' }}>
                  <div style={notesHistoryBox}>
                    <div style={notesHeaderRow}>
                      <div style={notesHeaderTitle}>History</div>
                      <div style={notesHeaderHint}>{notesLoading ? 'Loading…' : `${notesHistory.length} note(s)`}</div>
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

                    <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button style={btnSm} onClick={closeNotes} disabled={addingNote}>
                        Close
                      </button>
                      <button style={btnPrimary} onClick={addNote} disabled={addingNote}>
                        {addingNote ? 'Adding…' : 'Add Note'}
                      </button>
                    </div>

                    <div style={notesTip}>Tip: keep notes short + dated. Your future self will thank you.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Callback Modal */}
          {cbOpen && cbLead && (
            <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && closeCallbackModal()}>
              <div style={{ ...modal, width: 760 }}>
                <div style={modalTop}>
                  <div>
                    <div style={modalTitle}>
                      Callback — <span style={{ color: 'rgba(120,255,255,0.95)' }}>{cbLead.full_name}</span>
                    </div>
                    <div style={modalSub}>
                      Lead Ref: <b>{cbLead.lead_ref || makeLeadRefFallback(cbLead.id, LEAD_REF_PREFIX)}</b> • Phone: <b>{cbLead.phone || '—'}</b>
                    </div>
                  </div>

                  <button style={btnSm} onClick={closeCallbackModal} disabled={cbSaving}>
                    ✕
                  </button>
                </div>

                <div style={{ padding: '10px 6px 4px' }}>
                  <div style={fieldLabel}>Pick date & time</div>
                  <input type="datetime-local" style={input} value={cbWhen} onChange={(e) => setCbWhen(e.target.value)} min={toLocalInputValue(new Date().toISOString())} />

                  <div style={{ height: 14 }} />

                  <div style={fieldLabel}>Optional note</div>
                  <textarea
                    style={{ ...input, minHeight: 120, resize: 'vertical' as const, paddingTop: 12, paddingBottom: 12 }}
                    value={cbNote}
                    onChange={(e) => setCbNote(e.target.value)}
                    placeholder="e.g. call back after work, prefers afternoon, discussed eligibility..."
                  />

                  <div style={modalActions}>
                    <button style={btnSm} onClick={closeCallbackModal} disabled={cbSaving}>
                      Cancel
                    </button>
                    <button style={btnPrimary} onClick={saveCallbackForLead} disabled={cbSaving}>
                      {cbSaving ? 'Saving…' : 'Save Callback'}
                    </button>
                  </div>

                  <div style={{ ...notesTip, marginTop: 6 }}>Alerts trigger on this page when callback time is due (and won’t repeat for the same time).</div>
                </div>
              </div>
            </div>
          )}

          {/* Sent / Prospect Modal */}
          {spOpen && spLead && (
            <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && closeSentProspectModal()}>
              <div style={{ ...modal, width: 760 }}>
                <div style={modalTop}>
                  <div>
                    <div style={modalTitle}>
                      {spMode === 'SENT' ? 'Sent To Client' : 'Prospect Client'} — <span style={{ color: 'rgba(120,255,255,0.95)' }}>{spLead.full_name}</span>
                    </div>
                    <div style={modalSub}>
                      Lead Ref: <b>{spLead.lead_ref || makeLeadRefFallback(spLead.id, LEAD_REF_PREFIX)}</b> • Phone: <b>{spLead.phone || '—'}</b>
                    </div>
                  </div>

                  <button style={btnSm} onClick={closeSentProspectModal} disabled={spSaving}>
                    ✕
                  </button>
                </div>

                <div style={{ padding: '10px 6px 4px' }}>
                  <div style={fieldLabel}>Staff/Admin name</div>
                  <select style={select} value={spStaff} onChange={(e) => setSpStaff(e.target.value)}>
                    <option value="">Select…</option>
                    {STAFF_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  {spMode === 'SENT' && (
                    <>
                      <div style={{ height: 14 }} />
                      <div style={fieldLabel}>Sent to (client name)</div>
                      <input style={input} value={spSentTo} onChange={(e) => setSpSentTo(e.target.value)} placeholder="e.g. Emma — ER Web Leads" />
                    </>
                  )}

                  <div style={modalActions}>
                    <button style={btnSm} onClick={closeSentProspectModal} disabled={spSaving}>
                      Cancel
                    </button>
                    <button style={btnPrimary} onClick={saveSentProspect} disabled={spSaving || !spStaff.trim() || (spMode === 'SENT' && !spSentTo.trim())}>
                      {spSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>

                  <div style={{ ...notesTip, marginTop: 6 }}>
                    {spMode === 'SENT'
                      ? 'This records who sent it, and which client it was sent to. The lead will appear under Clients tab.'
                      : 'This records which staff/admin owns the prospect. The lead will appear under Prospects tab.'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

/* -----------------------------
   Small components
------------------------------ */

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={active ? tabBtnActive : tabBtn}>
      {label}
    </button>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, marginBottom: 6 }}>
      <div style={fieldLabel}>{label}</div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  )
}

function filteredCountForAll(sheet: SheetKey, leads: Lead[], ACTIVE_STATUSES: readonly string[], ARCHIVE_STATUSES: readonly string[]) {
  if (sheet === 'ALL') return leads.length
  if (sheet === 'CLIENTS') return leads.filter((l) => (l.status || '').toLowerCase() === 'sent to client').length
  if (sheet === 'PROSPECTS') return leads.filter((l) => (l.status || '').toLowerCase() === 'prospect client').length

  const list = sheet === 'ACTIVE' ? ACTIVE_STATUSES : ARCHIVE_STATUSES
  const set = new Set(list.map((s) => s.toLowerCase()))
  return leads.filter((l) => set.has((l.status || '').toLowerCase())).length
}

/* -----------------------------
   Styles (royal blue + cyan)
------------------------------ */

const page: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.08), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
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
  width: '100%',
  maxWidth: 2400,
  margin: '0 auto',
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
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,255,0.08) inset, 0 0 40px rgba(0,255,255,0.10)',
  backdropFilter: 'blur(10px)',
}

const headerLeft: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }
const headerRight: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center' }

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

const toolbar: CSSProperties = {
  marginTop: 14,
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
}

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

const searchWrap: CSSProperties = { flex: 1, minWidth: 280, maxWidth: 620 }

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

const statusChipsRow: CSSProperties = {
  marginTop: 12,
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
}

const statusChip: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.90)',
  fontWeight: 950,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const statusChipActive: CSSProperties = {
  ...statusChip,
  background: 'rgba(0,255,255,0.12)',
  border: '1px solid rgba(0,255,255,0.36)',
  boxShadow: '0 0 22px rgba(0,255,255,0.12)',
}

const countPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.28)',
  border: '1px solid rgba(255,255,255,0.10)',
  fontSize: 12,
  fontWeight: 1000,
  opacity: 0.9,
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

const tableWrap: CSSProperties = { width: '100%', overflowX: 'auto' }
const table: CSSProperties = {
  width: '100%',
  minWidth: 1950,
  borderCollapse: 'separate',
  borderSpacing: 0,
  tableLayout: 'fixed',
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
const tr: CSSProperties = { background: 'rgba(0,0,0,0.10)' }

const td: CSSProperties = {
  padding: '10px 12px',
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
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
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
  if (s === 'sent to client') return { ...base, border: '1px solid rgba(0,200,255,0.32)', background: 'rgba(0,200,255,0.10)' }
  if (s === 'looking for home') return { ...base, border: '1px solid rgba(0,255,180,0.32)', background: 'rgba(0,255,180,0.10)' }
  if (s === 'prospect client') return { ...base, border: '1px solid rgba(0,160,255,0.35)', background: 'rgba(0,160,255,0.12)' }
  return base
}

const actionsRow: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  whiteSpace: 'nowrap',
}

const btnSmBase: CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderRadius: 12,
  fontWeight: 950,
  fontSize: 12.5,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const btnSm: CSSProperties = { ...btnSmBase }

const btnPrimary: CSSProperties = {
  ...btnSmBase,
  height: 38,
  padding: '0 12px',
  border: '1px solid rgba(0,255,255,0.55)',
  background: 'linear-gradient(135deg, rgba(0,255,255,0.95), rgba(0,140,255,0.90))',
  boxShadow: '0 0 26px rgba(0,255,255,0.18)',
  color: '#001122',
  fontWeight: 1000,
}

const btnPrimarySm: CSSProperties = {
  ...btnSmBase,
  border: '1px solid rgba(0,255,255,0.40)',
  background: 'rgba(0,255,255,0.12)',
  boxShadow: '0 0 16px rgba(0,255,255,0.08)',
}

const btnWarnSm: CSSProperties = {
  ...btnSmBase,
  background: 'rgba(255,210,90,0.12)',
  border: '1px solid rgba(255,210,90,0.30)',
  color: 'rgba(255,245,220,0.98)',
}

const btnDangerSm: CSSProperties = {
  ...btnSmBase,
  background: 'rgba(255,50,50,0.14)',
  border: '1px solid rgba(255,50,50,0.35)',
  color: 'rgba(255,210,210,0.98)',
}

const btnIcon: CSSProperties = {
  height: 34,
  width: 38,
  borderRadius: 12,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,255,0.22)',
  background: 'rgba(0,255,255,0.08)',
  color: 'rgba(210,255,255,0.95)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const errorBar: CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  color: 'rgba(255,230,230,0.98)',
  fontWeight: 900,
}

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

const notesLayout: CSSProperties = { display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 12, padding: '6px' }

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

const cardsWrap: CSSProperties = {
  padding: 12,
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 12,
}

const card: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(0,255,255,0.20)',
  background: 'rgba(0,0,0,0.18)',
  padding: 12,
  boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
}

const cardTopRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }

const cardNameRow: CSSProperties = {
  marginTop: 10,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
}

const cardName: CSSProperties = { fontWeight: 1000, fontSize: 16, letterSpacing: 0.2 }

const cardGrid: CSSProperties = {
  marginTop: 10,
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
}

const cardItem: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  padding: 10,
  overflow: 'hidden',
}

const cardLabel: CSSProperties = {
  fontSize: 11,
  opacity: 0.75,
  fontWeight: 900,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
}

const cardValue: CSSProperties = { marginTop: 6, fontWeight: 950, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

const cardActions: CSSProperties = {
  marginTop: 12,
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
}
