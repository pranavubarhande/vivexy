'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_NAME } from '@/constants/project';
import Image from 'next/image';
import {
  X,
  Check,
  Clock,
  Pause,
  Play,
  Zap,
  Server,
  Shield,
  UserCheck,
  AlertTriangle,
  GitBranch,
  Brain,
  Globe,
  Database,
  Layers,
  Lock,
  Bot,
  ChevronRight,
  Search,
  Terminal,
  Monitor,
  Smartphone,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Cpu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export const ADVANCE_MS = 8000;
const TICK_MS = 60;

/* ─── helpers ─────────────────────────────────────────────────────────── */
function useLoop(steps: number, interval = 1800, active = true) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % steps), interval);
    return () => clearInterval(t);
  }, [steps, interval, active]);
  return phase;
}

function DemoShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full flex flex-col bg-background rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
        <span className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
        <span className="ml-2 text-xs text-muted-foreground font-medium">
          {title}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function Bubble({
  role,
  text,
  time,
}: {
  role: 'user' | 'ai';
  text: string;
  time?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 ${role === 'user' ? 'flex-row-reverse' : ''}`}
    >
      <div
        className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold ${
          role === 'ai'
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {role === 'ai' ? <Bot className="w-3 h-3" /> : 'U'}
      </div>
      <div className="max-w-[78%]">
        <div
          className={`text-xs rounded-xl px-3 py-2 leading-relaxed ${
            role === 'ai'
              ? 'bg-card border border-border text-foreground'
              : 'bg-primary text-primary-foreground'
          }`}
        >
          {text}
        </div>
        {time && (
          <p className="text-[9px] text-muted-foreground mt-1 px-1">{time}</p>
        )}
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1 px-3 py-2 bg-card border border-border rounded-xl w-fit">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1, delay: i * 0.25 }}
        />
      ))}
    </div>
  );
}

/* ─── 1. Long Session ─────────────────────────────────────────────────── */
const SESSION_MESSAGES = [
  {
    role: 'user' as const,
    text: 'Review clause 4.2 of the contract',
    time: '2h ago',
  },
  {
    role: 'ai' as const,
    text: 'Clause 4.2 is a 3-year non-compete with broad geographic scope. Flagging as High Risk.',
    time: '2h ago',
  },
  {
    role: 'user' as const,
    text: 'Check if clause 7.1 conflicts',
    time: '1h ago',
  },
  {
    role: 'ai' as const,
    text: 'Yes — clause 7.1 extends jurisdiction globally, amplifying the earlier High Risk flag.',
    time: '1h ago',
  },
  {
    role: 'user' as const,
    text: 'Generate executive summary now',
    time: 'just now',
  },
];

export function LongSessionDemo() {
  const [visible, setVisible] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let i = 0;
    function next() {
      if (i < SESSION_MESSAGES.length) {
        setTyping(true);
        setTimeout(() => {
          setTyping(false);
          setVisible(i + 1);
          i++;
          setTimeout(next, 900);
        }, 800);
      } else {
        setTimeout(() => {
          setVisible(0);
          i = 0;
          setTimeout(next, 600);
        }, 2500);
      }
    }
    const t = setTimeout(next, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <DemoShell title="Contract Review — Session Active">
      <div className="flex flex-col h-full">
        {/* Session bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-border">
          <motion.span
            className="w-2 h-2 rounded-full bg-green-500"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
          <span className="text-xs font-medium text-primary">
            Session active
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" /> 2h 14m
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <AnimatePresence>
            {SESSION_MESSAGES.slice(0, visible).map((m, i) => (
              <Bubble key={i} {...m} />
            ))}
          </AnimatePresence>
          {typing && (
            <div className="flex gap-2 items-center">
              <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Bot className="w-3 h-3 text-primary" />
              </div>
              <TypingDots />
            </div>
          )}
        </div>

        {/* Memory badge */}
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex items-center gap-2">
          <Brain className="w-3 h-3 text-primary" />
          Agent remembers{' '}
          <span className="text-primary font-medium">all 2h 14m</span> of
          context — no loss
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 2. Skills System ────────────────────────────────────────────────── */
const SKILLS = [
  {
    cmd: '/review-contract',
    label: 'Review Contract',
    desc: 'Clause-by-clause legal analysis',
  },
  {
    cmd: '/compliance-check',
    label: 'Compliance Check',
    desc: 'Regulatory gap analysis',
  },
  {
    cmd: '/summarize',
    label: 'Summarise',
    desc: 'Executive summary generation',
  },
];

export function SkillsDemo() {
  const [phase, setPhase] = useState<
    'idle' | 'typing' | 'dropdown' | 'selected' | 'response'
  >('idle');
  const [typed, setTyped] = useState('');
  const selected = SKILLS[0];

  useEffect(() => {
    const seq: [typeof phase, number][] = [
      ['idle', 800],
      ['typing', 900],
      ['dropdown', 1400],
      ['selected', 1200],
      ['response', 2800],
    ];
    let i = 0;
    function step() {
      if (i >= seq.length) {
        i = 0;
        setTyped('');
        setPhase('idle');
        setTimeout(step, 600);
        return;
      }
      const [p, delay] = seq[i++];
      setPhase(p);
      if (p === 'typing') {
        let c = 0;
        const chars = '/review';
        const t = setInterval(() => {
          setTyped(chars.slice(0, ++c));
          if (c >= chars.length) clearInterval(t);
        }, 80);
      }
      setTimeout(step, delay);
    }
    const t = setTimeout(step, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <DemoShell title="Chat — Skills enabled">
      <div className="flex flex-col h-full">
        {/* Context badge */}
        <div className="px-4 py-2 border-b border-border bg-muted/20">
          <AnimatePresence>
            {phase === 'selected' || phase === 'response' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-1 w-fit border border-primary/20"
              >
                <Zap className="w-3 h-3" />
                {selected.cmd} — {selected.desc}
              </motion.div>
            ) : (
              <span className="text-[10px] text-muted-foreground">
                No skill active
              </span>
            )}
          </AnimatePresence>
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 space-y-3">
          {phase === 'response' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Bubble
                role="ai"
                text="Using /review-contract: Analysing clause 4.2 — non-compete, 3-year term, global jurisdiction. Risk level: HIGH."
              />
            </motion.div>
          )}
        </div>

        {/* Input */}
        <div className="relative px-4 pb-4">
          {/* Dropdown */}
          <AnimatePresence>
            {phase === 'dropdown' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-16 left-4 right-4 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-10"
              >
                {SKILLS.map((s, i) => (
                  <div
                    key={s.cmd}
                    className={`flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-muted/50 ${i === 0 ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                  >
                    <Zap
                      className={`w-3 h-3 shrink-0 ${i === 0 ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span
                      className={`font-medium ${i === 0 ? 'text-primary' : ''}`}
                    >
                      {s.cmd}
                    </span>
                    <span className="text-muted-foreground ml-auto">
                      {s.desc}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-card text-xs">
            <span
              className={`flex-1 ${typed ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {typed ||
                (phase === 'selected' || phase === 'response'
                  ? selected.cmd
                  : 'Message or /command…')}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </div>
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 3. MCP Servers ──────────────────────────────────────────────────── */
const MCP_SERVERS = [
  {
    name: 'Web Search',
    tools: ['search_web', 'fetch_url', 'extract'],
    color: 'text-blue-500',
  },
  {
    name: 'Database',
    tools: ['sql_query', 'insert_row', 'update'],
    color: 'text-green-500',
  },
  {
    name: 'Code Runner',
    tools: ['run_python', 'run_shell', 'read_file'],
    color: 'text-purple-500',
  },
  {
    name: 'Calendar',
    tools: ['create_event', 'list_events'],
    color: 'text-orange-500',
  },
];

export function MCPDemo() {
  const [enabled, setEnabled] = useState<number[]>([]);
  const phase = useLoop(4, Math.floor(ADVANCE_MS / 4));

  useEffect(() => {
    const t = setTimeout(() => {
      setEnabled((prev) => {
        const idx = phase % MCP_SERVERS.length;
        if (prev.includes(idx)) return prev.filter((i) => i !== idx);
        return [...prev, idx];
      });
    }, 0);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <DemoShell title="MCP Server Manager">
      <div className="grid grid-cols-2 h-full divide-x divide-border">
        {/* Server list */}
        <div className="p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
            Servers
          </p>
          {MCP_SERVERS.map((s, i) => {
            const on = enabled.includes(i);
            return (
              <motion.div
                key={s.name}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 border transition-colors ${
                  on
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-card'
                }`}
                animate={{
                  borderColor: on ? 'var(--primary)' : 'var(--border)',
                }}
              >
                <div className="flex items-center gap-2">
                  <Server
                    className={`w-3.5 h-3.5 ${on ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <span className="text-xs font-medium">{s.name}</span>
                </div>
                <motion.div animate={{ scale: on ? 1.05 : 1 }}>
                  {on ? (
                    <ToggleRight className="w-5 h-5 text-primary" />
                  ) : (
                    <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                  )}
                </motion.div>
              </motion.div>
            );
          })}
        </div>

        {/* Tools panel */}
        <div className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
            Available Tools (
            {enabled.reduce((acc, i) => acc + MCP_SERVERS[i].tools.length, 0)})
          </p>
          <div className="space-y-1.5">
            <AnimatePresence>
              {enabled.flatMap((i) =>
                MCP_SERVERS[i].tools.map((tool) => (
                  <motion.div
                    key={`${i}-${tool}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-muted/50"
                  >
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${MCP_SERVERS[i].color} bg-current`}
                    />
                    <code className="font-mono">{tool}</code>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
            {enabled.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                Enable a server to see tools…
              </p>
            )}
          </div>
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 4. Sandboxed Execution ──────────────────────────────────────────── */
const SANDBOX_STEPS = [
  {
    code: 'fetch("http://malicious-api.com/data")',
    output: null,
    blocked: '⛔  Network call blocked — sandbox policy',
    label: 'Attempt: External Network',
  },
  {
    code: 'os.remove("/etc/passwd")',
    output: null,
    blocked: '⛔  File system write blocked — read-only mount',
    label: 'Attempt: File System Write',
  },
  {
    code: 'result = sum([1, 2, 3, 4, 5])\nprint(result)',
    output: '15',
    blocked: null,
    label: 'Safe execution',
  },
];

export function SandboxDemo() {
  const phase = useLoop(
    SANDBOX_STEPS.length,
    Math.floor(ADVANCE_MS / SANDBOX_STEPS.length)
  );
  const step = SANDBOX_STEPS[phase];
  const [showOutput, setShowOutput] = useState(false);

  useEffect(() => {
    const t0 = setTimeout(() => setShowOutput(false), 0);
    const t1 = setTimeout(() => setShowOutput(true), 900);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [phase]);

  return (
    <DemoShell title="Sandboxed Execution Environment">
      <div className="flex flex-col h-full p-4 gap-3">
        {/* Constraints bar */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Network: BLOCKED', ok: false },
            { label: 'FS: READ-ONLY', ok: false },
            { label: 'Memory: 256 MB', ok: true },
            { label: 'Timeout: 30s', ok: true },
          ].map((c) => (
            <span
              key={c.label}
              className={`text-[10px] px-2 py-1 rounded-full font-medium border ${
                c.ok
                  ? 'border-green-500/30 bg-green-500/10 text-green-600'
                  : 'border-red-500/30 bg-red-500/10 text-red-500'
              }`}
            >
              {c.label}
            </span>
          ))}
        </div>

        {/* Step label */}
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            <motion.span
              key={step.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`text-[10px] uppercase tracking-widest font-semibold ${
                step.blocked ? 'text-red-500' : 'text-green-600'
              }`}
            >
              {step.label}
            </motion.span>
          </AnimatePresence>
          <Shield
            className={`w-3.5 h-3.5 ${step.blocked ? 'text-red-500' : 'text-green-600'}`}
          />
        </div>

        {/* Code block */}
        <div className="flex-1 bg-foreground/5 rounded-lg p-4 font-mono text-xs border border-border overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="text-muted-foreground">
                <span className="text-primary/70 mr-2">$</span>
                <span className="whitespace-pre">{step.code}</span>
              </div>

              {showOutput && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {step.blocked ? (
                    <div className="text-red-500 bg-red-500/10 rounded px-3 py-2 border border-red-500/20">
                      {step.blocked}
                    </div>
                  ) : (
                    <div className="text-green-600 bg-green-500/10 rounded px-3 py-2 border border-green-500/20">
                      ✓ Output: {step.output}
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 5. Human-in-the-Loop ────────────────────────────────────────────── */
const HITL_STEPS = [
  { label: 'Document parsed', done: true },
  { label: 'Risks extracted', done: true },
  { label: 'Human review', done: false, isGate: true },
  { label: 'Report drafted', done: false },
  { label: 'Delivered', done: false },
];

export function HITLDemo() {
  const [approved, setApproved] = useState(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
    };

    function cycle() {
      t(() => {
        setApproved(false);
        setPhase(0);
      }, 0);
      t(() => setPhase(1), 600);
      t(() => setPhase(2), 1400);
      t(() => setApproved(true), 5000); // auto-approve
      t(cycle, ADVANCE_MS); // restart after full cycle
    }

    cycle();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <DemoShell title="Workflow — Human Checkpoints">
      <div className="flex flex-col h-full p-4 gap-4">
        {/* Pipeline */}
        <div className="flex items-center gap-1">
          {HITL_STEPS.map((s, i) => {
            const isDone =
              i < 2 || (s.done && approved) || (i >= 3 && approved);
            const isGate = s.isGate;
            const isActive = i === 2 && !approved && phase >= 2;

            return (
              <div key={s.label} className="flex items-center gap-1 flex-1">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <motion.div
                    animate={{
                      scale: isActive ? [1, 1.1, 1] : 1,
                    }}
                    transition={{
                      repeat: isActive ? Infinity : 0,
                      duration: 1.5,
                    }}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                      isDone
                        ? 'border-green-500 bg-green-500/10'
                        : isActive
                          ? 'border-amber-500 bg-amber-500/10'
                          : isGate && approved
                            ? 'border-green-500 bg-green-500/10'
                            : 'border-border bg-muted/30'
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : isActive ? (
                      <UserCheck className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <span className="text-[9px] text-muted-foreground">
                        {i + 1}
                      </span>
                    )}
                  </motion.div>
                  <span className="text-[9px] text-center text-muted-foreground leading-tight max-w-[56px]">
                    {s.label}
                  </span>
                </div>
                {i < HITL_STEPS.length - 1 && (
                  <div
                    className={`h-px w-4 shrink-0 mb-4 ${isDone ? 'bg-green-500/50' : 'bg-border'}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Approval card */}
        <AnimatePresence>
          {phase >= 2 && !approved && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-2 h-2 rounded-full bg-amber-500"
                />
                <span className="text-xs font-semibold text-amber-600">
                  Awaiting your approval
                </span>
              </div>
              <div className="text-xs text-muted-foreground bg-background border border-border rounded-lg p-3">
                <p className="font-medium text-foreground mb-1">
                  Agent wants to draft a report with:
                </p>
                <ul className="space-y-1 list-none">
                  <li>• 3 high-risk clauses identified</li>
                  <li>• Recommended action: renegotiate §4.2</li>
                  <li>• Estimated resolution: 2–3 days</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => setApproved(true)}
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs"
                >
                  Reject
                </Button>
              </div>
            </motion.div>
          )}
          {approved && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-3"
            >
              <Check className="w-5 h-5 text-green-500 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-green-600">
                  Approved — workflow continuing
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Report is being drafted…
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoShell>
  );
}

/* ─── 6. Guardrails ───────────────────────────────────────────────────── */
const GUARDRAIL_TEXT =
  'Based on our analysis, we recommend reaching out to John Smith at john.smith@lawfirm.com (+1-555-0192) regarding the liability clause. His SSN 123-45-6789 was referenced in the exhibit.';

export function GuardrailsDemo() {
  const [phase, setPhase] = useState<'streaming' | 'scanning' | 'redacted'>(
    'streaming'
  );
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    function run() {
      setPhase('streaming');
      setCharCount(0);
      let c = 0;
      const interval = setInterval(() => {
        c++;
        setCharCount(c);
        if (c >= GUARDRAIL_TEXT.length) {
          clearInterval(interval);
          timeout = setTimeout(() => {
            setPhase('scanning');
            timeout = setTimeout(() => {
              setPhase('redacted');
              timeout = setTimeout(run, 3000);
            }, 1200);
          }, 600);
        }
      }, 18);
      return interval;
    }
    const interval = run();
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  const REDACTED = GUARDRAIL_TEXT.replace('John Smith', 'J*** S****')
    .replace('john.smith@lawfirm.com', 'j***@l*****.com')
    .replace('+1-555-0192', '***-***-****')
    .replace('123-45-6789', '***-**-****');

  return (
    <DemoShell title="Guardrail Engine">
      <div className="flex flex-col h-full p-4 gap-3">
        {/* Policy indicators */}
        <div className="flex gap-2 flex-wrap">
          {[
            'PII Detection',
            'Email Masking',
            'Phone Masking',
            'SSN Masking',
          ].map((p) => (
            <span
              key={p}
              className="text-[10px] px-2 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary font-medium"
            >
              {p}
            </span>
          ))}
        </div>

        {/* Output area */}
        <div className="flex-1 relative rounded-lg border border-border bg-card p-3 overflow-hidden">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            Agent output
          </p>

          {phase === 'streaming' && (
            <p className="text-xs leading-relaxed text-foreground">
              {GUARDRAIL_TEXT.slice(0, charCount)}
              <motion.span
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="inline-block w-0.5 h-3 bg-primary ml-px align-middle"
              />
            </p>
          )}

          {phase === 'scanning' && (
            <div className="relative">
              <p className="text-xs leading-relaxed text-foreground">
                {GUARDRAIL_TEXT}
              </p>
              <motion.div
                initial={{ top: 0 }}
                animate={{ top: '100%' }}
                transition={{ duration: 1.2, ease: 'linear' }}
                className="absolute inset-x-0 h-0.5 bg-primary/40 pointer-events-none"
                style={{ top: 0 }}
              />
              <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
            </div>
          )}

          {phase === 'redacted' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <p className="text-xs leading-relaxed">
                {REDACTED.split(
                  /(J\*\*\*|S\*\*\*\*|j\*\*\*@l\*\*\*\*\*\.com|\*\*\*-\*\*\*-\*\*\*\*|\*\*\*-\*\*-\*\*\*\*)/g
                ).map((part, i) =>
                  part.includes('*') ? (
                    <span
                      key={i}
                      className="bg-red-500/15 text-red-500 rounded px-0.5 font-mono"
                    >
                      {part}
                    </span>
                  ) : (
                    <span key={i}>{part}</span>
                  )
                )}
              </p>
            </motion.div>
          )}
        </div>

        {/* Status */}
        <AnimatePresence mode="wait">
          {phase === 'redacted' && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-xs text-green-600 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2"
            >
              <Shield className="w-3.5 h-3.5 shrink-0" />4 sensitive items
              protected — safe to deliver
            </motion.div>
          )}
          {phase === 'scanning' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
              Scanning for policy violations…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DemoShell>
  );
}

/* ─── 7. Sub-Agent Orchestration ──────────────────────────────────────── */
const SUB_AGENTS = [
  {
    label: 'Research Agent',
    icon: Search,
    desc: 'Pulls case law & precedents',
  },
  { label: 'Draft Agent', icon: Bot, desc: 'Writes initial report' },
  { label: 'Review Agent', icon: Shield, desc: 'Validates accuracy' },
];

export function SubAgentDemo() {
  const phase = useLoop(
    SUB_AGENTS.length + 2,
    Math.floor(ADVANCE_MS / (SUB_AGENTS.length + 2))
  );

  return (
    <DemoShell title="Agent Orchestrator">
      <div className="flex flex-col h-full p-5 gap-3">
        {/* Graph: orchestrator + lines + agents in one positioned container */}
        <div className="relative flex-1" style={{ minHeight: 160 }}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
            {SUB_AGENTS.map((_, i) => {
              const x = i === 0 ? '16%' : i === 1 ? '50%' : '84%';
              return (
                <motion.line
                  key={i}
                  x1="50%"
                  y1="18%"
                  x2={x}
                  y2="72%"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  className={`transition-colors duration-300 ${phase > i ? 'text-primary/70' : 'text-border'}`}
                />
              );
            })}
          </svg>

          {/* Orchestrator — top centre */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2">
            <motion.div
              animate={{
                boxShadow:
                  phase > 0
                    ? '0 0 0 3px var(--primary)'
                    : '0 0 0 0px transparent',
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-primary bg-primary/10 text-xs font-semibold text-primary whitespace-nowrap"
            >
              <GitBranch className="w-3.5 h-3.5" /> Orchestrator
            </motion.div>
          </div>

          {/* Sub-agents — bottom row */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2">
            {SUB_AGENTS.map((a, i) => {
              const Icon = a.icon;
              const active = phase > i;
              const done = phase > i + 1;
              return (
                <motion.div
                  key={a.label}
                  animate={{ opacity: active ? 1 : 0.35, y: active ? 0 : 6 }}
                  className="flex flex-col items-center gap-1 w-20"
                >
                  <div
                    className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center transition-colors ${
                      done
                        ? 'border-green-500 bg-green-500/10'
                        : active
                          ? 'border-primary bg-primary/10'
                          : 'border-border bg-muted/30'
                    }`}
                  >
                    {done ? (
                      <Check className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <Icon
                        className={`w-3.5 h-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                      />
                    )}
                  </div>
                  <p className="text-[9px] font-medium text-center leading-tight">
                    {a.label}
                  </p>
                  <AnimatePresence>
                    {active && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                          done
                            ? 'bg-green-500/10 text-green-600'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {done ? '✓ Done' : '⟳ Working'}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Result */}
        <div className="h-9">
          <AnimatePresence>
            {phase >= SUB_AGENTS.length + 1 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="w-full rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-600 flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                All agents complete — compiling final output…
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 8. Memory Management ────────────────────────────────────────────── */
const MEMORIES = [
  {
    date: '3 days ago',
    text: 'Client prefers conservative risk thresholds',
    score: 0,
  },
  {
    date: '1 day ago',
    text: 'Jurisdiction: New York state law applies',
    score: 0,
  },
  {
    date: '6h ago',
    text: 'Clause 4.2 flagged as high-risk (non-compete)',
    score: 0,
  },
  { date: '2h ago', text: 'Client approved renegotiation approach', score: 0 },
];

export function MemoryDemo() {
  const [phase, setPhase] = useState<
    'idle' | 'query' | 'searching' | 'found' | 'response'
  >('idle');
  const [scores, setScores] = useState([0, 0, 0, 0]);

  useEffect(() => {
    const seq: [typeof phase, number][] = [
      ['idle', 800],
      ['query', 1200],
      ['searching', 1000],
      ['found', 1200],
      ['response', 3000],
    ];
    let i = 0;
    function step() {
      if (i >= seq.length) {
        i = 0;
        setScores([0, 0, 0, 0]);
        setPhase('idle');
        setTimeout(step, 600);
        return;
      }
      const [p, delay] = seq[i++];
      setPhase(p);
      if (p === 'found') setScores([20, 85, 100, 60]);
      setTimeout(step, delay);
    }
    const t = setTimeout(step, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <DemoShell title="Memory Store">
      <div className="grid grid-cols-2 h-full divide-x divide-border">
        {/* Memory entries */}
        <div className="p-3 space-y-2 overflow-auto">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
            {MEMORIES.length} memories stored
          </p>
          {MEMORIES.map((m, i) => (
            <motion.div
              key={i}
              animate={{
                borderColor:
                  scores[i] > 70
                    ? 'oklch(0.43 0.08 118 / 0.6)'
                    : scores[i] > 30
                      ? 'oklch(0.43 0.08 118 / 0.3)'
                      : 'var(--border)',
                backgroundColor:
                  scores[i] > 70
                    ? 'oklch(0.43 0.08 118 / 0.06)'
                    : 'transparent',
              }}
              className="rounded-lg border p-2.5 transition-colors"
            >
              <p className="text-[9px] text-muted-foreground mb-1">{m.date}</p>
              <p className="text-[11px] leading-snug">{m.text}</p>
              {scores[i] > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${scores[i]}%` }}
                  className="h-0.5 bg-primary/60 rounded-full mt-2"
                  transition={{ duration: 0.5 }}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Chat side */}
        <div className="flex flex-col p-3 gap-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Chat
          </p>
          <div className="flex-1 space-y-2">
            <AnimatePresence>
              {phase !== 'idle' && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Bubble
                    role="user"
                    text="What risk profile should I use for the summary?"
                  />
                </motion.div>
              )}
              {phase === 'searching' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 text-[10px] text-primary"
                >
                  <Search className="w-3 h-3 animate-pulse" /> Searching
                  memories…
                </motion.div>
              )}
              {phase === 'response' && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Bubble
                    role="ai"
                    text="Based on your preferences [3d ago] and the high-risk flag on clause 4.2 [6h ago] — use conservative thresholds under NY law."
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {phase === 'response' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[9px] text-primary/70 flex items-center gap-1"
            >
              <Brain className="w-3 h-3" /> 2 memories referenced
            </motion.div>
          )}
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 9. Multi-Platform ───────────────────────────────────────────────── */
type PlatformKey = 'web' | 'desktop' | 'mobile' | 'terminal';
const PLATFORMS: { id: PlatformKey; label: string; icon: typeof Monitor }[] = [
  { id: 'web', label: 'Browser', icon: Globe },
  { id: 'desktop', label: 'Desktop', icon: Monitor },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
];

function MiniChat({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col h-full bg-background">
      <div
        className={`flex items-center gap-1.5 border-b border-border bg-muted/30 ${compact ? 'px-2 py-1' : 'px-3 py-2'}`}
      >
        <Image
          src="/logo.png"
          alt={APP_NAME}
          width={16}
          height={16}
          className="rounded-sm object-contain"
        />
        <span
          className={`font-semibold text-foreground ${compact ? 'text-[8px]' : 'text-[10px]'}`}
        >
          {APP_NAME}
        </span>
      </div>
      <div
        className={`flex-1 ${compact ? 'p-1.5 space-y-1' : 'p-2.5 space-y-1.5'}`}
      >
        {[
          { r: 'ai', t: 'Hello! How can I help?' },
          { r: 'user', t: 'Review this clause' },
        ].map((m, i) => (
          <div
            key={i}
            className={`flex ${m.r === 'user' ? 'justify-end' : ''}`}
          >
            <div
              className={`rounded-lg ${compact ? 'px-1.5 py-0.5 text-[7px]' : 'px-2 py-1 text-[9px]'} ${
                m.r === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border'
              }`}
            >
              {m.t}
            </div>
          </div>
        ))}
      </div>
      <div
        className={`border-t border-border bg-card ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'}`}
      >
        <div className="border border-border rounded bg-background h-3" />
      </div>
    </div>
  );
}

export function MultiPlatformDemo() {
  const phase = useLoop(
    PLATFORMS.length,
    Math.floor(ADVANCE_MS / PLATFORMS.length)
  );
  const active = PLATFORMS[phase].id;

  return (
    <DemoShell title="Multi-Platform Delivery">
      <div className="flex flex-col h-full p-4 gap-4">
        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
          {PLATFORMS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => {}}
                className={`flex items-center gap-1.5 flex-1 justify-center rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  active === p.id
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Device frame */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {active === 'web' && (
              <motion.div
                key="web"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="w-full max-w-sm"
              >
                {/* Browser frame */}
                <div className="rounded-lg border-2 border-border shadow-md overflow-hidden">
                  <div className="bg-muted/50 px-3 py-2 flex items-center gap-2 border-b border-border">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <div className="w-2 h-2 rounded-full bg-yellow-400" />
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 bg-background rounded text-[9px] text-muted-foreground px-2 py-0.5">
                      app.agentis.io/chat
                    </div>
                  </div>
                  <div className="h-40">
                    <MiniChat />
                  </div>
                </div>
              </motion.div>
            )}
            {active === 'desktop' && (
              <motion.div
                key="desktop"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="w-full max-w-sm"
              >
                {/* Desktop window */}
                <div className="rounded-xl border-2 border-border shadow-lg overflow-hidden">
                  <div className="bg-muted/70 px-3 py-2 flex items-center gap-2 border-b border-border">
                    <div className="flex gap-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    </div>
                    <span className="text-[9px] text-muted-foreground mx-auto">
                      {APP_NAME}
                    </span>
                  </div>
                  <div className="flex h-40">
                    <div className="w-10 bg-sidebar border-r border-border shrink-0 flex flex-col items-center gap-2 py-2">
                      <div className="w-5 h-5 rounded-sm bg-primary/20" />
                      <div className="w-5 h-5 rounded-sm bg-muted" />
                      <div className="w-5 h-5 rounded-sm bg-muted" />
                    </div>
                    <div className="flex-1">
                      <MiniChat compact />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
            {active === 'mobile' && (
              <motion.div
                key="mobile"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="flex justify-center"
              >
                {/* Phone frame */}
                <div className="w-36 rounded-3xl border-4 border-border shadow-lg overflow-hidden bg-background">
                  <div className="bg-muted/50 py-2 flex justify-center border-b border-border">
                    <div className="w-10 h-1.5 rounded-full bg-border" />
                  </div>
                  <div className="h-48">
                    <MiniChat compact />
                  </div>
                  <div className="bg-muted/30 py-2 flex justify-center border-t border-border">
                    <div className="w-6 h-6 rounded-full border border-border" />
                  </div>
                </div>
              </motion.div>
            )}
            {active === 'terminal' && (
              <motion.div
                key="terminal"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="w-full max-w-sm"
              >
                {/* Terminal frame */}
                <div className="rounded-lg border-2 border-border shadow-md overflow-hidden bg-[#0d1117] font-mono">
                  <div className="bg-[#161b22] px-3 py-2 flex items-center gap-2 border-b border-white/10">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500/70" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/70" />
                      <div className="w-2 h-2 rounded-full bg-green-500/70" />
                    </div>
                    <span className="text-[9px] text-white/40 mx-auto">
                      agentis — bash
                    </span>
                  </div>
                  <div className="p-3 space-y-1.5 h-40 text-[9px] leading-relaxed">
                    <p className="text-white/40">
                      $ agentis chat --model claude
                    </p>
                    <p className="text-green-400">
                      ✓ Connected to Claude 3.5 Sonnet
                    </p>
                    <p className="text-white/40">
                      You: Summarise last quarter&apos;s filings
                    </p>
                    <p className="text-blue-400">
                      Agent: Analysing 14 documents…
                    </p>
                    <p className="text-white/60 pl-2">▸ Revenue up 12% YoY</p>
                    <p className="text-white/60 pl-2">
                      ▸ 3 compliance flags detected
                    </p>
                    <p className="text-white/40 flex items-center gap-1">
                      ${' '}
                      <span className="w-1.5 h-3 bg-white/60 animate-pulse inline-block" />
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="text-center text-[10px] text-muted-foreground">
          <span className="text-primary font-semibold">1 codebase</span> → Web ·
          macOS · Windows · Linux · iOS · Android · Terminal
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 10. Scale Demo ──────────────────────────────────────────────────── */
const TIERS = [
  {
    label: 'Starter',
    cost: '$5 / mo',
    nodes: [{ name: 'VPS', sub: '1 server' }],
    rps: '~100 req/s',
    color: 'text-muted-foreground',
  },
  {
    label: 'Growth',
    cost: '$80 / mo',
    nodes: [
      { name: 'Primary DB', sub: 'Postgres' },
      { name: 'Read Replica', sub: 'Replica ×1' },
    ],
    rps: '~2K req/s',
    color: 'text-primary',
  },
  {
    label: 'Enterprise',
    cost: 'Custom',
    nodes: [
      { name: 'Load Balancer', sub: 'HA' },
      { name: 'Primary DB', sub: 'Postgres' },
      { name: 'Replica ×3', sub: 'Read-scaled' },
    ],
    rps: '100K+ req/s',
    color: 'text-green-600',
  },
];

export function ScaleDemo() {
  const phase = useLoop(TIERS.length, Math.floor(ADVANCE_MS / TIERS.length));
  const tier = TIERS[phase];

  return (
    <DemoShell title="Deployment Architecture">
      <div className="flex flex-col h-full p-4 gap-4">
        {/* Tier tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
          {TIERS.map((t, i) => (
            <div
              key={t.label}
              className={`flex-1 text-center text-xs py-1.5 rounded-md transition-colors ${
                phase === i
                  ? 'bg-background shadow-sm font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {t.label}
            </div>
          ))}
        </div>

        {/* Architecture diagram */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col items-center gap-3 w-full"
            >
              {/* App servers */}
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-primary/40 bg-primary/5 text-xs font-medium text-primary">
                <Globe className="w-3.5 h-3.5" /> Application Servers
              </div>
              <div className="w-px h-4 bg-border" />

              {/* DB nodes */}
              <div className="flex gap-3 flex-wrap justify-center">
                {tier.nodes.map((n, i) => (
                  <motion.div
                    key={n.name}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-border bg-card text-center"
                  >
                    <Database className="w-4 h-4 text-primary" />
                    <p className="text-[10px] font-medium">{n.name}</p>
                    <p className="text-[9px] text-muted-foreground">{n.sub}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Throughput', value: tier.rps },
            { label: 'Cost', value: tier.cost },
            {
              label: 'Uptime SLA',
              value: phase === 2 ? '99.99%' : phase === 1 ? '99.9%' : '99%',
            },
          ].map((s) => (
            <AnimatePresence key={s.label} mode="wait">
              <motion.div
                key={`${phase}-${s.label}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-border bg-card p-2 text-center"
              >
                <p className={`text-sm font-semibold ${tier.color}`}>
                  {s.value}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {s.label}
                </p>
              </motion.div>
            </AnimatePresence>
          ))}
        </div>
      </div>
    </DemoShell>
  );
}

/* ─── 11. Plug-and-Play ───────────────────────────────────────────────── */
const SLOT_OPTIONS = {
  model: ['Claude 3.5', 'GPT-4o', 'Gemini 1.5', 'Ollama (local)', 'Mistral'],
  memory: ['In-memory', 'Postgres', 'Pinecone', 'Weaviate'],
  tools: ['Web Search', 'Code Runner', 'SQL DB', 'Calendar'],
  deploy: ['Local VPS', 'AWS ECS', 'GCP Run', 'Terraform'],
};

export function PlugPlayDemo() {
  const [absPhase, setAbsPhase] = useState(-1);
  useEffect(() => {
    const id = setInterval(
      () => setAbsPhase((p) => p + 1),
      Math.floor(ADVANCE_MS / 4)
    );
    return () => clearInterval(id);
  }, []);

  const keys = Object.keys(SLOT_OPTIONS) as (keyof typeof SLOT_OPTIONS)[];
  const slots = Object.fromEntries(
    keys.map((k, ki) => {
      const times =
        absPhase >= ki ? Math.floor((absPhase - ki) / keys.length) + 1 : 0;
      return [k, times % SLOT_OPTIONS[k].length];
    })
  ) as Record<keyof typeof SLOT_OPTIONS, number>;

  return (
    <DemoShell title="Plug-and-Play Architecture">
      <div className="flex flex-col h-full p-5 gap-5">
        {/* Central agent */}
        <div className="flex justify-center">
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-primary bg-primary/10 font-semibold text-primary"
          >
            <Cpu className="w-5 h-5" />
            Agent Core
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-2 h-2 rounded-full bg-green-500 ml-1"
            />
          </motion.div>
        </div>

        {/* Slots */}
        <div className="grid grid-cols-2 gap-3">
          {(
            Object.entries(SLOT_OPTIONS) as [
              keyof typeof SLOT_OPTIONS,
              string[],
            ][]
          ).map(([key, opts]) => (
            <div
              key={key}
              className="rounded-lg border border-border bg-card p-3"
            >
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                {key}
              </p>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${key}-${slots[key]}`}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3 text-primary shrink-0" />
                  {opts[slots[key]]}
                </motion.div>
              </AnimatePresence>
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-muted-foreground">
          Swap any provider — agent logic stays the same
        </p>
      </div>
    </DemoShell>
  );
}

/* ─── 12. Multiple Themes ─────────────────────────────────────────────── */
const THEME_SWATCHES = [
  {
    label: 'Skin',
    bg: '#FFFCEB',
    primary: '#5E6738',
    sidebar: '#F5F0D8',
    text: '#1A1A0E',
  },
  {
    label: 'Dark',
    bg: '#1E2212',
    primary: '#8FA05A',
    sidebar: '#161A0D',
    text: '#EDEBD4',
  },
  {
    label: 'Ocean',
    bg: '#F0F7FF',
    primary: '#1A6BAD',
    sidebar: '#E5EFF8',
    text: '#0A1628',
  },
  {
    label: 'Midnight',
    bg: '#0D0E1A',
    primary: '#8B78F0',
    sidebar: '#0A0B14',
    text: '#E8E5F5',
  },
  {
    label: 'Stone',
    bg: '#F7F5F0',
    primary: '#4A4540',
    sidebar: '#EDEAE3',
    text: '#1A1714',
  },
];

export function ThemesDemo() {
  const phase = useLoop(
    THEME_SWATCHES.length,
    Math.floor(ADVANCE_MS / THEME_SWATCHES.length)
  );
  const t = THEME_SWATCHES[phase];

  return (
    <DemoShell title="Theme Engine">
      <div className="flex flex-col h-full p-4 gap-4">
        {/* Mini app preview */}
        <div className="flex-1 rounded-xl overflow-hidden border border-border shadow-sm">
          <motion.div
            animate={{ backgroundColor: t.bg }}
            transition={{ duration: 0.5 }}
            className="flex h-full"
          >
            {/* Sidebar */}
            <motion.div
              animate={{ backgroundColor: t.sidebar }}
              transition={{ duration: 0.5 }}
              className="w-14 border-r flex flex-col items-center py-3 gap-3"
              style={{ borderColor: `${t.primary}25` }}
            >
              <motion.div
                animate={{ backgroundColor: t.primary }}
                transition={{ duration: 0.5 }}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
              >
                <Bot className="w-4 h-4 text-white" />
              </motion.div>
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={{ backgroundColor: `${t.primary}20` }}
                  transition={{ duration: 0.5 }}
                  className="w-7 h-7 rounded-md"
                />
              ))}
            </motion.div>

            {/* Main area */}
            <div className="flex-1 flex flex-col">
              {/* Nav */}
              <motion.div
                animate={{
                  backgroundColor: t.bg,
                  borderColor: `${t.primary}25`,
                }}
                transition={{ duration: 0.5 }}
                className="h-8 border-b flex items-center px-3 gap-2"
              >
                {['Chat', 'Files', 'Tools'].map((n) => (
                  <motion.span
                    key={n}
                    animate={{
                      color: n === 'Chat' ? t.primary : `${t.text}60`,
                    }}
                    transition={{ duration: 0.5 }}
                    className="text-[9px] font-medium"
                  >
                    {n}
                  </motion.span>
                ))}
              </motion.div>

              {/* Chat bubbles */}
              <div className="flex-1 p-3 space-y-2">
                {[
                  { user: false, text: 'Ready to assist' },
                  { user: true, text: 'Review clause 4' },
                  { user: false, text: 'Clause 4 flagged' },
                ].map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.user ? 'justify-end' : ''}`}
                  >
                    <motion.div
                      animate={{
                        backgroundColor: m.user ? t.primary : `${t.primary}15`,
                        color: m.user ? '#fff' : t.text,
                      }}
                      transition={{ duration: 0.5 }}
                      className="text-[8px] px-2 py-1 rounded-lg max-w-[70%]"
                    >
                      {m.text}
                    </motion.div>
                  </div>
                ))}
              </div>

              {/* Input */}
              <motion.div
                animate={{ borderColor: `${t.primary}30` }}
                transition={{ duration: 0.5 }}
                className="h-7 border-t mx-3 mb-2 flex items-center"
              >
                <motion.div
                  animate={{ borderColor: `${t.primary}40` }}
                  transition={{ duration: 0.5 }}
                  className="flex-1 h-4 rounded border text-[8px] flex items-center px-2"
                  style={{ color: `${t.text}50` }}
                >
                  Message…
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* Swatches */}
        <div className="flex justify-center gap-2">
          {THEME_SWATCHES.map((s, i) => (
            <button
              key={s.label}
              onClick={() => {}}
              title={s.label}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                phase === i
                  ? 'scale-125 border-foreground'
                  : 'border-border hover:border-muted-foreground'
              }`}
              style={{ backgroundColor: s.primary }}
            />
          ))}
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
          {t.label} theme — full white-label support
        </p>
      </div>
    </DemoShell>
  );
}

/* ─── Feature list (shared data) ─────────────────────────────────────── */
export const TEMPLATE_FEATURES: {
  icon: React.ElementType;
  title: string;
  description: string;
}[] = [
  {
    icon: Clock,
    title: 'Long-Session Agents',
    description:
      'Agents that persist state across hours-long tasks — no context loss, no restarts.',
  },
  {
    icon: Zap,
    title: 'Skills System',
    description:
      'Reusable /commands that inject custom instructions — build once, share across your team.',
  },
  {
    icon: Server,
    title: 'MCP Servers',
    description:
      'Plug any external tool or data source into your agents via Model Context Protocol.',
  },
  {
    icon: Shield,
    title: 'Sandboxed Execution',
    description:
      'Isolated environments for code and tool execution — safe by design, always.',
  },
  {
    icon: UserCheck,
    title: 'Human-in-the-Loop',
    description:
      'Approval gates and review checkpoints built into every workflow, not bolted on later.',
  },
  {
    icon: Lock,
    title: 'Guardrails',
    description:
      'Content policies, output validation, and safety layers that protect your clients.',
  },
  {
    icon: GitBranch,
    title: 'Sub-Agent Orchestration',
    description:
      'Coordinate multiple specialized agents for complex, multi-step workflows.',
  },
  {
    icon: Brain,
    title: 'Memory Management',
    description:
      'Persistent, searchable agent memory — agents that genuinely learn over time.',
  },
  {
    icon: Globe,
    title: 'Web + Desktop + Mobile',
    description:
      'One codebase delivers to browser, Windows, macOS, Linux, iOS, Android, and terminal.',
  },
  {
    icon: Database,
    title: '$5 VPS → Enterprise Scale',
    description:
      'Deploy on a $5 VPS or scale to Terraform-managed read replicas — the same architecture OpenAI uses.',
  },
  {
    icon: Layers,
    title: 'Plug-and-Play Architecture',
    description:
      'Swap models, tools, and providers without touching core agent logic.',
  },
  {
    icon: Cpu,
    title: 'Multiple Themes',
    description:
      "White-label with your client's brand — full theming support out of the box.",
  },
];

/* ─── Demo router ─────────────────────────────────────────────────────── */
const DEMO_MAP: Record<string, () => React.ReactElement> = {
  'Long-Session Agents': LongSessionDemo,
  'Skills System': SkillsDemo,
  'MCP Servers': MCPDemo,
  'Sandboxed Execution': SandboxDemo,
  'Human-in-the-Loop': HITLDemo,
  Guardrails: GuardrailsDemo,
  'Sub-Agent Orchestration': SubAgentDemo,
  'Memory Management': MemoryDemo,
  'Web + Desktop + Mobile': MultiPlatformDemo,
  '$5 VPS → Enterprise Scale': ScaleDemo,
  'Plug-and-Play Architecture': PlugPlayDemo,
  'Multiple Themes': ThemesDemo,
};

/* ─── TemplateShowcase ────────────────────────────────────────────────── */

export function TemplateShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [timerKey, setTimerKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* Auto-advance + progress ticker — skips ticks while paused */
  useEffect(() => {
    let p = progress;
    const id = setInterval(() => {
      if (paused) return;
      p += (TICK_MS / ADVANCE_MS) * 100;
      setProgress(Math.min(p, 100));
      if (p >= 100) {
        p = 0;
        setActiveIdx((prev) => (prev + 1) % TEMPLATE_FEATURES.length);
      }
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKey, paused]);

  /* Scroll active card into centre of strip */
  useEffect(() => {
    const strip = stripRef.current;
    const card = cardRefs.current[activeIdx];
    if (!strip || !card) return;
    strip.scrollTo({
      left: card.offsetLeft - strip.offsetWidth / 2 + card.offsetWidth / 2,
      behavior: 'smooth',
    });
  }, [activeIdx]);

  const handleSelect = (idx: number) => {
    setActiveIdx(idx);
    setProgress(0);
    setTimerKey((k) => k + 1);
    setPaused(false);
  };

  const togglePause = () => setPaused((p) => !p);

  const active = TEMPLATE_FEATURES[activeIdx];
  const ActiveIcon = active.icon;
  const DemoComp = DEMO_MAP[active.title];

  return (
    <div className="space-y-5">
      {/* Active feature info + play/pause */}
      <div className="flex items-start justify-between gap-4 min-h-[52px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIdx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <ActiveIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-medium text-base">{active.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {active.description}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Play / Pause button */}
        <button
          onClick={togglePause}
          title={paused ? 'Resume auto-advance' : 'Pause auto-advance'}
          className="shrink-0 mt-0.5 w-8 h-8 rounded-lg border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          {paused ? (
            <Play className="w-3.5 h-3.5" />
          ) : (
            <Pause className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Demo viewport */}
      <div className="h-[500px] rounded-xl border border-border overflow-hidden bg-muted/10 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIdx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0"
          >
            {DemoComp && <DemoComp />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Feature strip */}
      <div
        ref={stripRef}
        className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1"
      >
        {TEMPLATE_FEATURES.map((f, i) => {
          const Icon = f.icon;
          const isActive = i === activeIdx;
          return (
            <button
              key={f.title}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              onClick={() => handleSelect(i)}
              className={`relative flex-none flex flex-col items-start gap-1.5 w-[112px] rounded-xl border p-3 text-left transition-all duration-200 overflow-hidden ${
                isActive
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span
                className={`text-[10px] font-medium leading-snug ${
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {f.title}
              </span>

              {/* Progress bar */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-border">
                  <div
                    className="h-full bg-primary transition-none"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
