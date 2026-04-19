import { FormEvent, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

interface OperatorAccessModalProps {
  onSubmit: (token: string) => void;
}

export function OperatorAccessModal({ onSubmit }: OperatorAccessModalProps) {
  const [token, setToken] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (token.trim()) {
      onSubmit(token);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#05080c]/95 px-4 backdrop-blur-sm">
      <form className="w-full max-w-md border border-noc-border bg-[#0a0e14] shadow-[0_24px_80px_rgba(0,0,0,0.55)]" onSubmit={handleSubmit}>
        <div className="border-b border-noc-border bg-[#080c11] px-5 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center border border-noc-teal/50 bg-noc-teal/10 text-noc-teal">
              <ShieldCheck size={19} aria-hidden="true" />
            </div>
            <div>
              <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em] text-noc-teal">Operator Access</p>
              <h2 className="font-sans text-xl font-extrabold text-white">Unlock demo controls</h2>
            </div>
          </div>
          <p className="font-sans text-sm leading-6 text-noc-muted">
            Enter the shared demo token to load protected catalog data, run SageMaker diagnostics, generate reports, and start AWS FIS experiments.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <label className="block" htmlFor="operator-token">
            <span className="mb-2 block font-mono text-[0.68rem] font-bold uppercase text-noc-muted">Demo Token</span>
            <div className="flex border border-noc-border bg-black focus-within:border-noc-teal">
              <span className="grid w-11 place-items-center border-r border-noc-border text-noc-teal">
                <KeyRound size={16} aria-hidden="true" />
              </span>
              <input
                autoComplete="off"
                autoFocus
                className="h-11 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-white outline-none"
                id="operator-token"
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste shared token"
                type="password"
                value={token}
              />
            </div>
          </label>

          <button
            className="h-11 w-full border border-noc-teal/60 bg-noc-teal/15 font-sans text-xs font-bold uppercase text-noc-teal transition hover:bg-noc-teal/25 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!token.trim()}
            type="submit"
          >
            Authorize Dashboard
          </button>
        </div>
      </form>
    </div>
  );
}
