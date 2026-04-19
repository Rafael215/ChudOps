export const visualizationScopes = [
  { id: "all", label: "All Sites" },
  { id: "la-and-san-diego-county", label: "LA County + San Diego County" },
  { id: "la-county", label: "LA County" },
  { id: "san-diego-county", label: "San Diego County" }
] as const;

export type VisualizationScopeId = (typeof visualizationScopes)[number]["id"];

export const visualizationScopeLabel = (scopeId?: string) =>
  visualizationScopes.find((scope) => scope.id === scopeId)?.label ?? scopeId ?? "All Sites";