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
  channel: 'voice' | 'email' | 'chat'
  operation?: 'reset' | 'unlock'
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

export interface TicketNote {
  author: string
  text: string
  at: string
}

export interface Ticket {
  id: string
  number: string
  caller: string | null
  channel: 'voice' | 'email' | 'chat'
  category: string
  subject: string
  description: string
  status: 'new' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at: string
  notes: TicketNote[]
}

export interface TranscriptAnalysis {
  filename: string
  label: string
  summary: string
  outcome: 'risolto' | 'non_risolto' | 'escalation'
  sentiment: 'positivo' | 'neutro' | 'negativo'
  intent: 'reset_password' | 'sblocco' | 'domanda' | 'altro'
  quality_score: number
  quality_notes: string
  analyzed_at: string
}

export interface AnalyticsSummary {
  total: number
  avg_quality: number
  by_outcome: Record<string, number>
  by_sentiment: Record<string, number>
  by_intent: Record<string, number>
}

export interface KnowledgeDoc {
  id: string
  filename: string
  chunk_count: number
  uploaded_at: string
}

export interface KnowledgeHit {
  doc_id: string
  filename: string
  chunk_index: number
  text: string
  score: number
}

export interface LiveParticipant {
  identity: string
  name: string
  is_agent: boolean
  is_operator: boolean
}

export interface LiveRoom {
  name: string
  num_participants: number
  created_at: string | null
  participants: LiveParticipant[]
  has_operator: boolean
}

export type Page = 'dashboard' | 'calls' | 'live' | 'admin' | 'email' | 'knowledge' | 'tickets' | 'analytics'

export interface ToastItem {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}
