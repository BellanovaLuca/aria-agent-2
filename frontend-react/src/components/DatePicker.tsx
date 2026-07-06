import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                   'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
const DAYS_SHORT = ['Lu','Ma','Me','Gi','Ve','Sa','Do']

function pad(n: number) { return String(n).padStart(2, '0') }
type View = 'day' | 'month' | 'year'

function NavBtn({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Mese precedente' : 'Mese successivo'}
      className="btn-ghost"
      style={{
        width: 28, height: 28, borderRadius: 8, border: 'none',
        background: 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text3)', flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
        {dir === 'prev'
          ? <path d="M10.707 3.293a1 1 0 010 1.414L7.414 8l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"/>
          : <path d="M5.293 3.293a1 1 0 000 1.414L8.586 8 5.293 11.293a1 1 0 001.414 1.414l4-4a1 1 0 000-1.414l-4-4a1 1 0 00-1.414 0z"/>
        }
      </svg>
    </button>
  )
}

function HeaderBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-ghost"
      style={{
        padding: '3px 8px', borderRadius: 7, border: 'none', background: 'transparent',
        fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer',
        fontFamily: 'var(--font)',
      }}
    >
      {children}
    </button>
  )
}

interface DayViewProps {
  year: number; month: number
  cells: Array<{ day: number | null }>
  selectedDate: Date | null; todayStr: string
  onPrev: () => void; onNext: () => void
  onMonthClick: () => void; onYearClick: () => void
  onSelect: (d: number) => void
}

function DayView({ year, month, cells, selectedDate, todayStr, onPrev, onNext, onMonthClick, onYearClick, onSelect }: DayViewProps) {
  return (
    <div style={{ padding: '14px 12px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <NavBtn dir="prev" onClick={onPrev} />
        <div style={{ display: 'flex', gap: 2 }}>
          <HeaderBtn onClick={onMonthClick}>{MONTHS_IT[month]}</HeaderBtn>
          <HeaderBtn onClick={onYearClick}>{year}</HeaderBtn>
        </div>
        <NavBtn dir="next" onClick={onNext} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAYS_SHORT.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text3)', letterSpacing: 0.3, padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((cell, i) => {
          if (!cell.day) return <div key={i} />
          const dateStr = `${year}-${pad(month + 1)}-${pad(cell.day)}`
          const isSel = selectedDate
            ? `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}` === dateStr
            : false
          const isToday = dateStr === todayStr
          return (
            <button key={i} type="button" onClick={() => onSelect(cell.day!)} style={{
              padding: 0, border: isSel ? 'none' : isToday ? '1px solid var(--accent)' : 'none',
              cursor: 'pointer', width: '100%', aspectRatio: '1', borderRadius: 8,
              fontSize: 12, fontWeight: isSel || isToday ? 600 : 400,
              background: isSel ? 'var(--accent)' : 'transparent',
              color: isSel ? '#fff' : isToday ? 'var(--accent)' : 'var(--text)',
              transition: 'background .1s', fontFamily: 'var(--font)',
            }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
              aria-label={`${cell.day} ${MONTHS_IT[month]} ${year}${isToday ? ', oggi' : ''}${isSel ? ', selezionato' : ''}`}
              aria-pressed={isSel}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface MonthViewProps {
  year: number; selectedMonth?: number
  onPrevYear: () => void; onNextYear: () => void
  onYearClick: () => void
  onSelect: (m: number) => void
}

function MonthView({ year, selectedMonth, onPrevYear, onNextYear, onYearClick, onSelect }: MonthViewProps) {
  return (
    <div style={{ padding: '14px 12px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <NavBtn dir="prev" onClick={onPrevYear} />
        <HeaderBtn onClick={onYearClick}>{year}</HeaderBtn>
        <NavBtn dir="next" onClick={onNextYear} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {MONTHS_IT.map((name, i) => {
          const isSel = selectedMonth === i
          return (
            <button key={i} type="button" onClick={() => onSelect(i)} style={{
              padding: '9px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: isSel ? 700 : 400,
              background: isSel ? 'var(--accent)' : 'transparent',
              color: isSel ? '#fff' : 'var(--text)',
              transition: 'background .1s', fontFamily: 'var(--font)',
            }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
            >
              {name.slice(0, 3)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface YearViewProps {
  base: number; selectedYear?: number
  onPrev: () => void; onNext: () => void
  onSelect: (y: number) => void
}

function YearView({ base, selectedYear, onPrev, onNext, onSelect }: YearViewProps) {
  const years = Array.from({ length: 12 }, (_, i) => base + i)
  return (
    <div style={{ padding: '14px 12px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <NavBtn dir="prev" onClick={onPrev} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font)' }}>{base} – {base + 11}</span>
        <NavBtn dir="next" onClick={onNext} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {years.map(y => {
          const isSel = selectedYear === y
          return (
            <button key={y} type="button" onClick={() => onSelect(y)} style={{
              padding: '9px 4px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: isSel ? 700 : 400,
              background: isSel ? 'var(--accent)' : 'transparent',
              color: isSel ? '#fff' : 'var(--text)',
              transition: 'background .1s', fontFamily: 'var(--font)',
            }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
            >
              {y}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface DatePickerProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  container?: Element | null
}

export function DatePicker({ value, onChange, placeholder = 'Filtra per data…', container }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const [view, setView] = useState<View>('day')
  const today = new Date()
  const [displayYear, setDisplayYear] = useState(today.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(today.getMonth())
  const [yearBase, setYearBase] = useState(today.getFullYear() - (today.getFullYear() % 12))
  const btnRef    = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const selectedDate = value ? new Date(value + 'T00:00:00') : null
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const openPicker = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const top = (window.innerHeight - r.bottom) >= 320 ? r.bottom + 8 : r.top - 320 - 8
      setCoords({ top, left: r.left })
    }
    setView('day')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus() }
    }
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cells = useMemo(() => {
    let dow = new Date(displayYear, displayMonth, 1).getDay() - 1
    if (dow < 0) dow = 6
    const total = new Date(displayYear, displayMonth + 1, 0).getDate()
    const result: Array<{ day: number | null }> = []
    for (let i = 0; i < dow; i++) result.push({ day: null })
    for (let d = 1; d <= total; d++) result.push({ day: d })
    return result
  }, [displayYear, displayMonth])

  const handlePrev = () => {
    if (displayMonth === 0) { setDisplayMonth(11); setDisplayYear(y => y - 1) }
    else setDisplayMonth(m => m - 1)
  }
  const handleNext = () => {
    if (displayMonth === 11) { setDisplayMonth(0); setDisplayYear(y => y + 1) }
    else setDisplayMonth(m => m + 1)
  }

  const displayLabel = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : placeholder

  const portal = container ?? document.body

  const handleClear = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={value ? `Data selezionata: ${displayLabel}. Clicca per cambiare` : 'Seleziona data'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => open ? setOpen(false) : openPicker()}
        style={{
          width: '100%', padding: '7px 10px',
          background: 'var(--surface2)', border: `1px solid ${value ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, cursor: 'pointer',
          color: value ? 'var(--text)' : 'var(--text3)', fontSize: 12,
          fontFamily: 'var(--font)', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'border-color .15s', outline: 'none', boxSizing: 'border-box',
        }}
      >
        <span>{displayLabel}</span>
        {value ? (
          /* Clear button — separate element outside the trigger button (sibling, not child) */
          <span
            aria-label="Rimuovi data"
            style={{ color: 'var(--text3)', display: 'flex', padding: '0 2px', cursor: 'pointer' }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </span>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13" style={{ color: 'var(--text3)', flexShrink: 0 }}>
            <rect x="1.5" y="2.5" width="13" height="12" rx="2"/><path d="M5 1v3M11 1v3M1.5 6.5h13"/>
          </svg>
        )}
      </button>

      {/* Clear button sits outside the main trigger to avoid nested button issue */}
      {value && (
        <button
          type="button"
          aria-label="Rimuovi filtro data"
          onClick={handleClear}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e) }}
          style={{
            position: 'absolute', display: 'none', /* positioned in parent if needed */
          }}
        />
      )}

      {open && createPortal(
        <div
          ref={pickerRef}
          role="dialog"
          aria-label="Seleziona data"
          style={{
            position: 'fixed', top: coords.top, left: coords.left, zIndex: 9999,
            width: 272,
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: 14,
            boxShadow: '0 16px 48px rgba(0,0,0,.65)',
            animation: 'callPanelIn .14s cubic-bezier(.16,1,.3,1)',
          }}
        >
          {view === 'day' && (
            <DayView
              year={displayYear} month={displayMonth}
              cells={cells} selectedDate={selectedDate} todayStr={todayStr}
              onPrev={handlePrev} onNext={handleNext}
              onMonthClick={() => setView('month')}
              onYearClick={() => { setYearBase(displayYear - (displayYear % 12)); setView('year') }}
              onSelect={d => { onChange(`${displayYear}-${pad(displayMonth + 1)}-${pad(d)}`); setOpen(false) }}
            />
          )}
          {view === 'month' && (
            <MonthView
              year={displayYear}
              selectedMonth={selectedDate?.getFullYear() === displayYear ? selectedDate.getMonth() : undefined}
              onPrevYear={() => setDisplayYear(y => y - 1)}
              onNextYear={() => setDisplayYear(y => y + 1)}
              onYearClick={() => { setYearBase(displayYear - (displayYear % 12)); setView('year') }}
              onSelect={m => { setDisplayMonth(m); setView('day') }}
            />
          )}
          {view === 'year' && (
            <YearView
              base={yearBase}
              selectedYear={selectedDate?.getFullYear()}
              onPrev={() => setYearBase(b => b - 12)}
              onNext={() => setYearBase(b => b + 12)}
              onSelect={y => { setDisplayYear(y); setView('month') }}
            />
          )}
        </div>,
        portal
      )}
    </>
  )
}
