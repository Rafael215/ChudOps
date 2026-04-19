export const regions = [
  { id: "all", label: "All Regions" },
  { id: "southern-california", label: "Southern California" },
  { id: "northern-california", label: "Northern California" },
  { id: "california", label: "California Other" },
  { id: "western-us", label: "Western US" },
  { id: "central-us", label: "Central US" },
  { id: "southeast-us", label: "Southeast US" },
  { id: "northeast-us", label: "Northeast US" },
  { id: "outside-us", label: "Outside US" }
] as const;

export const regionLabel = (regionId?: string) =>
  regions.find((region) => region.id === regionId)?.label ?? regionId ?? "All Regions";
