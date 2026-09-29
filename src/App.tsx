import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Page =
  | 'dashboard'
  | 'new-task'
  | 'workflows'
  | 'agent-run'
  | 'documents'
  | 'knowledge'
  | 'security'
  | 'audit'
  | 'settings'

type RunStatus = 'idle' | 'running' | 'review' | 'approved' | 'rejected'
type SysStatus = 'ready' | 'loading' | 'unavailable'

interface WorkflowStep {
  id: string
  label: string          // simple label shown to all users
  explanation: string    // plain-language explanation shown during execution
  status: 'pending' | 'active' | 'done' | 'error'
  duration?: number
}

interface Finding {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  source: string
  page: number
  guidance?: string
  evidenceStatus: 'supported' | 'partial' | 'insufficient' | 'conflicting'
}

interface AuditEvent {
  id: string
  timestamp: string
  component: string
  event: string
  status: 'ok' | 'warn' | 'error'
  duration?: number
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const SYSTEM_STATUS: { label: string; status: SysStatus; detail: string }[] = [
  { label: 'Local AI',      status: 'ready',  detail: 'Phi-3-Vision-Q4 loaded' },
  { label: 'OCR Engine',    status: 'ready',  detail: 'Tesseract 5.3' },
  { label: 'Knowledge',     status: 'ready',  detail: '3 documents indexed' },
  { label: 'Code Sandbox',  status: 'ready',  detail: 'Isolated · no-network' },
  { label: 'Offline Mode',  status: 'ready',  detail: 'No external AI needed' },
]

const STEPS_INIT: WorkflowStep[] = [
  { id: 'upload',    label: 'Upload',          explanation: 'Receiving your document',                         status: 'pending' },
  { id: 'read',      label: 'Read',            explanation: 'Reading the scanned inspection report',           status: 'pending' },
  { id: 'knowledge', label: 'Check Knowledge', explanation: "Checking your organization's SOPs and manuals",  status: 'pending' },
  { id: 'analyze',   label: 'Analyze',         explanation: 'Comparing findings with available guidance',      status: 'pending' },
  { id: 'review',    label: 'Review',          explanation: 'Your approval is required before finalizing',     status: 'pending' },
  { id: 'generate',  label: 'Generate',        explanation: 'Creating the approval note',                      status: 'pending' },
  { id: 'verify',    label: 'Verify',          explanation: 'Checking the generated document',                 status: 'pending' },
]

const STEP_DURATIONS_MS = [600, 2200, 1400, 1900, 2800, 1800, 1000]

const FINDINGS: Finding[] = [
  {
    id: 'F-001',
    title: 'Pressure relief valve PRV-204 — test overdue by 47 days',
    severity: 'critical',
    source: 'Inspection_Report_2024.pdf', page: 3,
    guidance: 'Inspection_SOP.pdf — §3.2',
    evidenceStatus: 'supported',
  },
  {
    id: 'F-002',
    title: 'Corrosion observed at weld joint W-18, east manifold',
    severity: 'high',
    source: 'Inspection_Report_2024.pdf', page: 5,
    guidance: 'Technical_Manual_Rev4.pdf — §7.1',
    evidenceStatus: 'supported',
  },
  {
    id: 'F-003',
    title: 'Insulation degradation on pipeline segment PS-07',
    severity: 'medium',
    source: 'Inspection_Report_2024.pdf', page: 6,
    guidance: 'Inspection_SOP.pdf — §5.4',
    evidenceStatus: 'partial',
  },
  {
    id: 'F-004',
    title: 'Flow meter FM-11 calibration certificate expired',
    severity: 'medium',
    source: 'Inspection_Report_2024.pdf', page: 4,
    guidance: 'Calibration_Policy_2024.pdf — §2.1',
    evidenceStatus: 'supported',
  },
]

const AUDIT_EVENTS: AuditEvent[] = [
  { id: 'AE-001', timestamp: '14:23:01', component: 'FileIngestion',  event: 'File received and validated',                  status: 'ok',   duration: 120 },
  { id: 'AE-002', timestamp: '14:23:02', component: 'OCR',            event: 'Local OCR completed — 8 pages processed',      status: 'ok',   duration: 3240 },
  { id: 'AE-003', timestamp: '14:23:06', component: 'TaskClassifier', event: 'Task classified: Inspection Document Analysis', status: 'ok',   duration: 210 },
  { id: 'AE-004', timestamp: '14:23:06', component: 'ModelRouter',    event: 'Chose vision model — document contains scanned pages', status: 'ok', duration: 50 },
  { id: 'AE-005', timestamp: '14:23:07', component: 'KnowledgeBase',  event: 'Checked local knowledge — 3 sources, 7 sections found', status: 'ok', duration: 890 },
  { id: 'AE-006', timestamp: '14:23:08', component: 'Agent',         event: 'Planning complete — 4 tools selected',          status: 'ok',   duration: 1100 },
  { id: 'AE-007', timestamp: '14:23:10', component: 'Agent',         event: 'Analyzed document images',                     status: 'ok',   duration: 2100 },
  { id: 'AE-008', timestamp: '14:23:12', component: 'Agent',         event: 'Extracted 4 findings with evidence',            status: 'ok',   duration: 1560 },
  { id: 'AE-009', timestamp: '14:23:14', component: 'DocGenerator',  event: 'Approval_Note.docx generated',                 status: 'ok',   duration: 2100 },
  { id: 'AE-010', timestamp: '14:23:16', component: 'HumanReview',   event: 'Awaiting operator review and approval',        status: 'warn', duration: 0 },
]

const RECENT_RUNS = [
  { id: 'RUN-042', task: 'Inspection Report Analysis',    status: 'review',    time: '14 min ago', model: 'Phi-3-Vision-Q4' },
  { id: 'RUN-041', task: 'Python Calculation Agent',      status: 'complete',  time: '2h ago',     model: 'CodeLlama-7B-Q4' },
  { id: 'RUN-040', task: 'Technical Manual Summary',      status: 'complete',  time: '5h ago',     model: 'Mistral-7B-Q4' },
  { id: 'RUN-039', task: 'SOP Knowledge Search',          status: 'complete',  time: '1d ago',     model: 'nomic-embed-v1.5' },
]

const KB_DOCS = [
  { name: 'Inspection_SOP.pdf',         type: 'SOP',    chunks: 47,  size: '2.1 MB', indexed: 'Today' },
  { name: 'Technical_Manual_Rev4.pdf',  type: 'Manual', chunks: 112, size: '8.4 MB', indexed: 'Today' },
  { name: 'Calibration_Policy_2024.pdf', type: 'Policy', chunks: 23, size: '0.9 MB', indexed: 'Yesterday' },
]

// ─── Design atoms ─────────────────────────────────────────────────────────────

/** Color-dot status indicator. Includes an aria-label so it's not color-only. */
function StatusDot({ status, label }: { status: SysStatus; label: string }) {
  const cls: Record<SysStatus, string> = {
    ready:       'bg-emerald-400',
    loading:     'bg-amber-400 animate-pulse-slow',
    unavailable: 'bg-red-500',
  }
  return (
    <span
      className={`inline-block shrink-0 w-2 h-2 rounded-full ${cls[status]}`}
      aria-label={`${label}: ${status}`}
      role="img"
    />
  )
}

function Badge({
  children, variant = 'neutral',
}: {
  children: React.ReactNode
  variant?: 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'primary'
}) {
  const cls = {
    neutral: 'text-slate-400  border-slate-400/25  bg-slate-400/5',
    success: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
    warn:    'text-amber-400  border-amber-400/30  bg-amber-400/5',
    danger:  'text-red-400   border-red-400/30   bg-red-400/5',
    info:    'text-sky-400   border-sky-400/30   bg-sky-400/5',
    primary: 'text-blue-400  border-blue-400/30  bg-blue-400/5',
  }[variant]
  return (
    <span className={`font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border tracking-wider uppercase ${cls}`}>
      {children}
    </span>
  )
}

function SeverityBadge({ s }: { s: Finding['severity'] }) {
  const v: Record<Finding['severity'], Parameters<typeof Badge>[0]['variant']> = {
    critical: 'danger', high: 'warn', medium: 'warn', low: 'info',
  }
  return <Badge variant={v[s]}>{s}</Badge>
}

function EvidencePill({ s }: { s: Finding['evidenceStatus'] }) {
  const cfg = {
    supported:    { color: 'text-emerald-400', label: '✓ Supported by source' },
    partial:      { color: 'text-amber-400',   label: '~ Partially supported' },
    insufficient: { color: 'text-red-400',     label: '✗ Insufficient evidence' },
    conflicting:  { color: 'text-orange-400',  label: '⚠ Conflicting sources' },
  }[s]
  return <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-mono text-slate-500 uppercase tracking-widest mb-3">
      {children}
    </h3>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0d1321] border border-[#1e2d45] rounded-xl ${className}`}>
      {children}
    </div>
  )
}

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-[22px] font-semibold text-white leading-tight mb-1">{title}</h1>
      {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
    </div>
  )
}

function EmptyState({
  icon, title, body, action, onAction,
}: {
  icon?: string
  title: string
  body: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="text-3xl mb-4 opacity-30">{icon}</div>}
      <p className="text-sm font-semibold text-slate-300 mb-1">{title}</p>
      <p className="text-xs text-slate-500 mb-5 max-w-xs">{body}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="text-sm font-medium text-blue-400 border border-blue-400/30 px-4 py-2 rounded-lg hover:bg-blue-400/5 transition-colors"
        >
          {action}
        </button>
      )}
    </div>
  )
}

function Btn({
  children, onClick, variant = 'primary', disabled = false, className = '', type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit'
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium text-sm px-4 py-2 rounded-lg transition-colors focus-visible:outline-blue-500 disabled:opacity-40 disabled:pointer-events-none'
  const v = {
    primary:   'bg-blue-500 hover:bg-blue-400 text-white',
    secondary: 'border border-[#1e2d45] hover:border-[#2a3d5a] text-slate-300 hover:text-white bg-transparent',
    danger:    'border border-red-500/40 text-red-400 hover:bg-red-500/10',
    ghost:     'text-slate-400 hover:text-white hover:bg-white/5',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${v} ${className}`}>
      {children}
    </button>
  )
}

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

const NAV: { id: Page; label: string; icon: React.ReactNode; badge?: string }[] = [
  { id: 'dashboard',   label: 'Dashboard',     icon: <GridIcon /> },
  { id: 'new-task',    label: 'New Task',       icon: <PlusIcon /> },
  { id: 'workflows',   label: 'Workflows',      icon: <FlowIcon /> },
  { id: 'agent-run',   label: 'Agent Runs',     icon: <RunIcon />,  badge: '1' },
  { id: 'documents',   label: 'Documents',      icon: <DocIcon /> },
  { id: 'knowledge',   label: 'Knowledge Base', icon: <BookIcon /> },
  { id: 'security',    label: 'Security',       icon: <ShieldIcon /> },
  { id: 'audit',       label: 'Audit Trail',    icon: <ListIcon /> },
  { id: 'settings',    label: 'Settings',       icon: <GearIcon /> },
]

// Inline SVG icons — semantic, accessible, consistent size
function GridIcon()   { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> }
function PlusIcon()   { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"   viewBox="0 0 16 16" aria-hidden><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg> }
function FlowIcon()   { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><circle cx="3" cy="8" r="2"/><circle cx="13" cy="4" r="2"/><circle cx="13" cy="12" r="2"/><line x1="5" y1="7" x2="11" y2="5"/><line x1="5" y1="9" x2="11" y2="11"/></svg> }
function RunIcon()    { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><polygon points="3,2 13,8 3,14"/></svg> }
function DocIcon()    { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9"  y2="11"/></svg> }
function BookIcon()   { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><path d="M2 13V3a1 1 0 011-1h5v11H3a1 1 0 01-1-1z"/><path d="M8 2h5a1 1 0 011 1v10a1 1 0 01-1 1H8V2z"/></svg> }
function ShieldIcon() { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z"/></svg> }
function ListIcon()   { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><line x1="2" y1="4"  x2="14" y2="4"/><line x1="2" y1="8"  x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="12"/></svg> }
function GearIcon()   { return <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16" aria-hidden><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg> }

function Sidebar({ current, onNav }: { current: Page; onNav: (p: Page) => void }) {
  return (
    <aside
      className="flex flex-col w-52 h-screen bg-[#0a0f1a] border-r border-[#1e2d45] shrink-0"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="px-4 pt-5 pb-4 border-b border-[#1e2d45]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-500/15 border border-blue-500/35 flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 1L2 4v4c0 3.3 2.5 6.3 6 7 3.5-.7 6-3.7 6-7V4L8 1z" fill="#3b82f6" opacity="0.9"/>
            </svg>
          </div>
          <div>
            <p className="font-display font-semibold text-[14px] text-white leading-tight tracking-tight">SovereignAI</p>
            <p className="text-[10px] text-slate-500 font-mono leading-none">Local · Private · Offline</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 px-2 overflow-y-auto" aria-label="Pages">
        {NAV.map(item => {
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-all duration-100 text-left ${
                active
                  ? 'bg-blue-500/12 text-blue-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              <span className={`shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`}>
                {item.icon}
              </span>
              <span className="flex-1 text-[13px]">{item.label}</span>
              {item.badge && (
                <span className="text-[10px] font-mono bg-blue-500 text-white w-4 h-4 rounded-full flex items-center justify-center shrink-0" aria-label={`${item.badge} pending`}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* System health footer */}
      <div className="px-4 py-3 border-t border-[#1e2d45]">
        <div className="flex items-center gap-2 mb-1">
          <StatusDot status="ready" label="System status" />
          <span className="text-[11px] text-slate-400">All systems operational</span>
        </div>
        <p className="text-[10px] text-slate-600 font-mono">v1.0.0-sih · Offline mode</p>
      </div>
    </aside>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ onNav }: { onNav: (p: Page) => void }) {
  const [dismissed, setDismissed] = useState(false)

  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in" aria-label="Dashboard">
      {/* First-time orientation banner */}
      {!dismissed && (
        <div className="mb-6 bg-[#0d1321] border border-blue-500/20 rounded-xl p-4 flex items-start gap-4 animate-slide-up">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 flex items-center justify-center mt-0.5">
            <ShieldIcon />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-0.5">AI assistance for confidential work — running locally.</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Give SovereignAI a document, image, or task. It analyzes it using local AI, checks your organization's knowledge, and produces a verified result.
              Your data never leaves this environment.
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      {/* CTA */}
      <div className="mb-6 bg-[#0d1321] border border-[#1e2d45] rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-white mb-0.5">Start a confidential task</h2>
          <p className="text-xs text-slate-400">Upload documents, images, spreadsheets, or code. All AI runs locally.</p>
        </div>
        <Btn onClick={() => onNav('new-task')} className="shrink-0">
          Start a Task
        </Btn>
      </div>

      {/* System status */}
      <div className="mb-6">
        <SectionLabel>Local system status</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {SYSTEM_STATUS.map(s => (
            <div key={s.label} className="bg-[#0d1321] border border-[#1e2d45] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <StatusDot status={s.status} label={s.label} />
                <span className="text-xs font-medium text-slate-300 leading-none">{s.label}</span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column lower area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent runs */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recent Agent Runs</h3>
            <button
              onClick={() => onNav('agent-run')}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View all
            </button>
          </div>
          {RECENT_RUNS.length === 0 ? (
            <EmptyState title="No runs yet" body="Completed tasks will appear here." action="Start a Task" onAction={() => onNav('new-task')} />
          ) : (
            <ul className="space-y-0" role="list">
              {RECENT_RUNS.map(run => (
                <li
                  key={run.id}
                  className="flex items-center gap-3 py-2.5 border-b border-[#1e2d45]/60 last:border-0 cursor-pointer hover:bg-white/[0.02] -mx-1 px-1 rounded"
                  onClick={() => onNav('agent-run')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onNav('agent-run')}
                  aria-label={`${run.task} — ${run.status}`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    run.status === 'complete' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse-slow'
                  }`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-slate-200 truncate">{run.task}</p>
                    <p className="text-[11px] text-slate-500 font-mono">{run.id} · {run.model}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge variant={run.status === 'complete' ? 'success' : 'warn'}>
                      {run.status === 'complete' ? 'Done' : 'Needs review'}
                    </Badge>
                    <p className="text-[11px] text-slate-600 mt-0.5">{run.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Data sovereignty */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Where does your data go?</h3>
          <div className="space-y-2.5">
            {[
              { label: 'AI processing',          value: 'On this machine' },
              { label: 'Document reading',        value: 'On this machine' },
              { label: 'Knowledge retrieval',     value: 'On this machine' },
              { label: 'External AI services',    value: 'None used' },
              { label: 'Cloud uploads',           value: 'None made' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">{row.label}</span>
                <span className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-400/30 bg-emerald-400/5">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[#1e2d45]">
            <button onClick={() => onNav('security')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              View full security details →
            </button>
          </div>
        </Card>
      </div>
    </main>
  )
}

// ─── New Task ─────────────────────────────────────────────────────────────────

const TASK_TYPES = [
  {
    id: 'inspection', label: 'Analyze a Document',
    description: 'Find important information and prepare a useful result from reports, manuals, or PDFs.',
    inputs: 'PDF · DOCX · XLSX · TXT',
    model: 'Phi-3-Vision-Q4', modelLabel: 'Vision + reasoning model',
    reason: 'Selected because this task may involve scanned pages or images.',
  },
  {
    id: 'image', label: 'Analyze an Image',
    description: 'Understand information in a technical image, engineering drawing, or photograph.',
    inputs: 'PNG · JPG · TIFF · BMP',
    model: 'Phi-3-Vision-Q4', modelLabel: 'Vision model',
    reason: 'Selected because this task requires understanding visual content.',
  },
  {
    id: 'search', label: 'Search Knowledge',
    description: 'Find information from your approved local documents and manuals.',
    inputs: 'Text query',
    model: 'nomic-embed-v1.5', modelLabel: 'Embedding model',
    reason: 'Selected because this task requires finding relevant text sections.',
  },
  {
    id: 'code', label: 'Generate and Test Code',
    description: 'Create code, run it safely in an isolated sandbox, and verify the result.',
    inputs: 'Text description',
    model: 'CodeLlama-7B-Q4', modelLabel: 'Code generation model',
    reason: 'Selected because this task requires writing and testing code.',
  },
  {
    id: 'report', label: 'Create a Report',
    description: 'Turn available information into a structured report or approval note.',
    inputs: 'Text · PDF · Data',
    model: 'Mistral-7B-Q4', modelLabel: 'Reasoning model',
    reason: 'Selected because this task requires structured document generation.',
  },
  {
    id: 'summary', label: 'Summarize a Document',
    description: 'Summarize a document using available evidence and source references.',
    inputs: 'PDF · DOCX · TXT',
    model: 'Mistral-7B-Q4', modelLabel: 'Reasoning model',
    reason: 'Selected because this task requires understanding and condensing text.',
  },
]

function NewTask({ onStartRun }: { onStartRun: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<string | null>(null)
  const [taskText, setTaskText] = useState('')
  const [showTechDetails, setShowTechDetails] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const task = TASK_TYPES.find(t => t.id === selected)
  const canRun = !!selected

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.[0]) setFile(e.target.files[0].name)
  }

  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in max-w-4xl" aria-label="New Task">
      <PageHeader title="New Task" subtitle="Choose what you'd like to do, upload your file, and run the local AI workflow." />

      {/* Task type grid */}
      <div className="mb-7">
        <SectionLabel>What would you like to do?</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {TASK_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              aria-pressed={selected === t.id}
              className={`text-left p-4 rounded-xl border transition-all duration-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c14] ${
                selected === t.id
                  ? 'border-blue-500/50 bg-blue-500/8 ring-1 ring-blue-500/20'
                  : 'border-[#1e2d45] bg-[#0d1321] hover:border-[#2a3d5a] hover:bg-[#111827]'
              }`}
            >
              <p className={`text-[13px] font-semibold mb-1.5 ${selected === t.id ? 'text-white' : 'text-slate-100'}`}>
                {t.label}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="animate-slide-up space-y-5">
          {/* File upload */}
          <div>
            <SectionLabel>Your file — accepted: {task?.inputs}</SectionLabel>
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload file — click or drag and drop"
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging ? 'border-blue-500 bg-blue-500/5' : 'border-[#1e2d45] hover:border-[#2a3d5a]'
              }`}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault(); setDragging(false)
                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0].name)
              }}
              onClick={() => fileRef.current?.click()}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <DocIcon />
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">{file}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Ready · click to replace</p>
                  </div>
                  <Badge variant="success">Ready</Badge>
                </div>
              ) : (
                <>
                  <div className="w-8 h-8 mx-auto mb-3 opacity-20">
                    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M16 22V10M10 16l6-6 6 6"/><rect x="4" y="24" width="24" height="4" rx="2"/></svg>
                  </div>
                  <p className="text-sm text-slate-400 mb-1">Drop a file here, or click to browse</p>
                  <p className="text-xs text-slate-600 font-mono">{task?.inputs}</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} aria-hidden />
          </div>

          {/* Optional description */}
          <div>
            <SectionLabel>Describe what you need (optional)</SectionLabel>
            <textarea
              value={taskText}
              onChange={e => setTaskText(e.target.value)}
              placeholder="e.g. 'Extract all critical findings from this inspection report and prepare an approval note.'"
              aria-label="Task description"
              className="w-full bg-[#0d1321] border border-[#1e2d45] rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 resize-none focus:outline-none focus:border-blue-500/50 transition-colors"
              rows={3}
            />
          </div>

          {/* Model selection — simplified; tech details collapsible */}
          <div className="bg-[#0d1321] border border-[#1e2d45] rounded-xl overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 mb-0.5">A suitable local AI model will be chosen automatically</p>
                <p className="text-sm text-slate-200">
                  <span className="font-medium text-white">{task?.modelLabel}</span>
                  {' '}· Local inference · No external AI required
                </p>
              </div>
              <button
                onClick={() => setShowTechDetails(!showTechDetails)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0 ml-4"
                aria-expanded={showTechDetails}
              >
                {showTechDetails ? 'Hide details' : 'Technical details'}
              </button>
            </div>
            {showTechDetails && (
              <div className="border-t border-[#1e2d45] px-4 py-3 animate-fade-in">
                <div className="grid grid-cols-3 gap-4 font-mono text-xs">
                  <div>
                    <p className="text-slate-600 mb-0.5">Model ID</p>
                    <p className="text-blue-400">{task?.model}</p>
                  </div>
                  <div>
                    <p className="text-slate-600 mb-0.5">Inference</p>
                    <p className="text-emerald-400">embedded_local</p>
                  </div>
                  <div>
                    <p className="text-slate-600 mb-0.5">External API</p>
                    <p className="text-emerald-400">NONE</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 mt-2">{task?.reason}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Btn onClick={onStartRun} disabled={!canRun}>
              Run Task →
            </Btn>
            {!canRun && (
              <p className="text-xs text-slate-600 self-center">Choose a task type above to continue</p>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

// ─── Workflows ────────────────────────────────────────────────────────────────

const WORKFLOW_DEFS = [
  {
    id: 'inspection-approval',
    label: 'Inspection Report → Approval Note',
    description: 'Process a scanned or digital inspection report. Extract findings, check SOPs, and generate a ready-to-sign approval note.',
    input: 'Scanned PDF or inspection report',
    output: 'Approval_Note.docx + Inspection_Findings.xlsx',
    steps: ['Upload', 'Read', 'Check Knowledge', 'Analyze', 'Review', 'Generate', 'Verify'],
    status: 'available' as const,
    lastRun: '14 min ago',
  },
  {
    id: 'pdf-summary',
    label: 'Technical PDF → Summary',
    description: 'Read a technical document and produce a concise summary with source references.',
    input: 'Technical PDF or manual',
    output: 'Technical_Summary.pdf',
    steps: ['Upload', 'Read', 'Summarize', 'Verify'],
    status: 'available' as const,
    lastRun: '5h ago',
  },
  {
    id: 'image-findings',
    label: 'Engineering Image → Findings',
    description: 'Analyze a photograph, P&ID, or engineering drawing and identify relevant issues.',
    input: 'PNG · JPG · TIFF',
    output: 'Findings report',
    steps: ['Upload', 'Analyze image', 'Check Knowledge', 'Report'],
    status: 'available' as const,
    lastRun: '2h ago',
  },
  {
    id: 'code-agent',
    label: 'Coding Request → Tested Program',
    description: 'Describe a computation or script. A local coding model generates code, runs it in an isolated sandbox, and verifies the result.',
    input: 'Text description',
    output: 'Generated_Code.py + test results',
    steps: ['Describe', 'Generate', 'Sandbox', 'Test', 'Verify'],
    status: 'available' as const,
    lastRun: '2h ago',
  },
  {
    id: 'knowledge-search',
    label: 'Knowledge Search',
    description: 'Search across your indexed local documents using natural language. Results are ranked by relevance.',
    input: 'Text query',
    output: 'Ranked document sections with source links',
    steps: ['Query', 'Find', 'Rank', 'Return'],
    status: 'available' as const,
    lastRun: '1d ago',
  },
]

function Workflows({ onNav }: { onNav: (p: Page) => void }) {
  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in" aria-label="Workflows">
      <PageHeader
        title="Workflows"
        subtitle="Pre-defined task workflows. Each one runs entirely on this machine — no external AI required."
      />
      <div className="space-y-3">
        {WORKFLOW_DEFS.map(w => (
          <Card key={w.id} className="p-5 hover:border-[#2a3d5a] transition-colors cursor-pointer">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-sm font-semibold text-white">{w.label}</h3>
                  <Badge variant="success">Available</Badge>
                </div>
                <p className="text-xs text-slate-400 mb-3 leading-relaxed">{w.description}</p>
                <div className="flex items-center flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500">
                  <span><span className="text-slate-600">Input: </span>{w.input}</span>
                  <span><span className="text-slate-600">Output: </span>{w.output}</span>
                  <span><span className="text-slate-600">Last run: </span>{w.lastRun}</span>
                </div>
                {/* Step breadcrumb */}
                <div className="flex items-center gap-1 mt-3 flex-wrap">
                  {w.steps.map((s, i) => (
                    <span key={s} className="flex items-center gap-1">
                      <span className="text-[11px] font-mono text-slate-500 bg-[#111827] border border-[#1e2d45] px-1.5 py-0.5 rounded">{s}</span>
                      {i < w.steps.length - 1 && <span className="text-slate-700 text-xs">→</span>}
                    </span>
                  ))}
                </div>
              </div>
              <Btn variant="secondary" onClick={() => onNav('new-task')} className="shrink-0">
                Start →
              </Btn>
            </div>
          </Card>
        ))}
      </div>
    </main>
  )
}

// ─── Agent Run ────────────────────────────────────────────────────────────────

function AgentRun({ autoPlay }: { autoPlay?: boolean }) {
  const [steps, setSteps] = useState<WorkflowStep[]>(() => STEPS_INIT.map(s => ({ ...s })))
  const [currentStep, setCurrentStep] = useState(-1)
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'audit' | 'technical'>('overview')
  const [approved, setApproved] = useState(false)
  const [reviewActioned, setReviewActioned] = useState(false)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      timeoutsRef.current.forEach(clearTimeout)
    }
  }, [])

  const startRun = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    if (!mountedRef.current) return

    setRunStatus('running')
    setApproved(false)
    setReviewActioned(false)
    setCurrentStep(0)
    setSteps(STEPS_INIT.map((s, i) => ({ ...s, status: i === 0 ? 'active' : 'pending' })))

    let elapsed = 0
    STEP_DURATIONS_MS.forEach((dur, idx) => {
      const t1 = setTimeout(() => {
        if (!mountedRef.current) return
        setCurrentStep(idx)
        setSteps(prev => prev.map((s, i) => ({
          ...s,
          status: i < idx ? 'done' : i === idx ? 'active' : 'pending',
          duration: i < idx ? STEP_DURATIONS_MS[i] : undefined,
        })))
      }, elapsed)
      timeoutsRef.current.push(t1)
      elapsed += dur
    })
    const tEnd = setTimeout(() => {
      if (!mountedRef.current) return
      setSteps(prev => prev.map(s => ({ ...s, status: 'done', duration: STEP_DURATIONS_MS[STEPS_INIT.findIndex(si => si.id === s.id)] })))
      setRunStatus('review')
      setCurrentStep(-1)
    }, elapsed + 400)
    timeoutsRef.current.push(tEnd)
  }, [])

  useEffect(() => {
    if (autoPlay) startRun()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isRunning = runStatus === 'running'
  const isDone = runStatus === 'review' || runStatus === 'approved' || runStatus === 'rejected'

  return (
    <main className="flex-1 flex overflow-hidden animate-fade-in" aria-label="Agent Run">
      {/* Main content */}
      <div className="flex-1 p-7 overflow-y-auto min-w-0">

        {/* Run header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="font-mono text-xs text-slate-500">RUN-042</span>
              <Badge variant={
                runStatus === 'running'  ? 'primary' :
                runStatus === 'review'   ? 'warn'    :
                runStatus === 'approved' ? 'success' :
                runStatus === 'rejected' ? 'danger'  : 'neutral'
              }>
                {runStatus === 'idle'     ? 'Ready'          :
                 runStatus === 'running'  ? 'Running'         :
                 runStatus === 'review'   ? 'Awaiting review' :
                 runStatus === 'approved' ? 'Approved'        : 'Rejected'}
              </Badge>
            </div>
            <h1 className="font-display text-xl font-semibold text-white mb-0.5">Inspection Report Analysis</h1>
            <p className="text-xs text-slate-500">
              Inspection_Report_2024.pdf · 8 pages · Local AI · No external requests
            </p>
          </div>
          {!isRunning && (
            <Btn variant={isDone ? 'secondary' : 'primary'} onClick={startRun} className="shrink-0">
              {isDone ? 'Re-run' : 'Run workflow'}
            </Btn>
          )}
        </div>

        {/* Stepper */}
        <Card className="p-5 mb-5">
          <SectionLabel>Workflow progress</SectionLabel>
          <div className="flex items-start">
            {steps.map((step, i) => (
              <div key={step.id} className="flex-1 flex flex-col items-center relative min-w-0">
                {/* Connector */}
                {i < steps.length - 1 && (
                  <div className="absolute top-[11px] left-1/2 w-full h-px bg-[#1e2d45] z-0">
                    <div
                      className="h-full bg-emerald-500/50 transition-all duration-500"
                      style={{ width: step.status === 'done' ? '100%' : '0%' }}
                    />
                  </div>
                )}
                {/* Node */}
                <div className={`relative z-10 w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center mb-2 shrink-0 transition-all duration-300 ${
                  step.status === 'done'   ? 'bg-emerald-500 border-emerald-500' :
                  step.status === 'active' ? 'bg-blue-500   border-blue-500 shadow-md shadow-blue-500/25' :
                                             'bg-[#0d1321]  border-[#1e2d45]'
                }`}>
                  {step.status === 'done'   && <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" aria-hidden><polyline points="1.5,5 4,8 8.5,2"/></svg>}
                  {step.status === 'active' && <span className="w-2 h-2 bg-white rounded-full animate-pulse-slow" />}
                </div>
                {/* Label */}
                <p className={`text-[11px] font-medium text-center leading-tight px-0.5 ${
                  step.status === 'done'   ? 'text-emerald-400' :
                  step.status === 'active' ? 'text-white' : 'text-slate-600'
                }`}>
                  {step.label}
                </p>
              </div>
            ))}
          </div>

          {/* Active step explanation */}
          {isRunning && currentStep >= 0 && steps[currentStep] && (
            <div className="mt-4 pt-4 border-t border-[#1e2d45] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse-slow shrink-0" aria-hidden />
              <p className="text-xs text-slate-300">{steps[currentStep].explanation}</p>
            </div>
          )}
          {!isRunning && runStatus === 'idle' && (
            <div className="mt-4 pt-4 border-t border-[#1e2d45] text-center">
              <p className="text-xs text-slate-600">Click "Run workflow" to begin the analysis.</p>
            </div>
          )}
        </Card>

        {/* Tabs */}
        <div
          className="flex gap-0.5 mb-5 bg-[#0d1321] border border-[#1e2d45] rounded-lg p-1 w-fit"
          role="tablist"
        >
          {([
            { id: 'overview',  label: 'Overview' },
            { id: 'findings',  label: 'Findings' },
            { id: 'audit',     label: 'Audit Trail' },
            { id: 'technical', label: 'Technical Details' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === tab.id ? 'bg-[#1a2233] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-fade-in" role="tabpanel">
            {isRunning && (
              <Card className="p-8 text-center">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin-slow mx-auto mb-3" aria-hidden />
                <p className="text-sm text-slate-300 mb-0.5">Running local AI workflow…</p>
                <p className="text-xs text-slate-500">No external AI service is being used</p>
              </Card>
            )}
            {!isRunning && runStatus === 'idle' && (
              <EmptyState
                icon="▷"
                title="No results yet"
                body="Run the workflow to analyze the inspection report."
              />
            )}
            {isDone && (
              <>
                {/* Summary */}
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-2">Summary</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    The inspection report for Facility FA-07 (dated 2024-09-15) documents 4 findings across mechanical and instrumentation systems.
                    One critical item — PRV-204 pressure relief valve overdue for mandatory test — requires immediate corrective action.
                    Two medium-severity items and one high-severity corrosion finding require scheduled remediation.
                  </p>
                </Card>

                {/* Recommended next step */}
                <div className="bg-[#0d1321] border border-blue-500/20 rounded-xl p-4">
                  <p className="text-[11px] font-mono text-blue-400 uppercase tracking-widest mb-1">Next step</p>
                  <p className="text-sm text-slate-300">Review the critical finding for PRV-204 (page 3) and confirm the corrective action deadline with the maintenance team.</p>
                </div>

                {/* Human review */}
                <div className={`border rounded-xl p-5 transition-colors ${
                  approved           ? 'border-emerald-500/35 bg-emerald-500/[0.04]' :
                  reviewActioned     ? 'border-[#1e2d45] bg-[#0d1321]' :
                                       'border-amber-500/35 bg-amber-500/[0.04]'
                }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-amber-400 uppercase tracking-widest mb-1">
                        {approved ? 'Human review — Approved' : 'Human review required'}
                      </p>
                      <h3 className="text-sm font-semibold text-white mb-1">
                        {approved ? 'Approval_Note.docx is finalized.' : 'AI-generated draft — verify before using officially.'}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {approved
                          ? 'The document has been approved by a human reviewer and is ready for distribution.'
                          : 'This draft was produced by a local AI model. Review the findings, edit if needed, and approve before treating it as an official document.'}
                      </p>
                    </div>
                    {!reviewActioned && (
                      <div className="flex gap-2 shrink-0">
                        <Btn variant="secondary" onClick={() => setReviewActioned(true)}>Edit</Btn>
                        <Btn variant="primary"
                          onClick={() => { setReviewActioned(true); setApproved(true); setRunStatus('approved') }}
                        >
                          Approve
                        </Btn>
                        <Btn variant="danger"
                          onClick={() => { setReviewActioned(true); setRunStatus('rejected') }}
                        >
                          Reject
                        </Btn>
                      </div>
                    )}
                  </div>
                </div>

                {/* Generated files */}
                <Card className="p-5">
                  <h3 className="text-sm font-semibold text-white mb-3">Generated Files</h3>
                  <ul className="space-y-2" role="list">
                    {[
                      { name: 'Approval_Note.docx',        size: '48 KB', type: 'DOCX' },
                      { name: 'Inspection_Findings.xlsx',   size: '22 KB', type: 'XLSX' },
                      { name: 'Technical_Summary.pdf',      size: '91 KB', type: 'PDF' },
                    ].map(f => (
                      <li key={f.name} className="flex items-center gap-3 p-3 rounded-lg bg-[#111827] border border-[#1e2d45]">
                        <Badge variant="primary">{f.type}</Badge>
                        <span className="text-sm text-slate-200 flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-slate-500 font-mono shrink-0">{f.size}</span>
                        <Badge variant="success">✓ Validated</Badge>
                        <Btn variant="ghost" className="shrink-0 text-xs py-1 px-2">Open</Btn>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Tab: Findings */}
        {activeTab === 'findings' && (
          <div className="space-y-3 animate-fade-in" role="tabpanel">
            {isDone ? FINDINGS.map(f => (
              <Card key={f.id} className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <SeverityBadge s={f.severity} />
                  <p className="text-sm text-slate-100 leading-snug font-medium">{f.title}</p>
                </div>
                <div className="space-y-1.5 pl-0">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-slate-600 font-mono w-16 shrink-0">Source</span>
                    <span className="text-slate-400">{f.source} — Page {f.page}</span>
                  </div>
                  {f.guidance && (
                    <div className="flex items-start gap-2 text-xs">
                      <span className="text-slate-600 font-mono w-16 shrink-0">Guidance</span>
                      <span className="text-blue-400">{f.guidance}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600 font-mono w-16 shrink-0">Evidence</span>
                    <EvidencePill s={f.evidenceStatus} />
                  </div>
                </div>
              </Card>
            )) : (
              <EmptyState title="No findings yet" body="Run the workflow first to extract findings." />
            )}
          </div>
        )}

        {/* Tab: Audit trail */}
        {activeTab === 'audit' && (
          <div className="bg-[#0d1321] border border-[#1e2d45] rounded-xl overflow-hidden animate-fade-in" role="tabpanel">
            <table className="w-full text-xs" aria-label="Audit events">
              <thead>
                <tr className="border-b border-[#1e2d45]">
                  {['Time', 'Component', 'Event', 'Duration', 'Status'].map((h, i) => (
                    <th key={h} scope="col" className={`px-4 py-3 text-[10px] font-mono text-slate-500 uppercase tracking-wider font-normal ${i >= 3 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AUDIT_EVENTS.map(e => (
                  <tr key={e.id} className="border-b border-[#1e2d45]/40 last:border-0 hover:bg-white/[0.015]">
                    <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">{e.timestamp}</td>
                    <td className="px-4 py-2.5 font-mono text-blue-400/70 whitespace-nowrap">{e.component}</td>
                    <td className="px-4 py-2.5 text-slate-300">{e.event}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-right whitespace-nowrap">
                      {e.duration ? `${(e.duration / 1000).toFixed(2)}s` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Badge variant={e.status === 'ok' ? 'success' : e.status === 'warn' ? 'warn' : 'danger'}>
                        {e.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab: Technical details */}
        {activeTab === 'technical' && (
          <div className="space-y-4 animate-fade-in" role="tabpanel">
            <Card className="p-5">
              <SectionLabel>Model routing decision</SectionLabel>
              <dl className="space-y-2.5 font-mono text-xs">
                {[
                  ['Task category',    'inspection_document_analysis'],
                  ['Modality',         'vision + text (scanned PDF)'],
                  ['Selected model',   'Phi-3-Vision-Q4-K-M'],
                  ['Inference mode',   'embedded_local / llama-cpp-python'],
                  ['Context used',     '14,241 / 128,000 tokens'],
                  ['Quantization',     'Q4_K_M'],
                  ['RAM usage',        '4.7 GB / 16 GB available'],
                  ['External AI API',  'NONE'],
                  ['Network request',  'NONE'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <dt className="text-slate-600 w-36 shrink-0">{k}</dt>
                    <dd className={v === 'NONE' ? 'text-emerald-400' : k === 'Selected model' ? 'text-blue-400' : 'text-slate-300'}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card className="p-5">
              <SectionLabel>Knowledge retrieval</SectionLabel>
              <dl className="space-y-2.5 font-mono text-xs">
                {[
                  ['Embedding model', 'nomic-embed-text-v1.5 (local)'],
                  ['Vector index',    'FAISS IVF-Flat (local)'],
                  ['Sources queried', '3 documents, 182 chunks'],
                  ['Top-k retrieved', '7 chunks (relevance ≥ high)'],
                  ['Cloud vector DB', 'NONE'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <dt className="text-slate-600 w-36 shrink-0">{k}</dt>
                    <dd className={v === 'NONE' ? 'text-emerald-400' : k === 'Embedding model' ? 'text-blue-400' : 'text-slate-300'}>{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
            <Card className="p-5">
              <SectionLabel>Tools executed</SectionLabel>
              <ul className="space-y-2">
                {[
                  ['FileReader',                  '120'],
                  ['OCR (Tesseract 5.3)',          '3,240'],
                  ['KnowledgeSearch (FAISS)',       '890'],
                  ['ImageAnalyzer (Phi-3-Vision)',  '2,100'],
                  ['FindingsExtractor',            '1,560'],
                  ['DOCXGenerator (python-docx)',   '2,100'],
                  ['XLSXGenerator (openpyxl)',      '340'],
                  ['OutputValidator',              '780'],
                  ['AuditLogger',                  '45'],
                ].map(([tool, ms]) => (
                  <li key={tool} className="flex items-center gap-3 font-mono text-xs">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#10b981" strokeWidth="2" aria-hidden><polyline points="1.5,5 4,8 8.5,2"/></svg>
                    <span className="text-slate-300 flex-1">{tool}</span>
                    <span className="text-slate-600">{ms} ms</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>

      {/* Right panel */}
      <aside className="w-60 border-l border-[#1e2d45] p-5 overflow-y-auto shrink-0" aria-label="Run details">
        <SectionLabel>What the AI is doing</SectionLabel>
        <ol className="space-y-3 mb-6" aria-label="Agent plan steps">
          {[
            { label: 'Read the report',          detail: 'Validate file and detect format' },
            { label: 'Extract information',      detail: 'Local OCR via Tesseract 5.3' },
            { label: 'Check SOPs',               detail: 'Local knowledge search' },
            { label: 'Compare findings',         detail: 'Local AI analysis' },
            { label: 'Prepare approval note',    detail: 'Document generation' },
            { label: 'Validate output',          detail: 'Section and content checks' },
          ].map((item, i) => (
            <li key={item.label} className="flex gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[#1a2233] border border-[#2a3d5a] flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-mono text-slate-500">{i + 1}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200 leading-tight">{item.label}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="border-t border-[#1e2d45] pt-4 mb-4">
          <SectionLabel>Knowledge checked</SectionLabel>
          <ul className="space-y-2">
            {[
              { name: 'Inspection_SOP.pdf',         sections: '§3.2, §5.4' },
              { name: 'Technical_Manual_Rev4.pdf',  sections: '§7.1' },
              { name: 'Calibration_Policy_2024.pdf', sections: '§2.1' },
            ].map(k => (
              <li key={k.name} className="text-[11px]">
                <p className="text-blue-400 font-mono truncate">{k.name}</p>
                <p className="text-slate-600">{k.sections}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-[#1e2d45] pt-4">
          <SectionLabel>Provenance</SectionLabel>
          <dl className="space-y-1.5 text-[11px]">
            {[
              { k: 'Source facts',  v: 'OCR + local search' },
              { k: 'AI analysis',   v: 'Phi-3-Vision (local)' },
              { k: 'Document',      v: 'python-docx (local)' },
              { k: 'Human review',  v: approved ? 'Approved ✓' : 'Pending' },
            ].map(row => (
              <div key={row.k} className="flex justify-between">
                <dt className="text-slate-600">{row.k}</dt>
                <dd className={`font-mono ${row.k === 'Human review' ? (approved ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-400'}`}>
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </main>
  )
}

// ─── Documents ────────────────────────────────────────────────────────────────

function Documents() {
  const [tab, setTab] = useState<'all' | 'uploaded' | 'generated'>('all')
  const [selected, setSelected] = useState<string | null>(null)

  const docs = [
    { name: 'Inspection_Report_2024.pdf', origin: 'Uploaded',  size: '2.3 MB', status: 'processed', run: 'RUN-042', date: 'Today 14:22' },
    { name: 'Engineering_Drawing_EA-14.png', origin: 'Uploaded', size: '4.1 MB', status: 'processed', run: 'RUN-041', date: 'Today 12:05' },
    { name: 'Calculation_Sheet_v3.xlsx', origin: 'Uploaded',   size: '0.6 MB', status: 'processed', run: 'RUN-040', date: 'Today 09:14' },
    { name: 'Approval_Note.docx',        origin: 'Generated',  size: '48 KB',  status: 'validated', run: 'RUN-042', date: 'Today 14:38' },
    { name: 'Inspection_Findings.xlsx',  origin: 'Generated',  size: '22 KB',  status: 'validated', run: 'RUN-042', date: 'Today 14:38' },
    { name: 'Technical_Summary.pdf',     origin: 'Generated',  size: '91 KB',  status: 'validated', run: 'RUN-042', date: 'Today 14:39' },
  ].filter(d => tab === 'all' || d.origin.toLowerCase() === tab)

  function fileIcon(name: string) {
    if (name.endsWith('.pdf'))  return <svg width="14" height="14" fill="none" stroke="#64748b" strokeWidth="1.5" viewBox="0 0 16 16" aria-hidden><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="9" y2="11"/></svg>
    if (name.endsWith('.xlsx')) return <svg width="14" height="14" fill="none" stroke="#64748b" strokeWidth="1.5" viewBox="0 0 16 16" aria-hidden><rect x="1" y="1" width="14" height="14" rx="1.5"/><line x1="6" y1="1" x2="6" y2="15"/><line x1="10" y1="1" x2="10" y2="15"/><line x1="1" y1="5" x2="15" y2="5"/><line x1="1" y1="9" x2="15" y2="9"/></svg>
    if (name.endsWith('.docx')) return <svg width="14" height="14" fill="none" stroke="#64748b" strokeWidth="1.5" viewBox="0 0 16 16" aria-hidden><rect x="2" y="1" width="12" height="14" rx="1.5"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/></svg>
    return <svg width="14" height="14" fill="none" stroke="#64748b" strokeWidth="1.5" viewBox="0 0 16 16" aria-hidden><rect x="2" y="1" width="12" height="14" rx="1.5"/></svg>
  }

  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in" aria-label="Documents">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-white mb-1">Documents</h1>
          <p className="text-sm text-slate-400">Uploaded inputs and AI-generated outputs. All files stay on this machine.</p>
        </div>
        <Btn variant="secondary">Upload file</Btn>
      </div>

      {/* Tab filter */}
      <div className="flex gap-0.5 mb-5 bg-[#0d1321] border border-[#1e2d45] rounded-lg p-1 w-fit" role="tablist">
        {([['all', 'All'], ['uploaded', 'Uploaded'], ['generated', 'Generated']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === id ? 'bg-[#1a2233] text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {docs.length === 0 ? (
          <EmptyState title="No documents" body="Files will appear here after you upload or generate them." />
        ) : (
          <table className="w-full text-sm" aria-label="Document list">
            <thead>
              <tr className="border-b border-[#1e2d45]">
                {['Document', 'Type', 'Size', 'Run', 'Date', 'Status'].map((h, i) => (
                  <th key={h} scope="col" className={`px-4 py-3 text-[10px] font-mono text-slate-500 uppercase tracking-wider font-normal ${i === 5 ? 'text-right pr-5' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docs.map((d, i) => (
                <tr
                  key={i}
                  className={`border-b border-[#1e2d45]/40 last:border-0 cursor-pointer transition-colors ${
                    selected === d.name ? 'bg-blue-500/5' : 'hover:bg-white/[0.02]'
                  }`}
                  onClick={() => setSelected(selected === d.name ? null : d.name)}
                  role="row"
                  aria-selected={selected === d.name}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setSelected(selected === d.name ? null : d.name)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {fileIcon(d.name)}
                      <span className="text-slate-200 font-medium truncate max-w-[220px]">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={d.origin === 'Generated' ? 'primary' : 'neutral'}>{d.origin}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs font-mono">{d.size}</td>
                  <td className="px-4 py-3 text-blue-400 text-xs font-mono">{d.run}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{d.date}</td>
                  <td className="px-5 py-3 text-right">
                    <Badge variant={d.status === 'validated' ? 'success' : 'info'}>
                      {d.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Detail panel when a row is selected */}
      {selected && (
        <div className="mt-4 animate-slide-up">
          <Card className="p-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-white mb-0.5">{selected}</p>
              <p className="text-xs text-slate-500">Select an action below</p>
            </div>
            <div className="flex gap-2">
              <Btn variant="primary">Open</Btn>
              <Btn variant="secondary">Download</Btn>
              <Btn variant="ghost" onClick={() => setSelected(null)}>✕</Btn>
            </div>
          </Card>
        </div>
      )}
    </main>
  )
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

const RELEVANCE_LABEL: Record<number, string> = {
  0: 'Low', 1: 'Medium', 2: 'High', 3: 'Very high',
}
function relevanceTier(score: number) {
  if (score >= 0.9) return { label: 'Very high', cls: 'text-emerald-400' }
  if (score >= 0.8) return { label: 'High',      cls: 'text-emerald-400/70' }
  if (score >= 0.65) return { label: 'Medium',   cls: 'text-amber-400' }
  return { label: 'Low', cls: 'text-slate-500' }
}

function KnowledgeBase() {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = [
    {
      doc: 'Inspection_SOP.pdf', section: '§3.2 — Pressure Relief Device Testing',
      text: 'All pressure relief devices must be tested at intervals not exceeding 12 months. Overdue tests of more than 30 days constitute a critical non-conformance and require immediate escalation to the facility engineer.',
      score: 0.94,
    },
    {
      doc: 'Inspection_SOP.pdf', section: '§5.4 — Insulation and Protective Coatings',
      text: 'Visual inspection of thermal and acoustic insulation should identify delamination, moisture ingress, or mechanical damage. Degraded insulation on process pipelines must be flagged for maintenance within 90 days.',
      score: 0.87,
    },
    {
      doc: 'Technical_Manual_Rev4.pdf', section: '§7.1 — Weld Inspection Criteria',
      text: 'Surface corrosion at weld joints exceeding Grade B per ASTM A380 constitutes a high-severity finding. Corrective action including re-coating or re-welding must be scheduled within the next planned maintenance window.',
      score: 0.82,
    },
  ]

  function doSearch() {
    if (query.trim()) setSearched(true)
  }

  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in" aria-label="Knowledge Base">
      <PageHeader
        title="Knowledge Base"
        subtitle="Search your organization's approved local documents. All retrieval runs on this machine."
      />

      {/* Search */}
      <div className="mb-7">
        <label htmlFor="kb-search" className="sr-only">Search knowledge base</label>
        <div className="flex gap-2.5">
          <input
            id="kb-search"
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="e.g. 'pressure relief valve testing requirements'"
            className="flex-1 bg-[#0d1321] border border-[#1e2d45] focus:border-blue-500/50 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-colors"
          />
          <Btn onClick={doSearch} disabled={!query.trim()}>Search</Btn>
        </div>
      </div>

      {/* Indexed docs */}
      <div className="mb-7">
        <SectionLabel>Indexed documents — local FAISS index</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {KB_DOCS.map(d => (
            <Card key={d.name} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <Badge variant="neutral">{d.type}</Badge>
                <span className="text-[11px] font-mono text-slate-600">{d.size}</span>
              </div>
              <p className="text-sm text-slate-200 font-medium mb-1 truncate">{d.name}</p>
              <p className="text-xs text-slate-500">{d.chunks} sections · indexed {d.indexed}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="animate-fade-in">
          <div className="flex items-baseline gap-3 mb-4">
            <SectionLabel>Results for "{query}"</SectionLabel>
            <span className="text-[11px] font-mono text-slate-600 mb-3">{results.length} sections found</span>
          </div>
          <div className="space-y-3">
            {results.map((r, i) => {
              const rel = relevanceTier(r.score)
              return (
                <Card key={i} className="p-5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <span className="text-blue-400 text-xs font-mono">{r.doc}</span>
                      <span className="text-slate-600 text-xs mx-1.5">·</span>
                      <span className="text-slate-400 text-xs">{r.section}</span>
                    </div>
                    <span className={`text-[11px] font-mono shrink-0 ${rel.cls}`}>
                      Relevance: {rel.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{r.text}</p>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {!searched && (
        <EmptyState
          title="Search your knowledge"
          body="Type a question or keyword above to find relevant sections from your indexed documents."
        />
      )}
    </main>
  )
}

// ─── Security Center ──────────────────────────────────────────────────────────

function SecurityCenter() {
  const [showTech, setShowTech] = useState(false)

  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in" aria-label="Security and Sovereignty">
      <PageHeader
        title="Security & Sovereignty"
        subtitle="The demonstrated core workflow operates without external AI API calls."
      />

      {/* Sovereignty statement */}
      <div className="bg-emerald-500/[0.04] border border-emerald-500/20 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2.5 mb-2">
          <StatusDot status="ready" label="Sovereignty" />
          <h2 className="font-display text-base font-semibold text-white">Your data stays on this machine</h2>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
          Documents you upload are processed locally. AI inference runs through an embedded engine — no external AI service is contacted.
          Model weights are stored and loaded locally. Knowledge search uses a local vector index.
        </p>
      </div>

      {/* Simple status */}
      <div className="mb-5">
        <SectionLabel>Where things run</SectionLabel>
        <Card className="overflow-hidden">
          {[
            { label: 'AI inference',          value: 'On this machine',   ok: true },
            { label: 'Document reading (OCR)', value: 'On this machine',  ok: true },
            { label: 'Embeddings',            value: 'On this machine',   ok: true },
            { label: 'Knowledge search',      value: 'On this machine',   ok: true },
            { label: 'Code sandbox',          value: 'Isolated process',  ok: true },
            { label: 'External AI services',  value: 'None',              ok: true },
            { label: 'Cloud uploads',         value: 'None',              ok: true },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3 border-b border-[#1e2d45]/50 last:border-0">
              <span className="text-sm text-slate-300">{row.label}</span>
              <div className="flex items-center gap-2.5">
                <StatusDot status={row.ok ? 'ready' : 'unavailable'} label={row.label} />
                <span className="text-xs text-slate-400">{row.value}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Tech details toggle */}
      <button
        onClick={() => setShowTech(!showTech)}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors mb-5"
        aria-expanded={showTech}
      >
        {showTech ? '▲ Hide technical details' : '▼ Show technical details'}
      </button>

      {showTech && (
        <div className="space-y-5 animate-slide-up">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="p-5">
              <SectionLabel>Security controls</SectionLabel>
              <ul className="space-y-2.5" role="list">
                {[
                  'Prompt injection defense — untrusted content separated from system instructions',
                  'Path traversal protection — file ops restricted to workspace directory',
                  'Sandbox: no network, restricted filesystem, CPU + memory limits',
                  'Input size validation — oversized files rejected before processing',
                  'Agent tool allow-list — agent can only call registered tools',
                  'Agent step limits and execution timeout',
                  'Secret scanning on repository before release',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#10b981" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden><polyline points="1.5,5 4,8 8.5,2"/></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5">
              <SectionLabel>Runtime configuration</SectionLabel>
              <dl className="space-y-2.5 font-mono text-xs">
                {[
                  ['Inference engine', 'llama-cpp-python (embedded)'],
                  ['OCR engine',       'Tesseract 5.3 (local subprocess)'],
                  ['Embeddings',       'nomic-embed-text-v1.5 (local)'],
                  ['Vector index',     'FAISS IVF-Flat (local file)'],
                  ['Document gen',     'python-docx / openpyxl / reportlab'],
                  ['Sandbox runtime',  'Restricted Python subprocess'],
                  ['Audit store',      'Local SQLite database'],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-4">
                    <dt className="text-slate-600 w-36 shrink-0">{k}</dt>
                    <dd className="text-slate-300">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      )}

      {/* Known limitations */}
      <Card className="p-5 border-amber-500/20 mt-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#f59e0b" strokeWidth="1.6" aria-hidden><path d="M8 1L1 14h14L8 1z"/><line x1="8" y1="6" x2="8" y2="10"/><circle cx="8" cy="12.5" r="0.7" fill="#f59e0b" stroke="none"/></svg>
          Known limitations
        </h3>
        <ul className="space-y-1.5 text-xs text-slate-400">
          <li>• Tesseract language data files may require a one-time download during initial setup.</li>
          <li>• Model weights must be manually placed in the <span className="font-mono text-blue-400">models/</span> directory before first run.</li>
          <li>• SovereignAI does not guarantee zero OS-level network calls from third-party system libraries.</li>
          <li>• A fully air-gapped deployment requires pre-staging all packages, weights, and system dependencies.</li>
        </ul>
      </Card>
    </main>
  )
}

// ─── Audit Trail ──────────────────────────────────────────────────────────────

function AuditTrail() {
  const provenanceColors: Record<string, string> = {
    USER_PROVIDED:      'text-sky-400    border-sky-400/30    bg-sky-400/5',
    TOOL_GENERATED:     'text-blue-400   border-blue-400/30   bg-blue-400/5',
    RETRIEVED_KNOWLEDGE:'text-purple-400 border-purple-400/30 bg-purple-400/5',
    MODEL_GENERATED:    'text-indigo-400 border-indigo-400/30 bg-indigo-400/5',
    COMPUTED:           'text-emerald-400 border-emerald-400/30 bg-emerald-400/5',
    HUMAN_APPROVED:     'text-amber-400  border-amber-400/30  bg-amber-400/5',
  }

  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in" aria-label="Audit Trail">
      <PageHeader
        title="Audit Trail"
        subtitle="Full traceability for every agent run — model, tools, sources, decisions, and human review."
      />

      <Card className="p-5 mb-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-mono text-slate-500 mb-0.5">RUN-042</p>
            <h3 className="text-sm font-semibold text-white">Inspection Report Analysis</h3>
          </div>
          <Badge variant="warn">Awaiting review</Badge>
        </div>

        <ol className="relative pl-6" aria-label="Audit events timeline">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-[#1e2d45]" aria-hidden />
          {AUDIT_EVENTS.map(e => (
            <li key={e.id} className="relative flex gap-4 pb-4 last:pb-0">
              <div className={`absolute -left-[15px] top-[5px] w-2.5 h-2.5 rounded-full border-2 ${
                e.status === 'ok'   ? 'bg-emerald-500 border-emerald-500' :
                e.status === 'warn' ? 'bg-amber-500 border-amber-500' :
                                      'bg-red-500 border-red-500'
              }`} aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-[11px] text-slate-600 shrink-0">{e.timestamp}</span>
                  <span className="font-mono text-xs text-blue-400/70 shrink-0">{e.component}</span>
                  <span className="text-sm text-slate-300 flex-1">{e.event}</span>
                  {e.duration && e.duration > 0 && (
                    <span className="font-mono text-[11px] text-slate-600 shrink-0 ml-auto">{(e.duration / 1000).toFixed(2)}s</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Provenance chain</h3>
        <p className="text-xs text-slate-500 mb-4">Where each piece of information in the output came from.</p>
        <div className="space-y-2.5">
          {[
            { type: 'USER_PROVIDED',      label: 'Input document',    detail: 'Inspection_Report_2024.pdf — uploaded by operator' },
            { type: 'TOOL_GENERATED',     label: 'Extracted text',    detail: 'Tesseract 5.3 OCR — local process' },
            { type: 'RETRIEVED_KNOWLEDGE', label: 'SOP §3.2',         detail: 'Retrieved from Inspection_SOP.pdf via local FAISS' },
            { type: 'MODEL_GENERATED',    label: 'Findings draft',    detail: 'Phi-3-Vision-Q4 — local inference, no external API' },
            { type: 'COMPUTED',           label: 'Severity scores',   detail: 'Deterministic classification per SOP criteria' },
            { type: 'TOOL_GENERATED',     label: 'Approval_Note.docx', detail: 'Generated by python-docx tool' },
            { type: 'HUMAN_APPROVED',     label: 'Review decision',   detail: 'Awaiting operator approval' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-[#1e2d45]/40 last:border-0">
              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${provenanceColors[item.type] ?? 'text-slate-400 border-slate-400/30'}`}>
                {item.type.replace(/_/g, ' ')}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 mb-0.5">{item.label}</p>
                <p className="text-xs text-slate-500">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </main>
  )
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function Settings() {
  const [mode, setMode] = useState('embedded_local')

  return (
    <main className="flex-1 p-7 overflow-y-auto animate-fade-in max-w-3xl" aria-label="Settings">
      <PageHeader title="Settings" subtitle="Model configuration, inference mode, and workspace paths." />

      <Card className="p-5 mb-5">
        <h3 className="text-sm font-semibold text-white mb-4">Inference mode</h3>
        <fieldset>
          <legend className="sr-only">Select inference mode</legend>
          <div className="space-y-2">
            {[
              {
                id: 'embedded_local',
                label: 'Embedded Local (Recommended)',
                detail: 'Models load directly into the backend process via llama-cpp-python. No separate server required.',
              },
              {
                id: 'local_server',
                label: 'Local Server (Advanced)',
                detail: 'Connect to a separately running local model server (ollama or llama.cpp). Requires manual server management.',
              },
            ].map(opt => (
              <label
                key={opt.id}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  mode === opt.id ? 'border-blue-500/45 bg-blue-500/[0.06]' : 'border-[#1e2d45] hover:border-[#2a3d5a]'
                }`}
              >
                <input
                  type="radio"
                  name="inference-mode"
                  value={opt.id}
                  checked={mode === opt.id}
                  onChange={() => setMode(opt.id)}
                  className="mt-0.5 accent-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{opt.detail}</p>
                </div>
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      <Card className="p-5 mb-5">
        <h3 className="text-sm font-semibold text-white mb-4">Model registry</h3>
        <ul className="space-y-2.5" role="list">
          {[
            { role: 'Reasoning / Vision', name: 'Phi-3-Vision-Q4-K-M',    path: 'models/vision/phi-3-vision-q4_k_m.gguf',         quant: 'Q4_K_M', ram: '4.7 GB', status: 'loaded'     },
            { role: 'Code generation',    name: 'CodeLlama-7B-Q4-K-M',    path: 'models/coding/codellama-7b-q4_k_m.gguf',         quant: 'Q4_K_M', ram: '4.1 GB', status: 'available'  },
            { role: 'General reasoning',  name: 'Mistral-7B-Q4-K-M',      path: 'models/reasoning/mistral-7b-q4_k_m.gguf',        quant: 'Q4_K_M', ram: '4.1 GB', status: 'available'  },
            { role: 'Embeddings',         name: 'nomic-embed-text-v1.5',  path: 'models/embeddings/nomic-embed-text-v1.5.gguf',    quant: 'F16',    ram: '274 MB', status: 'loaded'     },
          ].map(m => (
            <li key={m.name} className="flex items-center gap-3 p-3 rounded-lg bg-[#111827] border border-[#1e2d45]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-medium text-white">{m.name}</span>
                  <span className="font-mono text-[10px] text-slate-600 border border-[#1e2d45] px-1.5 py-0.5 rounded">{m.role}</span>
                </div>
                <p className="text-[11px] font-mono text-slate-500 truncate">{m.path}</p>
              </div>
              <div className="text-right text-[11px] font-mono shrink-0">
                <p className="text-slate-500 mb-1">{m.quant} · {m.ram}</p>
                <Badge variant={m.status === 'loaded' ? 'success' : 'neutral'}>
                  {m.status === 'loaded' ? 'Loaded' : 'Available'}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-600 mt-4">
          Model weights must be placed in the paths above before first use. See{' '}
          <span className="font-mono text-blue-400/80">docs/models.md</span> for setup instructions.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Workspace paths</h3>
        <dl className="space-y-2.5 font-mono text-xs">
          {[
            ['Model directory',    'models/'],
            ['Knowledge base',     'knowledge_base/'],
            ['Generated files',    'generated/'],
            ['Upload workspace',   'workspace/uploads/'],
            ['Sandbox workspace',  'workspace/sandbox/'],
            ['Audit database',     'audit/audit.db'],
          ].map(([label, path]) => (
            <div key={label} className="flex items-center gap-4">
              <dt className="text-slate-500 w-36 shrink-0">{label}</dt>
              <dd className="text-blue-400/80">{path}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </main>
  )
}

// ─── App shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [agentAutoPlay, setAgentAutoPlay] = useState(false)

  function navTo(p: Page) {
    if (p !== 'agent-run') setAgentAutoPlay(false)
    setPage(p)
  }

  function startRun() {
    setAgentAutoPlay(true)
    setPage('agent-run')
  }

  return (
    <div className="flex h-screen bg-[#080c14] text-[#e2e8f4] overflow-hidden">
      <Sidebar current={page} onNav={navTo} />
      <div className="flex flex-1 overflow-hidden">
        {page === 'dashboard'  && <Dashboard  onNav={navTo} />}
        {page === 'new-task'   && <NewTask     onStartRun={startRun} />}
        {page === 'workflows'  && <Workflows   onNav={navTo} />}
        {page === 'agent-run'  && <AgentRun    autoPlay={agentAutoPlay} key={agentAutoPlay ? 'autoplay' : 'manual'} />}
        {page === 'documents'  && <Documents />}
        {page === 'knowledge'  && <KnowledgeBase />}
        {page === 'security'   && <SecurityCenter />}
        {page === 'audit'      && <AuditTrail />}
        {page === 'settings'   && <Settings />}
      </div>
    </div>
  )
}
