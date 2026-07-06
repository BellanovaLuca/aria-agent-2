const FMT_YMD = new Intl.DateTimeFormat('sv-SE')

/** Returns YYYY-MM-DD in the local timezone — used for date filtering. */
export function toYMD(iso: string): string {
  try { return FMT_YMD.format(new Date(iso)) } catch { return '' }
}

// Hoisted at module level — avoid re-creating formatters on every call
const FMT_DATETIME = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

const FMT_DATE = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit', month: '2-digit', year: 'numeric',
})

export function fmtTs(iso: string, dateOnly = false): string {
  try {
    const dt = new Date(iso)
    if (isNaN(dt.getTime())) return iso
    return (dateOnly ? FMT_DATE : FMT_DATETIME).format(dt)
  } catch {
    return iso.slice(0, 19).replace('T', ' ')
  }
}
