import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, BrainCircuit, ShieldCheck, X } from "lucide-react";
import type { ModelRunMetadata } from "@seismic-sentry/shared";

interface ModelDetailsModalProps {
  isOpen: boolean;
  model: ModelRunMetadata;
  onClose: () => void;
}

const featureLabel = (feature: string) =>
  ({
    pgv_cm_s: "PGV",
    vs30: "Vs30",
    installation_type_code: "Install Type",
    capacity_kw: "Capacity"
  })[feature] ?? feature;

export function ModelDetailsModal({ isOpen, model, onClose }: ModelDetailsModalProps) {
  const featureImportance = [...(model.featureImportance ?? [])].sort((left, right) => right.importance - left.importance);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            animate={{ y: 0, opacity: 1 }}
            className="relative w-full max-w-3xl border border-noc-border bg-[#0a0e14] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            exit={{ y: 24, opacity: 0 }}
            initial={{ y: 24, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-noc-border bg-[#080c11] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center border border-noc-teal/40 bg-noc-teal/10 text-noc-teal">
                  <BrainCircuit size={19} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.2em] text-noc-teal">Model Details</p>
                  <h2 className="mt-1 font-sans text-xl font-extrabold text-white">Judge-facing model evidence</h2>
                </div>
              </div>
              <button
                aria-label="Close model details modal"
                className="grid h-8 w-8 place-items-center border border-noc-border bg-black/40 text-noc-muted transition hover:border-noc-teal hover:text-noc-teal"
                onClick={onClose}
                type="button"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <section className="space-y-4">
                <div className="border border-noc-border bg-black/20 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-[0.62rem] font-bold uppercase text-noc-muted">AUC-ROC</span>
                    <ShieldCheck size={16} className="text-noc-teal" aria-hidden="true" />
                  </div>
                  <div className="flex items-end gap-3">
                    <strong className="font-sans text-4xl font-black text-white">
                      {model.aucRoc !== undefined ? model.aucRoc.toFixed(3) : "n/a"}
                    </strong>
                    <span className="pb-1 font-mono text-[0.68rem] uppercase text-noc-muted">held-out validation</span>
                  </div>
                </div>

                <div className="border border-noc-border bg-black/20 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-mono text-[0.62rem] font-bold uppercase text-noc-muted">Model Metadata</span>
                    <BarChart3 size={16} className="text-noc-amber" aria-hidden="true" />
                  </div>
                  <dl className="space-y-2 font-mono text-[0.68rem]">
                    <div className="flex justify-between gap-4 border-b border-noc-border/70 pb-2">
                      <dt className="text-noc-muted">Name</dt>
                      <dd className="text-right text-noc-text">{model.modelName}</dd>
                    </div>
                    <div className="flex justify-between gap-4 border-b border-noc-border/70 pb-2">
                      <dt className="text-noc-muted">Version</dt>
                      <dd className="text-right text-noc-text">{model.modelVersion}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-noc-muted">Inference source</dt>
                      <dd className="text-right text-noc-text">{model.inferenceSource}</dd>
                    </div>
                  </dl>
                </div>

                <div className="border border-noc-border bg-black/20 p-4">
                  <p className="mb-2 font-mono text-[0.62rem] font-bold uppercase text-noc-muted">Synthetic-label explanation</p>
                  <p className="text-sm leading-6 text-noc-text">{model.syntheticLabelExplanation ?? "Labels were generated from a synthetic failure-probability rule built from PGV, Vs30, installation type, and capacity, then used to train the classifier."}</p>
                </div>
              </section>

              <section className="border border-noc-border bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-[0.62rem] font-bold uppercase text-noc-muted">Feature Importances</span>
                  <span className="font-mono text-[0.62rem] uppercase text-noc-muted">ranked by model</span>
                </div>

                <div className="space-y-3">
                  {featureImportance.map((item, index) => (
                    <div className="grid grid-cols-[24px_1fr_56px] items-center gap-3" key={`${item.feature}-${index}`}>
                      <span className="font-mono text-[0.68rem] text-noc-muted">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <span className="font-sans text-sm font-bold text-noc-text">{featureLabel(item.feature)}</span>
                          <span className="font-mono text-[0.68rem] text-noc-muted">{Math.round(item.importance * 100)}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden bg-noc-border">
                          <div className="h-full bg-gradient-to-r from-noc-teal via-noc-amber to-noc-red" style={{ width: `${Math.max(4, Math.round(item.importance * 100))}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}