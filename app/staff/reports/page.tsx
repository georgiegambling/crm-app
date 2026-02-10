'use client'

import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type ViewMode = 'TEAM' | 'MINE'
type ReportStatus = 'Potential Client' | 'Client' | 'Callback'

type SalesReportRow = {
  id: number
  report_ref: string
  report_date: string

  status: ReportStatus | string

  company_name: string
  client_contact_name: string | null
  client_phone: string | null
  client_email: string | null

  campaign_name: string | null
  sale_price: number | null
  records_sent: number | null

  callback_at: string | null // ✅

  // legacy/backwards compat
  client_name: string | null
  sales_rep: string | null
  rep_user_id: string | null

  profiles: {
    display_name: string | null
    email: string | null
  } | null
}

type NewSaleForm = {
  report_ref: string
  report_date: string
  status: ReportStatus
  company_name: string
  client_contact_name: string
  client_phone: string
  client_email: string
  campaign_name: string
  sale_price: string
  records_sent: string
  callback_at: string // ✅ ISO string or ''
  initial_note: string
}

type EditSaleForm = Omit<NewSaleForm, 'initial_note'> & {
  // keep same fields minus initial_note
}

type SRAttachment = {
  id: string
  report_id: number
  note_id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  public_url: string
  created_at: string
}

type SRNote = {
  id: string
  report_id: string
  note: string
  created_at: string
  created_by: string | null
  sales_report_note_attachments: SRAttachment[]
}

const BUCKET = 'sales-report-attachments'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function makeReportRef() {
  const d = new Date()
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const rnd = Math.floor(1000 + Math.random() * 9000)
  return `SR-${y}${m}${day}-${rnd}`
}

function formatDateTime(d: string) {
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

function isImageMime(mime?: string | null) {
  return !!mime && mime.startsWith('image/')
}

function safeNumberOrNull(v: string) {
  const t = (v ?? '').trim()
  if (!t) return null
  const n = Number(String(t).replace(/,/g, ''))
  if (Number.isNaN(n)) return NaN
  return n
}

function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function toCsv(rows: SalesReportRow[]) {
  const header = [
    'Ref',
    'Date',
    'Status',
    'Callback At',
    'Company',
    'Client Contact',
    'Client Phone',
    'Client Email',
    'Campaign',
    'Sale (£)',
    'Records',
    'Rep Name',
    'Rep Email',
    'Report ID',
  ]
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.report_ref,
        new Date(r.report_date).toISOString(),
        r.status ?? '',
        r.callback_at ?? '',
        r.company_name ?? '',
        r.client_contact_name ?? '',
        r.client_phone ?? '',
        r.client_email ?? '',
        r.campaign_name ?? '',
        r.sale_price ?? '',
        r.records_sent ?? '',
        r.profiles?.display_name ?? r.sales_rep ?? '',
        r.profiles?.email ?? '',
        r.id ?? '',
      ]
        .map(escape)
        .join(',')
    ),
  ]
  return lines.join('\n')
}

export default function StaffReportsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [rows, setRows] = useState<SalesReportRow[]>([])
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ViewMode>('TEAM')
  const [userId, setUserId] = useState<string | null>(null)

  // ✅ Alerts
  const [overdueCount, setOverdueCount] = useState(0)
  const [dueSoonCount, setDueSoonCount] = useState(0)

  // Add sale modal
  const [openAdd, setOpenAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<NewSaleForm>(() => ({
    report_ref: makeReportRef(),
    report_date: new Date().toISOString(),
    status: 'Potential Client',
    company_name: '',
    client_contact_name: '',
    client_phone: '',
    client_email: '',
    campaign_name: '',
    sale_price: '',
    records_sent: '',
    callback_at: '', // ✅
    initial_note: '',
  }))
  const [initialFiles, setInitialFiles] = useState<File[]>([])
  const initialFileInputRef = useRef<HTMLInputElement | null>(null)

  // ✅ Edit sale modal
  const [openEdit, setOpenEdit] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<EditSaleForm>(() => ({
    report_ref: '',
    report_date: '',
    status: 'Potential Client',
    company_name: '',
    client_contact_name: '',
    client_phone: '',
    client_email: '',
    campaign_name: '',
    sale_price: '',
    records_sent: '',
    callback_at: '', // ✅
  }))

  // Notes overlay
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesReport, setNotesReport] = useState<SalesReportRow | null>(null)
  const [notesHistory, setNotesHistory] = useState<SRNote[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [noteFiles, setNoteFiles] = useState<File[]>([])
  const [addingNote, setAddingNote] = useState(false)
  const noteFileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    ;(async () => {
      // ✅ avoid "Invalid Refresh Token" spam by checking session first
      const { data: s } = await supabase.auth.getSession()
      if (!s.session) {
        setUserId(null)
        return
      }

      const { data, error } = await supabase.auth.getUser()

      // ✅ if session storage is broken, reset cleanly
      if (error?.message?.toLowerCase().includes('refresh token')) {
        await supabase.auth.signOut()
        setUserId(null)
        return
      }

      setUserId(data?.user?.id ?? null)
    })()
  }, [])

  const repLabel = (r: SalesReportRow) => r.profiles?.display_name || r.profiles?.email || r.sales_rep || '—'
  const canDelete = (r: SalesReportRow) => !!userId && r.rep_user_id === userId
  const canEdit = (r: SalesReportRow) => !!userId && r.rep_user_id === userId

  const fetchReports = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    let q = supabase
      .from('sales_reports')
      .select(
        `
        id,
        report_ref,
        report_date,
        status,
        company_name,
        client_contact_name,
        client_phone,
        client_email,
        campaign_name,
        sale_price,
        records_sent,
        callback_at,
        client_name,
        sales_rep,
        rep_user_id,
        profiles (
          display_name,
          email
        )
      `
      )
      .order('report_date', { ascending: false })

    if (mode === 'MINE' && userId) q = q.eq('rep_user_id', userId)

    const { data, error } = await q
    if (error) {
      setErrorMsg(error.message)
      setRows([])
      return
    }

    setRows((data ?? []) as unknown as SalesReportRow[])
  }

  // ✅ Alerts polling (sales_reports, not leads)
  useEffect(() => {
    const i = setInterval(async () => {
      if (!userId) {
        setOverdueCount(0)
        setDueSoonCount(0)
        return
      }

      const now = new Date()
      const nowIso = now.toISOString()
      const soonIso = new Date(now.getTime() + 30 * 60 * 1000).toISOString() // next 30 mins

      // overdue
      let q1 = supabase
        .from('sales_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Callback')
        .not('callback_at', 'is', null)
        .lte('callback_at', nowIso)

      if (mode === 'MINE') q1 = q1.eq('rep_user_id', userId)

      const overdue = await q1
      setOverdueCount(overdue.count ?? 0)

      // due soon
      let q2 = supabase
        .from('sales_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Callback')
        .not('callback_at', 'is', null)
        .gt('callback_at', nowIso)
        .lte('callback_at', soonIso)

      if (mode === 'MINE') q2 = q2.eq('rep_user_id', userId)

      const dueSoon = await q2
      setDueSoonCount(dueSoon.count ?? 0)
    }, 30000)

    // run once immediately (so you don’t wait 30s)
    ;(async () => {
      if (!userId) return
      const now = new Date()
      const nowIso = now.toISOString()
      const soonIso = new Date(now.getTime() + 30 * 60 * 1000).toISOString()

      let q1 = supabase
        .from('sales_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Callback')
        .not('callback_at', 'is', null)
        .lte('callback_at', nowIso)
      if (mode === 'MINE') q1 = q1.eq('rep_user_id', userId)
      const overdue = await q1
      setOverdueCount(overdue.count ?? 0)

      let q2 = supabase
        .from('sales_reports')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Callback')
        .not('callback_at', 'is', null)
        .gt('callback_at', nowIso)
        .lte('callback_at', soonIso)
      if (mode === 'MINE') q2 = q2.eq('rep_user_id', userId)
      const dueSoon = await q2
      setDueSoonCount(dueSoon.count ?? 0)
    })()

    return () => clearInterval(i)
  }, [userId, mode])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await fetchReports()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userId])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchReports()
    setRefreshing(false)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [
        r.report_ref,
        r.status ?? '',
        r.company_name ?? '',
        r.client_contact_name ?? '',
        r.client_phone ?? '',
        r.client_email ?? '',
        r.client_name ?? '',
        r.campaign_name ?? '',
        r.callback_at ?? '',
        r.profiles?.display_name ?? '',
        r.profiles?.email ?? '',
        r.sales_rep ?? '',
        String(r.sale_price ?? ''),
        String(r.records_sent ?? ''),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query])

  const exportCsv = () => {
    const now = new Date()
    const name = `sales-reports_${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.csv`
    downloadText(name, toCsv(filtered), 'text/csv;charset=utf-8')
  }

  // ---------- Upload helper ----------
  const uploadFilesToBucket = async (reportId: number, noteId: string, files: File[]) => {
    if (!files.length) return

    const uploaded: Array<{
      storage_path: string
      file_name: string
      mime_type: string | null
      file_size: number
      public_url: string
    }> = []

    for (const file of files) {
      const safeName = file.name.replace(/[^\w.\-() ]+/g, '_')
      const storage_path = `sales_reports/${reportId}/${noteId}/${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(storage_path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      })
      if (upErr) throw new Error(upErr.message)

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(storage_path)
      const public_url = data?.publicUrl
      if (!public_url) throw new Error('Upload succeeded but could not create public URL (bucket must be Public).')

      uploaded.push({
        storage_path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        public_url,
      })
    }

    const { error: insErr } = await supabase.from('sales_report_note_attachments').insert(
      uploaded.map((u) => ({
        report_id: reportId,
        note_id: noteId,
        storage_path: u.storage_path,
        file_name: u.file_name,
        mime_type: u.mime_type,
        file_size: u.file_size,
        public_url: u.public_url,
      }))
    )

    if (insErr) throw new Error(insErr.message)
  }

  // ---------- Add Sale ----------
  const openAddModal = () => {
    setErrorMsg(null)
    setSuccessMsg(null)
    setInitialFiles([])
    if (initialFileInputRef.current) initialFileInputRef.current.value = ''
    setForm({
      report_ref: makeReportRef(),
      report_date: new Date().toISOString(),
      status: 'Potential Client',
      company_name: '',
      client_contact_name: '',
      client_phone: '',
      client_email: '',
      campaign_name: '',
      sale_price: '',
      records_sent: '',
      callback_at: '',
      initial_note: '',
    })
    setOpenAdd(true)
  }

  const closeAddModal = () => {
    if (saving) return
    setOpenAdd(false)
  }

  const saveSale = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!userId) return setErrorMsg('You must be logged in to add a sale.')

    const report_ref = form.report_ref.trim() || makeReportRef()
    const report_date = form.report_date ? new Date(form.report_date).toISOString() : new Date().toISOString()

    const company_name = form.company_name.trim()
    const campaign_name = form.campaign_name.trim()
    const status = form.status

    if (!company_name) return setErrorMsg('Company name is required.')
    if (!campaign_name) return setErrorMsg('Campaign name is required.')

    if (status === 'Callback' && !form.callback_at) {
      return setErrorMsg('Callback due time is required for Callback status.')
    }

    const sale_price = safeNumberOrNull(form.sale_price)
    const records_sent = safeNumberOrNull(form.records_sent)

    if (sale_price === (NaN as any)) return setErrorMsg('Sale price must be a valid number.')
    if (records_sent === (NaN as any)) return setErrorMsg('Records sent must be a valid number.')
    if (sale_price !== null && sale_price < 0) return setErrorMsg('Sale price cannot be negative.')
    if (records_sent !== null && records_sent < 0) return setErrorMsg('Records sent cannot be negative.')

    setSaving(true)

    const { data: created, error: insErr } = await supabase
      .from('sales_reports')
      .insert({
        report_ref,
        report_date,
        status,
        company_name,
        client_contact_name: form.client_contact_name.trim() || null,
        client_phone: form.client_phone.trim() || null,
        client_email: form.client_email.trim() || null,
        campaign_name,
        sale_price,
        records_sent,
        callback_at: status === 'Callback' ? form.callback_at : null,
        rep_user_id: userId,
      })
      .select(
        `
        id,
        report_ref,
        report_date,
        status,
        company_name,
        client_contact_name,
        client_phone,
        client_email,
        campaign_name,
        sale_price,
        records_sent,
        callback_at,
        client_name,
        sales_rep,
        rep_user_id,
        profiles (
          display_name,
          email
        )
      `
      )
      .single()

    if (insErr) {
      setSaving(false)
      setErrorMsg(insErr.message)
      return
    }

    const createdRow = created as unknown as SalesReportRow

    const firstNoteText = form.initial_note.trim()
    if (firstNoteText || initialFiles.length) {
      const { data: noteRow, error: noteErr } = await supabase
        .from('sales_report_notes')
        .insert({
          report_id: createdRow.id,
          note: firstNoteText || 'Attachment(s) added.',
          created_by: userId,
        })
        .select('id, report_id, note, created_at, created_by')
        .single()

      if (noteErr) {
        setSaving(false)
        setErrorMsg(`Report saved, but initial note failed: ${noteErr.message}`)
        return
      }

      const noteId = (noteRow as any).id as string

      if (initialFiles.length) {
        try {
          await uploadFilesToBucket(createdRow.id, noteId, initialFiles)
        } catch (e: any) {
          setSaving(false)
          setErrorMsg(`Report + note saved, but file upload failed: ${e?.message || 'Unknown error'}`)
          return
        }
      }
    }

    setSaving(false)
    setOpenAdd(false)
    setSuccessMsg('Sale added.')
    await fetchReports()
  }

  // ✅ ---------- Edit Sale ----------
  const openEditModal = (r: SalesReportRow) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!canEdit(r)) {
      setErrorMsg('You can only edit your own sales reports.')
      return
    }

    setEditId(r.id)
    setEditForm({
      report_ref: r.report_ref || '',
      report_date: r.report_date || new Date().toISOString(),
      status: (r.status as ReportStatus) || 'Potential Client',
      company_name: r.company_name || '',
      client_contact_name: r.client_contact_name || '',
      client_phone: r.client_phone || '',
      client_email: r.client_email || '',
      campaign_name: r.campaign_name || '',
      sale_price: r.sale_price === null || typeof r.sale_price === 'undefined' ? '' : String(r.sale_price),
      records_sent: r.records_sent === null || typeof r.records_sent === 'undefined' ? '' : String(r.records_sent),
      callback_at: r.callback_at ?? '',
    })
    setOpenEdit(true)
  }

  const closeEditModal = () => {
    if (editing) return
    setOpenEdit(false)
    setEditId(null)
  }

  const saveEdit = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!userId) return setErrorMsg('Login required.')
    if (!editId) return setErrorMsg('Missing report id.')

    const company_name = editForm.company_name.trim()
    const campaign_name = editForm.campaign_name.trim()
    const report_ref = editForm.report_ref.trim() || makeReportRef()
    const report_date = editForm.report_date ? new Date(editForm.report_date).toISOString() : new Date().toISOString()
    const status = editForm.status

    if (!company_name) return setErrorMsg('Company name is required.')
    if (!campaign_name) return setErrorMsg('Campaign name is required.')

    if (status === 'Callback' && !editForm.callback_at) {
      return setErrorMsg('Callback due time is required for Callback status.')
    }

    const sale_price = safeNumberOrNull(editForm.sale_price)
    const records_sent = safeNumberOrNull(editForm.records_sent)

    if (sale_price === (NaN as any)) return setErrorMsg('Sale price must be a valid number.')
    if (records_sent === (NaN as any)) return setErrorMsg('Records sent must be a valid number.')
    if (sale_price !== null && sale_price < 0) return setErrorMsg('Sale price cannot be negative.')
    if (records_sent !== null && records_sent < 0) return setErrorMsg('Records sent cannot be negative.')

    setEditing(true)

    // extra safety: only update if it's yours
    const { data: updated, error: upErr } = await supabase
      .from('sales_reports')
      .update({
        report_ref,
        report_date,
        status,
        company_name,
        client_contact_name: editForm.client_contact_name.trim() || null,
        client_phone: editForm.client_phone.trim() || null,
        client_email: editForm.client_email.trim() || null,
        campaign_name,
        sale_price,
        records_sent,
        callback_at: status === 'Callback' ? editForm.callback_at : null,
      })
      .eq('id', editId)
      .eq('rep_user_id', userId)
      .select(
        `
        id,
        report_ref,
        report_date,
        status,
        company_name,
        client_contact_name,
        client_phone,
        client_email,
        campaign_name,
        sale_price,
        records_sent,
        callback_at,
        client_name,
        sales_rep,
        rep_user_id,
        profiles (
          display_name,
          email
        )
      `
      )
      .single()

    if (upErr) {
      setEditing(false)
      setErrorMsg(upErr.message)
      return
    }

    // optimistic update local list so it feels instant
    if (updated) {
      setRows((prev) => prev.map((x) => (x.id === editId ? (updated as unknown as SalesReportRow) : x)))
    }

    setEditing(false)
    setOpenEdit(false)
    setEditId(null)
    setSuccessMsg('Report updated.')
    await fetchReports()
  }

  const deleteSale = async (r: SalesReportRow) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!canDelete(r)) return setErrorMsg('You can only delete your own sales reports.')

    const ok = window.confirm(`Delete report ${r.report_ref}? This cannot be undone.`)
    if (!ok) return

    const { error } = await supabase.from('sales_reports').delete().eq('id', r.id)
    if (error) return setErrorMsg(error.message)

    setSuccessMsg('Deleted.')
    await fetchReports()
  }

  // ---------- Notes Overlay ----------
  const loadNotesForReport = async (report: SalesReportRow) => {
    const { data, error } = await supabase
      .from('sales_report_notes')
      .select(
        `
        id,
        report_id,
        note,
        created_at,
        created_by,
        sales_report_note_attachments (
          id,
          report_id,
          note_id,
          storage_path,
          file_name,
          mime_type,
          file_size,
          public_url,
          created_at
        )
      `
      )
      .eq('report_id', report.id)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    const safe = ((data || []) as any[]).map((n) => ({
      ...n,
      sales_report_note_attachments: Array.isArray(n.sales_report_note_attachments) ? n.sales_report_note_attachments : [],
    }))

    return safe as SRNote[]
  }

  const openNotes = async (report: SalesReportRow) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    setNotesReport(report)
    setNotesOpen(true)
    setNotesLoading(true)
    setNotesHistory([])
    setNewNote('')
    setNoteFiles([])
    if (noteFileInputRef.current) noteFileInputRef.current.value = ''

    try {
      const notes = await loadNotesForReport(report)
      setNotesHistory(notes)
    } catch (e: any) {
      setErrorMsg(`Notes load failed: ${e?.message || 'Unknown error'}`)
    } finally {
      setNotesLoading(false)
    }
  }

  const closeNotes = () => {
    setNotesOpen(false)
    setNotesReport(null)
    setNotesHistory([])
    setNewNote('')
    setNoteFiles([])
    if (noteFileInputRef.current) noteFileInputRef.current.value = ''
  }

  const addNote = async () => {
    if (!notesReport) return
    if (!userId) return setErrorMsg('Login required.')

    const text = newNote.trim()
    if (!text && !noteFiles.length) return

    setAddingNote(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const noteText = text || 'Attachment(s) added.'

    const { data: inserted, error: noteErr } = await supabase
      .from('sales_report_notes')
      .insert({
        report_id: notesReport.id,
        note: noteText,
        created_by: userId,
      })
      .select('id, report_id, note, created_at, created_by')
      .single()

    if (noteErr) {
      setAddingNote(false)
      setErrorMsg(`Failed to add note: ${noteErr.message}`)
      return
    }

    const noteId = (inserted as any).id as string

    if (noteFiles.length) {
      try {
        await uploadFilesToBucket(notesReport.id, noteId, noteFiles)
      } catch (e: any) {
        setErrorMsg(`Note saved, but file upload failed: ${e?.message || 'Unknown error'}`)
      }
    }

    try {
      const notes = await loadNotesForReport(notesReport)
      setNotesHistory(notes)
      setSuccessMsg('Note added.')
    } catch (e: any) {
      setErrorMsg(`Note added, but refresh failed: ${e?.message || 'Unknown error'}`)
    }

    setNewNote('')
    setNoteFiles([])
    if (noteFileInputRef.current) noteFileInputRef.current.value = ''
    setAddingNote(false)
  }

  return (
    <div style={page}>
      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={container}>
        <div style={headerCard}>
          <div style={{ minWidth: 240 }}>
            <div style={h1}>Sales Reports</div>
            <div style={sub}>Staff-only internal reporting (clients cannot access).</div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
            <div style={tabWrap}>
              <button style={mode === 'TEAM' ? tabBtnActive : tabBtn} onClick={() => setMode('TEAM')}>
                Team Reports
              </button>
              <button style={mode === 'MINE' ? tabBtnActive : tabBtn} onClick={() => setMode('MINE')} disabled={!userId} aria-disabled={!userId}>
                My Reports
              </button>
            </div>

            <input style={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ref, company, client, campaign, rep…" />

            <button style={btn} onClick={openAddModal} disabled={!userId} aria-disabled={!userId}>
              + Add Sale
            </button>

            <button style={btn} onClick={exportCsv}>
              ⭳ Export
            </button>

            <button style={btn} onClick={handleRefresh} disabled={refreshing} aria-disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* ✅ ALERTS BAR */}
        {(overdueCount > 0 || dueSoonCount > 0) && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              borderRadius: 12,
              background: overdueCount > 0 ? 'rgba(255,120,0,0.14)' : 'rgba(255,255,0,0.10)',
              border: overdueCount > 0 ? '1px solid rgba(255,120,0,0.32)' : '1px solid rgba(255,255,0,0.22)',
              fontWeight: 950,
            }}
          >
            {overdueCount > 0 ? `⚠️ ${overdueCount} callback(s) overdue` : null}
            {overdueCount > 0 && dueSoonCount > 0 ? ' • ' : null}
            {dueSoonCount > 0 ? `⏳ ${dueSoonCount} due in next 30 mins` : null}
          </div>
        )}

        {errorMsg && (
          <div style={errorBar}>
            <b>Error:</b> {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={successBar}>
            <b>Done:</b> {successMsg}
          </div>
        )}

        <div style={panel}>
          <div style={panelTop}>
            <div style={{ fontWeight: 950 }}>{mode === 'MINE' ? 'My Reports' : 'Team Reports'}</div>
            <div style={{ opacity: 0.8, fontWeight: 900 }}>{filtered.length} shown</div>
          </div>

          {loading ? (
            <div style={empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={empty}>{mode === 'MINE' ? 'No personal reports yet.' : 'No reports yet.'}</div>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Ref</th>
                    <th style={th}>Date</th>
                    <th style={th}>Status</th>
                    <th style={th}>Callback Due</th>
                    <th style={th}>Company</th>
                    <th style={th}>Client</th>
                    <th style={th}>Campaign</th>
                    <th style={thRight}>Sale (£)</th>
                    <th style={thRight}>Records</th>
                    <th style={th}>Rep</th>
                    <th style={th}>Notes</th>
                    <th style={thRight}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((r, i) => {
                    const delOk = canDelete(r)
                    const editOk = canEdit(r)

                    return (
                      <tr
                        key={r.id}
                        style={{
                          ...tr,
                          background: i % 2 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.03)',
                        }}
                      >
                        <td style={tdMono}>
                          <span style={pill}>{r.report_ref}</span>
                        </td>
                        <td style={td}>{formatDateTime(r.report_date)}</td>
                        <td style={td}>
                          <span style={statusPill(String(r.status || ''))}>{r.status || '—'}</span>
                        </td>
                        <td style={td}>{String(r.status || '').toLowerCase() === 'callback' && r.callback_at ? formatDateTime(r.callback_at) : '—'}</td>
                        <td style={td}>{r.company_name || r.client_name || '—'}</td>
                        <td style={td}>
                          {r.client_contact_name || '—'}
                          <div style={{ fontSize: 11.5, opacity: 0.75, fontWeight: 800 }}>
                            {r.client_phone ? `📞 ${r.client_phone}` : ''}
                            {r.client_phone && r.client_email ? '  •  ' : ''}
                            {r.client_email ? `✉️ ${r.client_email}` : ''}
                          </div>
                        </td>
                        <td style={td}>{r.campaign_name || '—'}</td>
                        <td style={tdRight}>{r.sale_price ?? '—'}</td>
                        <td style={tdRight}>{r.records_sent ?? '—'}</td>
                        <td style={td}>{repLabel(r)}</td>

                        <td style={td}>
                          <button style={btnSmall} onClick={() => openNotes(r)} title="Open notes + attachments">
                            Notes
                          </button>
                        </td>

                        <td style={tdRight}>
                          <div style={{ display: 'inline-flex', gap: 8 }}>
                            <button
                              style={editOk ? btnSmall : btnSmallDisabled}
                              onClick={() => openEditModal(r)}
                              disabled={!editOk}
                              aria-disabled={!editOk}
                              title={editOk ? 'Edit this report' : 'You can only edit your own reports'}
                            >
                              Edit
                            </button>

                            <button
                              style={delOk ? dangerBtn : dangerBtnDisabled}
                              onClick={() => deleteSale(r)}
                              disabled={!delOk}
                              aria-disabled={!delOk}
                              title={delOk ? 'Delete this report' : 'You can only delete your own reports'}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ height: 40 }} />
      </div>

      {/* ---- Add Sale Modal ---- */}
      {openAdd && (
        <div style={modalOverlay} onMouseDown={closeAddModal}>
          <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={modalTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 1000 }}>Add Sale</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                  Optional initial note saves into notes history (with attachments).
                </div>
              </div>

              <button style={iconBtn} onClick={closeAddModal} disabled={saving} aria-disabled={saving} title="Close">
                ✕
              </button>
            </div>

            <div style={formGrid}>
              <label style={label}>
                <div style={labelTop}>Report Ref</div>
                <input style={input} value={form.report_ref} onChange={(e) => setForm((p) => ({ ...p, report_ref: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Report Date</div>
                <input style={input} value={form.report_date} onChange={(e) => setForm((p) => ({ ...p, report_date: e.target.value }))} />
                <div style={hint}>Tip: leave it as-is unless you’re backdating.</div>
              </label>

              <label style={label}>
                <div style={labelTop}>Status *</div>
                <select style={{ ...input, cursor: 'pointer' }} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ReportStatus }))}>
                  <option value="Potential Client">Potential Client</option>
                  <option value="Client">Client</option>
                  <option value="Callback">Callback</option>
                </select>
              </label>

              {form.status === 'Callback' && (
                <label style={label}>
                  <div style={labelTop}>Callback Due (required)</div>
                  <input
                    style={input}
                    type="datetime-local"
                    value={form.callback_at ? form.callback_at.slice(0, 16) : ''}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        callback_at: e.target.value ? new Date(e.target.value).toISOString() : '',
                      }))
                    }
                  />
                  <div style={hint}>This powers alerts + overdue tracking.</div>
                </label>
              )}

              <label style={label}>
                <div style={labelTop}>Company Name *</div>
                <input style={input} value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} placeholder="e.g. The Solar Test" />
              </label>

              <label style={label}>
                <div style={labelTop}>Client Contact Name (optional)</div>
                <input style={input} value={form.client_contact_name} onChange={(e) => setForm((p) => ({ ...p, client_contact_name: e.target.value }))} placeholder="e.g. John Graham" />
              </label>

              <label style={label}>
                <div style={labelTop}>Client Phone</div>
                <input style={input} value={form.client_phone} onChange={(e) => setForm((p) => ({ ...p, client_phone: e.target.value }))} placeholder="e.g. 07..." />
              </label>

              <label style={label}>
                <div style={labelTop}>Client Email</div>
                <input style={input} value={form.client_email} onChange={(e) => setForm((p) => ({ ...p, client_email: e.target.value }))} placeholder="e.g. name@company.co.uk" />
              </label>

              <label style={label}>
                <div style={labelTop}>Campaign Name *</div>
                <input style={input} value={form.campaign_name} onChange={(e) => setForm((p) => ({ ...p, campaign_name: e.target.value }))} placeholder="e.g. ASHP" />
              </label>

              <label style={label}>
                <div style={labelTop}>Sale Price (£)</div>
                <input style={input} inputMode="decimal" value={form.sale_price} onChange={(e) => setForm((p) => ({ ...p, sale_price: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Records Sent</div>
                <input style={input} inputMode="numeric" value={form.records_sent} onChange={(e) => setForm((p) => ({ ...p, records_sent: e.target.value }))} />
              </label>

              <label style={{ ...label, gridColumn: '1 / -1' }}>
                <div style={labelTop}>Initial Note (saves into notes history)</div>
                <textarea
                  style={{ ...input, minHeight: 110, resize: 'vertical' as const, paddingTop: 12, paddingBottom: 12 }}
                  value={form.initial_note}
                  onChange={(e) => setForm((p) => ({ ...p, initial_note: e.target.value }))}
                  placeholder="Write a clear note…"
                />
              </label>

              <label style={{ ...label, gridColumn: '1 / -1' }}>
                <div style={labelTop}>Initial Attachments (optional)</div>
                <input
                  ref={initialFileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => setInitialFiles(Array.from(e.target.files || []))}
                  style={{ ...input, padding: '10px 12px' }}
                />
                <div style={hint}>Images will preview in notes. Files will be clickable.</div>
              </label>
            </div>

            <div style={modalActions}>
              <button style={btnGhost} onClick={closeAddModal} disabled={saving} aria-disabled={saving}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={saveSale} disabled={saving} aria-disabled={saving}>
                {saving ? 'Saving…' : 'Save Sale'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ ---- Edit Sale Modal ---- */}
      {openEdit && (
        <div style={modalOverlay} onMouseDown={closeEditModal}>
          <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={modalTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 1000 }}>Edit Sale</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Edits update sales_reports only.</div>
              </div>

              <button style={iconBtn} onClick={closeEditModal} disabled={editing} aria-disabled={editing} title="Close">
                ✕
              </button>
            </div>

            <div style={formGrid}>
              <label style={label}>
                <div style={labelTop}>Report Ref</div>
                <input style={input} value={editForm.report_ref} onChange={(e) => setEditForm((p) => ({ ...p, report_ref: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Report Date</div>
                <input style={input} value={editForm.report_date} onChange={(e) => setEditForm((p) => ({ ...p, report_date: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Status *</div>
                <select style={{ ...input, cursor: 'pointer' }} value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as ReportStatus }))}>
                  <option value="Potential Client">Potential Client</option>
                  <option value="Client">Client</option>
                  <option value="Callback">Callback</option>
                </select>
              </label>

              {editForm.status === 'Callback' && (
                <label style={label}>
                  <div style={labelTop}>Callback Due (required)</div>
                  <input
                    style={input}
                    type="datetime-local"
                    value={editForm.callback_at ? editForm.callback_at.slice(0, 16) : ''}
                    onChange={(e) =>
                      setEditForm((p) => ({
                        ...p,
                        callback_at: e.target.value ? new Date(e.target.value).toISOString() : '',
                      }))
                    }
                  />
                  <div style={hint}>This powers alerts + overdue tracking.</div>
                </label>
              )}

              <label style={label}>
                <div style={labelTop}>Company Name *</div>
                <input style={input} value={editForm.company_name} onChange={(e) => setEditForm((p) => ({ ...p, company_name: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Client Contact Name</div>
                <input style={input} value={editForm.client_contact_name} onChange={(e) => setEditForm((p) => ({ ...p, client_contact_name: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Client Phone</div>
                <input style={input} value={editForm.client_phone} onChange={(e) => setEditForm((p) => ({ ...p, client_phone: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Client Email</div>
                <input style={input} value={editForm.client_email} onChange={(e) => setEditForm((p) => ({ ...p, client_email: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Campaign Name *</div>
                <input style={input} value={editForm.campaign_name} onChange={(e) => setEditForm((p) => ({ ...p, campaign_name: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Sale Price (£)</div>
                <input style={input} inputMode="decimal" value={editForm.sale_price} onChange={(e) => setEditForm((p) => ({ ...p, sale_price: e.target.value }))} />
              </label>

              <label style={label}>
                <div style={labelTop}>Records Sent</div>
                <input style={input} inputMode="numeric" value={editForm.records_sent} onChange={(e) => setEditForm((p) => ({ ...p, records_sent: e.target.value }))} />
              </label>
            </div>

            <div style={modalActions}>
              <button style={btnGhost} onClick={closeEditModal} disabled={editing} aria-disabled={editing}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={saveEdit} disabled={editing} aria-disabled={editing}>
                {editing ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Notes Overlay ---- */}
      {notesOpen && notesReport && (
        <div style={modalOverlay} onMouseDown={(e) => e.target === e.currentTarget && closeNotes()}>
          <div style={modalWide} onMouseDown={(e) => e.stopPropagation()}>
            <div style={modalTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 1000 }}>
                  Notes — <span style={{ color: 'rgba(120,255,255,0.95)' }}>{notesReport.company_name || notesReport.client_name || 'Report'}</span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                  Ref: <b>{notesReport.report_ref}</b> • Status: <b>{notesReport.status}</b> • Rep: <b>{repLabel(notesReport)}</b>
                </div>
              </div>

              <button style={iconBtn} onClick={closeNotes} title="Close">
                ✕
              </button>
            </div>

            <div style={notesLayout}>
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

                        {n.sales_report_note_attachments.length > 0 && (
                          <div style={attWrap}>
                            {n.sales_report_note_attachments.map((a) => (
                              <div key={a.id} style={attItem}>
                                {isImageMime(a.mime_type) ? (
                                  <a href={a.public_url} target="_blank" rel="noreferrer" style={attLink}>
                                    <img src={a.public_url} alt={a.file_name} style={attImg} />
                                    <div style={attName}>{a.file_name}</div>
                                  </a>
                                ) : (
                                  <a href={a.public_url} target="_blank" rel="noreferrer" style={attFile}>
                                    <div style={attName}>📎 {a.file_name}</div>
                                    <div style={attSmall}>
                                      {a.mime_type || 'file'}
                                      {a.file_size ? ` • ${(a.file_size / 1024).toFixed(1)} KB` : ''}
                                    </div>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={notesComposeBox}>
                <div style={notesHeaderRow}>
                  <div style={notesHeaderTitle}>Add Note</div>
                  <div style={notesHeaderHint}>Saved into sales_report_notes</div>
                </div>

                <textarea style={notesTextarea} value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Write a clear note…" />

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 900, marginBottom: 8 }}>Attachments (optional)</div>
                  <input
                    ref={noteFileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => setNoteFiles(Array.from(e.target.files || []))}
                    style={{ ...input, padding: '10px 12px' }}
                  />
                  <div style={hint}>Images will preview in history. Other files are clickable links.</div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button style={btnGhost} onClick={closeNotes} disabled={addingNote} aria-disabled={addingNote}>
                    Close
                  </button>
                  <button style={btnPrimary} onClick={addNote} disabled={addingNote} aria-disabled={addingNote}>
                    {addingNote ? 'Adding…' : 'Add Note'}
                  </button>
                </div>

                <div style={notesTip}>
                  Bucket: <b>{BUCKET}</b> (must exist and be Public, or use signed URLs instead).
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- styles ---- */

const page: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.08), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
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
  maxWidth: 1700,
  margin: '0 auto',
  padding: '28px 16px',
  position: 'relative',
}

const headerCard: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: 16,
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 40px rgba(0,255,255,0.1)',
}

const h1: CSSProperties = { fontSize: 20, fontWeight: 1000 }
const sub: CSSProperties = { marginTop: 4, fontSize: 12.5, opacity: 0.75, fontWeight: 800 }

const tabWrap: CSSProperties = {
  display: 'inline-flex',
  gap: 8,
  padding: 6,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(0,255,255,0.18)',
}

const tabBtn: CSSProperties = {
  padding: '9px 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontWeight: 950,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const tabBtnActive: CSSProperties = {
  ...tabBtn,
  border: '1px solid rgba(0,255,255,0.45)',
  background: 'rgba(0,255,255,0.12)',
  boxShadow: '0 0 18px rgba(0,255,255,0.1)',
}

const search: CSSProperties = {
  width: 420,
  maxWidth: '90vw',
  padding: '10px 12px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.2)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const btn: CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
}

const btnSmall: CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,255,0.22)',
  background: 'rgba(0,255,255,0.10)',
  color: '#fff',
}

const btnSmallDisabled: CSSProperties = {
  ...btnSmall,
  opacity: 0.45,
  cursor: 'not-allowed',
}

const errorBar: CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  fontWeight: 900,
}

const successBar: CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(0,255,180,0.10)',
  border: '1px solid rgba(0,255,180,0.22)',
  fontWeight: 900,
}

const panel: CSSProperties = {
  marginTop: 16,
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.25)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55)',
  overflow: 'hidden',
}

const panelTop: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.18)',
}

const empty: CSSProperties = { padding: 16, fontWeight: 900, opacity: 0.85 }

const tableWrap: CSSProperties = { width: '100%', overflowX: 'auto' }
const table: CSSProperties = { width: '100%', minWidth: 1550, borderCollapse: 'separate', borderSpacing: 0 }

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
  whiteSpace: 'nowrap',
}
const thRight: CSSProperties = { ...th, textAlign: 'right' }

const tr: CSSProperties = {}
const td: CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  fontWeight: 900,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  verticalAlign: 'top',
}
const tdRight: CSSProperties = { ...td, textAlign: 'right' }
const tdMono: CSSProperties = { ...td, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }

const pill: CSSProperties = {
  display: 'inline-flex',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(0,255,255,0.1)',
  border: '1px solid rgba(0,255,255,0.3)',
  fontWeight: 1000,
}

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
  if (s === 'client') return { ...base, border: '1px solid rgba(0,255,255,0.35)', background: 'rgba(0,255,255,0.12)' }
  if (s === 'potential client') return { ...base, border: '1px solid rgba(0,160,255,0.35)', background: 'rgba(0,160,255,0.12)' }
  if (s === 'callback') return { ...base, border: '1px solid rgba(255,200,0,0.35)', background: 'rgba(255,200,0,0.14)' }
  return base
}

const dangerBtn: CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,90,90,0.35)',
  background: 'rgba(255,70,70,0.12)',
  color: '#fff',
}

const dangerBtnDisabled: CSSProperties = {
  ...dangerBtn,
  opacity: 0.45,
  cursor: 'not-allowed',
}

const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.62)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 14,
  zIndex: 50,
}

const modalCard: CSSProperties = {
  width: 'min(920px, 96vw)',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.25)',
  boxShadow: '0 30px 90px rgba(0,0,0,0.65)',
  overflow: 'hidden',
}

const modalWide: CSSProperties = {
  width: 'min(1100px, 96vw)',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.25)',
  boxShadow: '0 30px 90px rgba(0,0,0,0.65)',
  overflow: 'hidden',
}

const modalTop: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 16px',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.18)',
}

const iconBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 1000,
}

const formGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  padding: 16,
}

const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const labelTop: CSSProperties = { fontSize: 12, fontWeight: 1000, opacity: 0.9, letterSpacing: 0.2 }

const input: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.2)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const hint: CSSProperties = { marginTop: 2, fontSize: 11.5, opacity: 0.7, fontWeight: 800 }

const modalActions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  padding: 16,
  borderTop: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(0,0,0,0.12)',
}

const btnGhost: CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
}

const btnPrimary: CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 1000,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,255,0.35)',
  background: 'rgba(0,255,255,0.14)',
  color: '#fff',
}

const notesLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.15fr 0.85fr',
  gap: 12,
  padding: 12,
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

const notesScroll: CSSProperties = { maxHeight: 520, overflowY: 'auto', padding: 12 }
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
  minHeight: 180,
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

const attWrap: CSSProperties = {
  marginTop: 10,
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
}

const attItem: CSSProperties = {
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(0,0,0,0.18)',
  overflow: 'hidden',
}

const attLink: CSSProperties = { color: '#fff', textDecoration: 'none', display: 'block' }
const attFile: CSSProperties = { color: '#fff', textDecoration: 'none', display: 'block', padding: 10 }

const attImg: CSSProperties = {
  width: '100%',
  height: 110,
  objectFit: 'cover',
  display: 'block',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}

const attName: CSSProperties = {
  padding: 10,
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const attSmall: CSSProperties = { fontSize: 11, opacity: 0.75, fontWeight: 800, marginTop: 4 }
