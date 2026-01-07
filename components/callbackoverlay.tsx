'use client'

import React, { CSSProperties, useMemo, useState } from 'react'

type LeadLike = {
  id: string
  full_name: string
  lead_ref?: string | null
  phone?: string | null
}

export default function CallbackOverlay({
  open,
  lead,
  initialNote,
  onClose,
  onSave,
}: {
  open: boolean
  lead: LeadLike | null
  initialNote?: string
  onClose: () => void
  onSave: (args: { iso: string; note: string }) => void
}) {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [time, setTime] = useState('09:00')
  const [note, setNote] = useState(initialNote || '')

  const title = lead ? `Callback — ${lead.full_name}` : 'Callback'

  const monthLabel = useMemo(() => {
    const d = monthCursor
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }, [monthCursor])

  const days = useMemo(() => buildMonthGrid(monthCursor), [monthCursor])

  if (!open) return null

  const canSave = !!lead && !!selectedDate && /^\d{2}:\d{2}$/.test(time)

  const handleSave = () => {
    if (!lead || !selectedDate) return
    // selectedDate at local midnight -> combine local time
    const [hh, mm] = time.split(':').map((x) => parseInt(x, 10))
    const local = new Date(selectedDate)
    local.setHours(hh, mm, 0, 0)
    onSave({ iso: local.toISOString(), note: note.trim() })
  }

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={top}>
          <div>
            <div style={h1}>{title}</div>
            <div style={sub}>
              Click a date, choose time, save. You’ll get an in-app alert when it’s due.
            </div>
          </div>
          <button style={btn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={body}>
          {/* Calendar */}
          <div style={card}>
            <div style={calHead}>
              <button style={btnSm} onClick={() => setMonthCursor(addMonths(monthCursor, -1))}>
                ←
              </button>
              <div style={{ fontWeight: 1000 }}>{monthLabel}</div>
              <button style={btnSm} onClick={() => setMonthCursor(addMonths(monthCursor, 1))}>
                →
              </button>
            </div>

            <div style={dowRow}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} style={dow}>
                  {d}
                </div>
              ))}
            </div>

            <div style={grid}>
              {days.map((cell, idx) => {
                const isThisMonth = cell.inMonth
                const isSelected = selectedDate && sameDay(cell.date, selectedDate)
                const isToday = sameDay(cell.date, new Date())
                const disabled = !isThisMonth

                return (
                  <button
                    key={idx}
                    style={{
                      ...dayBtn,
                      opacity: disabled ? 0.35 : 1,
                      border: isSelected ? '1px solid rgba(0,255,255,0.65)' : '1px solid rgba(255,255,255,0.10)',
                      background: isSelected ? 'rgba(0,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                      boxShadow: isSelected ? '0 0 18px rgba(0,255,255,0.14)' : undefined,
                    }}
                    disabled={disabled}
                    onClick={() => setSelectedDate(cell.date)}
                    title={cell.date.toDateString()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 1000 }}>{cell.date.getDate()}</span>
                      {isToday && <span style={todayDot} />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right side */}
          <div style={card}>
            <div style={{ fontWeight: 1000, marginBottom: 10 }}>Details</div>

            <div style={field}>
              <div style={label}>Date selected</div>
              <div style={value}>
                {selectedDate ? selectedDate.toLocaleDateString() : '— choose a date on the calendar —'}
              </div>
            </div>

            <div style={field}>
              <div style={label}>Time</div>
              <input style={input} value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" />
              <div style={hint}>Use 24h time (HH:MM). Example: 15:30</div>
            </div>

            <div style={field}>
              <div style={label}>Note (optional)</div>
              <textarea
                style={{ ...input, minHeight: 110, resize: 'vertical' as const }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What do you need to do on the callback?"
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
              <button style={btnSm} onClick={onClose}>
                Cancel
              </button>
              <button style={{ ...btnPrimary, opacity: canSave ? 1 : 0.55 }} onClick={handleSave} disabled={!canSave}>
                Save Callback
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- utils ---------------- */

function startOfMonth(d: Date) {
  const x = new Date(d)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
}

function addMonths(d: Date, delta: number) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + delta)
  x.setDate(1)
  x.setHours(0, 0, 0, 0)
  return x
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Monday-first grid (42 cells)
function buildMonthGrid(monthStart: Date) {
  const start = startOfMonth(monthStart)
  const firstDow = mondayIndex(start) // 0..6
  const gridStart = new Date(start)
  gridStart.setDate(start.getDate() - firstDow)

  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    d.setHours(0, 0, 0, 0)
    cells.push({ date: d, inMonth: d.getMonth() === start.getMonth() })
  }
  return cells
}

// JS Sunday=0..Saturday=6 => make Monday=0..Sunday=6
function mondayIndex(d: Date) {
  const dow = d.getDay()
  return dow === 0 ? 6 : dow - 1
}

/* ---------------- styles ---------------- */

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.70)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  padding: 18,
}

const modal: CSSProperties = {
  width: 1050,
  maxWidth: '100%',
  borderRadius: 18,
  border: '1px solid rgba(0,255,255,0.28)',
  background: 'linear-gradient(180deg, rgba(10,18,45,0.96), rgba(6,10,26,0.97))',
  boxShadow: '0 30px 120px rgba(0,0,0,0.70), 0 0 40px rgba(0,255,255,0.12)',
  padding: 14,
}

const top: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  padding: '8px 8px 12px',
  borderBottom: '1px solid rgba(0,255,255,0.16)',
}

const h1: CSSProperties = { fontSize: 18, fontWeight: 1000 }
const sub: CSSProperties = { marginTop: 3, fontSize: 12.5, opacity: 0.75, fontWeight: 900 }

const body: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.05fr 0.95fr',
  gap: 12,
  padding: 10,
}

const card: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(0,255,255,0.20)',
  background: 'rgba(0,0,0,0.20)',
  padding: 12,
}

const calHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 10,
}

const dowRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 8 }
const dow: CSSProperties = { fontSize: 11, opacity: 0.75, fontWeight: 900, textAlign: 'center' }

const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }

const dayBtn: CSSProperties = {
  height: 52,
  borderRadius: 12,
  cursor: 'pointer',
  color: '#fff',
  padding: 10,
  textAlign: 'left',
}

const todayDot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: 'rgba(120,255,255,0.95)',
  boxShadow: '0 0 16px rgba(0,255,255,0.6)',
}

const field: CSSProperties = { marginTop: 12 }
const label: CSSProperties = { fontSize: 12, opacity: 0.8, fontWeight: 900, marginBottom: 6 }
const value: CSSProperties = { fontWeight: 950, opacity: 0.95 }

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

const hint: CSSProperties = { marginTop: 6, fontSize: 12, opacity: 0.7, fontWeight: 900 }

const btn: CSSProperties = {
  height: 34,
  width: 40,
  borderRadius: 12,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  fontWeight: 1000,
}

const btnSm: CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderRadius: 12,
  fontWeight: 950,
  fontSize: 12.5,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
}

const btnPrimary: CSSProperties = {
  ...btnSm,
  height: 38,
  padding: '0 12px',
  border: '1px solid rgba(0,255,255,0.55)',
  background: 'linear-gradient(135deg, rgba(0,255,255,0.95), rgba(0,140,255,0.90))',
  boxShadow: '0 0 26px rgba(0,255,255,0.18)',
  color: '#001122',
  fontWeight: 1000,
}
