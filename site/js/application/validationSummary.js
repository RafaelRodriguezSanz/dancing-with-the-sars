const pct = (v) => `${Math.round(v * 100)}%`;
const GROUPS = ['water', 'woody', 'open', 'built'];

/** Pure: validation.json -> display lines, or null when it has no land-cover result. */
export function summarizeValidation(v) {
  const lc = v?.land_cover;
  if (!lc || typeof lc.overall_agreement !== 'number') return null;
  const w = v.permanent_water;
  return {
    headline: `${pct(lc.overall_agreement)} agreement, kappa ${lc.kappa.toFixed(2)} vs ${lc.reference}`,
    groups: GROUPS.filter((g) => lc.per_group?.[g]).map((g) =>
      `${g}: recall ${pct(lc.per_group[g].recall)}, precision ${pct(lc.per_group[g].precision)}`),
    water: w ? `Permanent water IoU ${w.iou.toFixed(2)} vs ${w.reference}` : null,
    limits: v.limits ?? 'Agreement with 2021 reference maps, not accuracy.',
  };
}
