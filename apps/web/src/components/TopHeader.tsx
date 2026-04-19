import { useEffect, useState } from "react";
import { Cpu, RadioTower } from "lucide-react";

interface TopHeaderProps {
  chaosState: "idle" | "running" | "complete";
  latencyMs: number;
}

const subsystems = [
  { label: "INFERENCE ENGINE", state: "healthy" },
  { label: "GRID MODEL", state: "healthy" },
  { label: "SAGEMAKER EP", state: "warning" },
  { label: "ROUTE 53 ARC", state: "healthy" },
  { label: "FIS MONITOR", state: "healthy" }
] as const;

const formatUtc = () =>
  new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  }).format(new Date());

export function TopHeader({ chaosState, latencyMs }: TopHeaderProps) {
  const [clock, setClock] = useState(formatUtc());

  useEffect(() => {
    const timer = window.setInterval(() => setClock(formatUtc()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-12 items-center border-b border-noc-border bg-noc-panel/95 px-4 shadow-[0_1px_16px_rgba(0,212,170,0.16)] backdrop-blur">
      <div className="flex min-w-[250px] items-center gap-3">
        <div className="grid h-8 w-8 place-items-center border border-noc-teal/50 bg-noc-teal/10 text-noc-teal shadow-teal-glow">
          <RadioTower size={17} aria-hidden="true" />
        </div>
        <div>
          <div className="font-sans text-[0.9rem] font-extrabold leading-none text-white">Bedrock</div>
          <div className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.18em] text-noc-muted">
            Resilient grid digital twin
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 flex-1 justify-center gap-2 px-4 lg:flex">
        {subsystems.map((subsystem) => {
          const state = chaosState === "running" && subsystem.label === "FIS MONITOR" ? "warning" : subsystem.state;
          const dotClass =
            state === "healthy" ? "bg-noc-teal shadow-teal-glow" : "bg-noc-amber shadow-amber-glow";

          return (
            <div
              className="flex items-center gap-2 border border-noc-border bg-[#0a0e14]/80 px-2.5 py-1 text-[0.62rem] font-bold uppercase text-noc-muted"
              key={subsystem.label}
            >
              <span className={`h-2 w-2 rounded-full ${dotClass} animate-pulse`} />
              <span>{subsystem.label}</span>
            </div>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2 font-mono text-[0.68rem] font-semibold text-noc-text">
        <span className="hidden items-center gap-2 border border-noc-border bg-[#0a0e14] px-2.5 py-1 sm:inline-flex">
          <Cpu size={13} className="text-noc-teal" aria-hidden="true" />
          <span>{clock} UTC</span>
        </span>
        <span className="border border-noc-teal/35 bg-noc-teal/10 px-2.5 py-1 text-noc-teal">PRIMARY: us-west-2</span>
        <span className="border border-noc-border bg-[#0a0e14] px-2.5 py-1">API {latencyMs}ms</span>
      </div>
    </header>
  );
}
