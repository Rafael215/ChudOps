import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Download, ServerCog } from "lucide-react";

interface ChaosOverlayProps {
  state: "idle" | "running" | "complete";
  onComplete: () => void;
}

const logLines = [
  "FIS experiment started: exp-seismic-001",
  "Throttling Lambda concurrency us-west-2",
  "DynamoDB latency injection: +800ms",
  "Health check FAILED: primary region",
  "Route 53 ARC: initiating failover...",
  "Traffic shifted to us-east-1",
  "Dashboard operational - secondary region",
  "Recovery time: 72s ✓ TARGET MET"
];

const timestampFor = (offsetSeconds: number) => {
  const date = new Date(Date.now() + offsetSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
};

export function ChaosOverlay({ state, onComplete }: ChaosOverlayProps) {
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [baseTimestamp] = useState(Date.now());

  const stampedLines = useMemo(
    () =>
      logLines.map((line, index) => {
        const stamp = new Date(baseTimestamp + index * 3000);
        const time = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).format(stamp);
        return `[${time}] ${line}`;
      }),
    [baseTimestamp]
  );

  useEffect(() => {
    if (state !== "running") return;

    setVisibleLines([]);
    setProgress(0);

    const lineTimer = window.setInterval(() => {
      setVisibleLines((current) => {
        const next = stampedLines.slice(0, Math.min(current.length + 1, stampedLines.length));
        if (next.length === stampedLines.length) {
          window.clearInterval(lineTimer);
        }
        return next;
      });
    }, 760);

    const progressTimer = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + 9, 100);
        if (next >= 100) {
          window.clearInterval(progressTimer);
          window.setTimeout(onComplete, 650);
        }
        return next;
      });
    }, 520);

    return () => {
      window.clearInterval(lineTimer);
      window.clearInterval(progressTimer);
    };
  }, [onComplete, stampedLines, state]);

  const shown = state === "running" || state === "complete";

  return (
    <AnimatePresence>
      {shown ? (
        <motion.aside
          animate={{ x: 0, opacity: 1 }}
          className="pointer-events-auto fixed bottom-4 right-4 top-16 z-50 flex w-[min(400px,calc(100vw-2rem))] flex-col border border-noc-amber/50 bg-[#080c11]/95 shadow-amber-glow backdrop-blur"
          exit={{ x: 460, opacity: 0 }}
          initial={{ x: 460, opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <div className="border-b border-noc-border p-4">
            <div className="flex items-center gap-2 text-noc-amber">
              <AlertTriangle size={18} aria-hidden="true" />
              <h2 className="font-mono text-sm font-bold uppercase">Chaos Experiment In Progress</h2>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex justify-between font-mono text-[0.65rem] text-noc-muted">
                <span>0s</span>
                <span>Recovery timeline</span>
                <span>90s</span>
              </div>
              <div className="h-2 border border-noc-border bg-black">
                <motion.div
                  animate={{ width: `${state === "complete" ? 100 : progress}%` }}
                  className="h-full bg-noc-amber"
                  transition={{ duration: 0.25 }}
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-4">
            <div className="terminal-feed h-full overflow-hidden border border-[#1d2c24] bg-black p-3 font-mono text-[0.72rem] leading-6 text-[#7CFFB2]">
              {(state === "complete" ? stampedLines : visibleLines).map((line) => (
                <motion.div animate={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 4 }} key={line}>
                  {line}
                </motion.div>
              ))}
            </div>
          </div>

          {state === "complete" ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="border-t border-noc-teal/40 bg-noc-teal/10 p-4"
              initial={{ opacity: 0 }}
            >
              <div className="mb-3 flex items-center gap-2 font-mono text-sm font-bold uppercase text-noc-teal">
                <CheckCircle2 size={18} aria-hidden="true" />
                System Resilient
              </div>
              <div className="grid grid-cols-3 gap-2 text-center font-mono text-[0.68rem]">
                <div className="border border-noc-border bg-black/30 p-2">
                  <span className="block text-noc-muted">RTO</span>
                  <strong className="text-noc-teal">72s</strong>
                </div>
                <div className="border border-noc-border bg-black/30 p-2">
                  <span className="block text-noc-muted">Regions</span>
                  <strong className="text-noc-teal">2</strong>
                </div>
                <div className="border border-noc-border bg-black/30 p-2">
                  <span className="block text-noc-muted">Target</span>
                  <strong className="text-noc-teal">Met</strong>
                </div>
              </div>
              <button
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 border border-noc-teal/60 bg-noc-teal/15 font-sans text-xs font-bold uppercase text-noc-teal"
                type="button"
              >
                <Download size={15} aria-hidden="true" />
                Download Resilience Report PDF
              </button>
            </motion.div>
          ) : (
            <div className="border-t border-noc-border p-4 font-mono text-[0.7rem] text-noc-muted">
              <ServerCog size={15} className="mr-2 inline text-noc-amber" aria-hidden="true" />
              Next checkpoint {timestampFor(8)}
            </div>
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
