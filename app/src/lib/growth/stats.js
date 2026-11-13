// Statistics for the growth control room (#admin/crecimiento): A/B readouts, NPS, Van Westendorp price points.
// Pure functions, tested in tests/growth-stats.test.js.

// Standard normal cumulative (Abramowitz-Stegun 26.2.17).
export function phi(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Two-proportion z-test of a variant against the control. Returns lift (relative), z, two-sided p, and the chance the
// variant beats the control (normal approximation of the two Beta posteriors with a uniform prior).
export function compareArms(control, variant) {
  const n1 = control.exposed, n2 = variant.exposed;
  const x1 = control.converted, x2 = variant.converted;
  if (!n1 || !n2) return { lift: null, z: null, p: null, beat: null, enough: false };
  const p1 = x1 / n1, p2 = x2 / n2;
  const pool = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  const z = se > 0 ? (p2 - p1) / se : 0;
  const pval = 2 * (1 - phi(Math.abs(z)));
  // Beta(x+1, n-x+1) mean and variance for each arm.
  const m = (x, n) => (x + 1) / (n + 2);
  const v = (x, n) => ((x + 1) * (n - x + 1)) / ((n + 2) ** 2 * (n + 3));
  const beat = phi((m(x2, n2) - m(x1, n1)) / Math.sqrt(v(x1, n1) + v(x2, n2)));
  return {
    rateControl: p1, rate: p2, lift: p1 > 0 ? (p2 - p1) / p1 : null, z, p: pval, beat,
    // At least 100 exposed per arm and 10 conversions in all before anyone reads a verdict.
    enough: n1 >= 100 && n2 >= 100 && x1 + x2 >= 10,
  };
}

// Readout of one experiment from admin_experiment_readout(): the first variant listed is the control.
export function experimentVerdict(exp) {
  const arms = new Map((exp.arms ?? []).map((a) => [a.variant, a]));
  const variants = exp.variants ?? [];
  const control = arms.get(variants[0]) ?? { exposed: 0, converted: 0 };
  return variants.slice(1).map((v) => {
    const arm = arms.get(v) ?? { exposed: 0, converted: 0 };
    const c = compareArms(control, arm);
    let verdict = "Faltan datos";
    if (c.enough) verdict = c.beat >= 0.95 ? "Gana la variante" : c.beat <= 0.05 ? "Gana el control" : "Sin diferencia clara";
    return { variant: v, arm, control, ...c, verdict };
  });
}

// Net Promoter Score from 0-10 answers: % promoters (9-10) − % detractors (0-6).
export function nps(scores) {
  const xs = scores.filter((s) => Number.isFinite(s) && s >= 0 && s <= 10);
  if (!xs.length) return { score: null, n: 0, promoters: 0, passives: 0, detractors: 0 };
  const pro = xs.filter((s) => s >= 9).length, det = xs.filter((s) => s <= 6).length;
  return { score: Math.round(((pro - det) / xs.length) * 100), n: xs.length, promoters: pro, passives: xs.length - pro - det, detractors: det };
}

// Van Westendorp price sensitivity: answers [{ barato, caro, muy_barato, muy_caro }] in pesos. Returns the four
// classic points where the cumulative curves cross: OPP (muy barato × caro), IPP (barato × caro... per convention
// "not cheap" × "not expensive"), PMC (muy barato × no barato), PME (muy caro × no caro), and the acceptable range.
export function vanWestendorp(rows) {
  const ok = rows.filter((r) => [r.muy_barato, r.barato, r.caro, r.muy_caro].every((x) => Number.isFinite(x) && x >= 0)
    && r.muy_barato <= r.barato && r.barato <= r.caro && r.caro <= r.muy_caro);
  if (ok.length < 5) return { n: ok.length, enough: false };
  const prices = [...new Set(ok.flatMap((r) => [r.muy_barato, r.barato, r.caro, r.muy_caro]))].sort((a, b) => a - b);
  const n = ok.length;
  // Share at each price: "too cheap" and "cheap" fall as price rises; "expensive" and "too expensive" rise.
  const at = (p) => ({
    tooCheap: ok.filter((r) => r.muy_barato >= p).length / n,
    cheap: ok.filter((r) => r.barato >= p).length / n,
    expensive: ok.filter((r) => r.caro <= p).length / n,
    tooExpensive: ok.filter((r) => r.muy_caro <= p).length / n,
  });
  const cross = (f) => {
    // First price where f(p) changes sign (linear interpolation between neighbours).
    let prev = null;
    for (const p of prices) {
      const v = f(at(p));
      if (prev && Math.sign(v) !== Math.sign(prev.v) && v !== 0) {
        const t = prev.v / (prev.v - v);
        return Math.round(prev.p + t * (p - prev.p));
      }
      if (v === 0) return p;
      prev = { p, v };
    }
    return null;
  };
  const pmc = cross((s) => s.tooCheap - (1 - s.cheap));          // point of marginal cheapness
  const opp = cross((s) => s.tooCheap - s.tooExpensive);           // optimal price point
  const ipp = cross((s) => s.cheap - s.expensive);                 // indifference price point
  const pme = cross((s) => (1 - s.expensive) - s.tooExpensive);    // point of marginal expensiveness
  return { n, enough: true, pmc, opp, ipp, pme };
}

// Counts of a single-choice survey ("¿Cómo nos conociste?"), largest first.
export function tally(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const v = r?.[key];
    if (v == null || v === "") continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count, pct: total ? Math.round((count / total) * 100) : 0 }));
}
