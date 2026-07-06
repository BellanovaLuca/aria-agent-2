export interface User {
  username: string
  email: string
  full_name: string
  status: 'active' | 'locked' | 'suspended'
  created_at: string
  last_reset?: string | null
}

export interface ResetHistoryEntry {
  id?: string
  username: string
  channel: 'voice' | 'email'
  success: boolean
  message: string
  requested_at: string
}

export interface Email {
  id: string
  from_address: string
  to_address: string
  subject: string
  body: string
  timestamp: string
  processed: boolean
}

export interface TranscriptMeta {
  filename: string
  label: string
  timestamp: string
}

export type Page = 'dashboard' | 'calls' | 'admin' | 'email'

export interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}
