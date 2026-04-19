import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Download, ServerCog, X } from "lucide-react";
import { downloadResilienceReport, getFisExperiment } from "../lib/api";

interface ChaosOverlayProps {
  state: "idle" | "running" | "complete";
  experimentId?: string;
  onComplete: () => void;
  onDismiss: () => void;
}

const timestampFor = (offsetSeconds: number) => {
  const date = new Date(Date.now() + offsetSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
};

export function ChaosOverlay({ state, experimentId, onComplete, onDismiss }: ChaosOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [experimentStatus, setExperimentStatus] = useState<string>("starting");
  const [statusHistory, setStatusHistory] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [lastStartedAt, setLastStartedAt] = useState<string | undefined>();
  const [lastEndedAt, setLastEndedAt] = useState<string | undefined>();
  const [injectedFaultLabel, setInjectedFaultLabel] = useState("Lambda invocation delay in primary region");
  const lastStatusRef = useRef<string | undefined>();

  const resolvedExperimentId = experimentId ?? "pending-experiment";

  const appendStatusLine = (message: string, timestamp = new Date()) => {
    const time = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(timestamp);

    setStatusHistory((current) => {
      if (current.length > 0 && current[current.length - 1]?.message === message) {
        return current;
      }

      return [...current, { timestamp: time, message }];
    });
  };

  useEffect(() => {
    if (state !== "running") return;

    setProgress(0);
    setExperimentStatus("starting");
    setReportGenerated(false);
    setLastStartedAt(undefined);
    setLastEndedAt(undefined);
    setInjectedFaultLabel("Lambda invocation delay in primary region");
    lastStatusRef.current = undefined;
    setStatusHistory([]);

    if (!experimentId) {
      appendStatusLine("FIS experiment requested, waiting for experiment id...");
      return;
    }

    let cancelled = false;
    appendStatusLine(`FIS experiment started: ${experimentId}`);

    const statusToProgress = (status: string) => {
      switch (status.toLowerCase()) {
        case "initiating":
          return 20;
        case "running":
          return 55;
        case "completed":
          return 100;
        case "stopped":
        case "failed":
        case "cancelled":
        case "canceled":
          return 100;
        default:
          return 35;
      }
    };

    const isTerminal = (status: string) => {
      const normalized = status.toLowerCase();
      return normalized === "completed" || normalized === "stopped" || normalized === "failed" || normalized === "cancelled" || normalized === "canceled";
    };

    const poll = async () => {
      try {
        const experiment = await getFisExperiment(experimentId);
        if (cancelled) return;

        const currentStatus = experiment.status;
        setExperimentStatus(currentStatus);
        setProgress(statusToProgress(currentStatus));
        setLastStartedAt(experiment.startedAt);
        setLastEndedAt(experiment.endedAt);

        const firstAction = experiment.actions?.[0];
        if (firstAction?.description) {
          setInjectedFaultLabel(firstAction.description);
        }

        if (lastStatusRef.current !== currentStatus) {
          appendStatusLine(`AWS FIS status: ${currentStatus}`, experiment.startedAt ? new Date(experiment.startedAt) : new Date());
          lastStatusRef.current = currentStatus;
        }

        if (isTerminal(currentStatus)) {
          if (currentStatus.toLowerCase() === "completed") {
            appendStatusLine(`AWS FIS completed${experiment.endedAt ? ` at ${experiment.endedAt}` : ""}`);
            setProgress(100);
          }

          window.setTimeout(() => {
            if (!cancelled) {
              onComplete();
            }
          }, 400);
          return;
        }

        window.setTimeout(poll, 3000);
      } catch (error) {
        if (cancelled) return;
        appendStatusLine("AWS FIS status poll failed; retrying...");
        window.setTimeout(poll, 4000);
        console.error("FIS status poll failed", error);
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [experimentId, onComplete, state]);

  const shown = state === "running" || state === "complete";
  const renderedLines = useMemo(() => {
    if (statusHistory.length > 0) {
      return statusHistory.map((entry) => `[${entry.timestamp}] ${entry.message}`);
    }

    if (state === "complete") {
      return [`[${timestampFor(0)}] AWS FIS completed: ${experimentId ?? "unknown"}`];
    }

    return [`[${timestampFor(0)}] Awaiting live AWS FIS status...`];
  }, [experimentId, state, statusHistory]);

  const handleDownloadReport = async () => {
    if (!experimentId || isDownloadingReport) {
      return;
    }

    setIsDownloadingReport(true);

    try {
      await downloadResilienceReport({
        experimentId,
        status: experimentStatus,
        logs: renderedLines
      });
      setReportGenerated(true);
      appendStatusLine("Resilience report PDF downloaded");
    } catch (error) {
      console.error("Resilience report download failed", error);
      appendStatusLine("Resilience report download failed");
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const failoverTriggered = renderedLines.some((line) => /failover|traffic shifted|secondary region/i.test(line));
  const recoverySeconds =
    lastStartedAt && lastEndedAt
      ? Math.max(0, Math.round((new Date(lastEndedAt).getTime() - new Date(lastStartedAt).getTime()) / 1000))
      : undefined;
  const primaryRegionUnhealthy = ["running", "completed", "stopped"].includes(experimentStatus.toLowerCase()) ? "Yes" : "No";

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
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-noc-amber">
                <AlertTriangle size={18} aria-hidden="true" />
                <h2 className="font-mono text-sm font-bold uppercase">
                  {state === "complete" ? "Chaos Experiment Complete" : "Chaos Experiment In Progress"}
                </h2>
              </div>
              <button
                aria-label="Dismiss chaos experiment overlay"
                className="grid h-8 w-8 place-items-center border border-noc-border bg-black/40 text-noc-muted transition hover:border-noc-teal hover:text-noc-teal"
                onClick={onDismiss}
                type="button"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex justify-between font-mono text-[0.65rem] text-noc-muted">
                <span>0s</span>
                <span>Live FIS status</span>
                <span>{experimentStatus.toUpperCase()}</span>
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
              {renderedLines.map((line) => (
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
                AWS FIS Terminal State
              </div>
              <div className="mb-3 border border-noc-border bg-black/30 p-2 font-mono text-[0.64rem] uppercase text-noc-muted">
                Experiment {resolvedExperimentId}
              </div>
              <div className="grid gap-2 font-mono text-[0.68rem]">
                <div className="flex items-center justify-between border border-noc-border bg-black/30 px-2 py-1.5">
                  <span className="text-noc-muted">FIS experiment</span>
                  <strong className="text-noc-teal">{experimentStatus}</strong>
                </div>
                <div className="flex items-center justify-between border border-noc-border bg-black/30 px-2 py-1.5">
                  <span className="text-noc-muted">Injected fault</span>
                  <strong className="max-w-[55%] text-right text-noc-teal">{injectedFaultLabel}</strong>
                </div>
                <div className="flex items-center justify-between border border-noc-border bg-black/30 px-2 py-1.5">
                  <span className="text-noc-muted">Primary region unhealthy</span>
                  <strong className="text-noc-teal">{primaryRegionUnhealthy}</strong>
                </div>
                <div className="flex items-center justify-between border border-noc-border bg-black/30 px-2 py-1.5">
                  <span className="text-noc-muted">Failover triggered</span>
                  <strong className="text-noc-teal">{failoverTriggered ? "Yes" : "Not observed"}</strong>
                </div>
                <div className="flex items-center justify-between border border-noc-border bg-black/30 px-2 py-1.5">
                  <span className="text-noc-muted">Time to recovery</span>
                  <strong className="text-noc-teal">{recoverySeconds !== undefined ? `${recoverySeconds}s` : "In progress"}</strong>
                </div>
                <div className="flex items-center justify-between border border-noc-border bg-black/30 px-2 py-1.5">
                  <span className="text-noc-muted">Requests served during event</span>
                  <strong className="text-noc-teal">Not instrumented</strong>
                </div>
                <div className="flex items-center justify-between border border-noc-border bg-black/30 px-2 py-1.5">
                  <span className="text-noc-muted">Experiment report</span>
                  <strong className="text-noc-teal">{reportGenerated ? "Generated" : "Pending"}</strong>
                </div>
              </div>
              <button
                className="mt-3 flex h-10 w-full items-center justify-center gap-2 border border-noc-teal/60 bg-noc-teal/15 font-sans text-xs font-bold uppercase text-noc-teal disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!experimentId || isDownloadingReport}
                onClick={handleDownloadReport}
                type="button"
              >
                <Download size={15} aria-hidden="true" />
                {isDownloadingReport ? "Generating Resilience Report PDF..." : "Download Resilience Report PDF"}
              </button>
            </motion.div>
          ) : (
            <div className="border-t border-noc-border p-4 font-mono text-[0.7rem] text-noc-muted">
              <ServerCog size={15} className="mr-2 inline text-noc-amber" aria-hidden="true" />
              Polling AWS FIS in real time
            </div>
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
