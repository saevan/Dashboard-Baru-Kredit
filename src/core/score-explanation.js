import { COMPONENT_DEFS, PILLARS, PILLAR_LABELS } from './config.js';
import { scaleFor } from './rating.js';

const numeric = value => typeof value === 'number' && Number.isFinite(value);

/** Old snapshots keep their final grade. Only the score-band reference may use today's scale. */
export function gradeExplanation(result = {}) {
     const rating = result.risk?.pefindo || null;
     let band = rating?.score_band || null;
     const referenceOnly = !band && numeric(result.finalScore);
     if (referenceOnly) {
          const scale = scaleFor(rating?.scale_mode);
          const index = scale.findIndex(g => result.finalScore >= g.min);
          if (index >= 0) band = { grade: scale[index].grade, min: scale[index].min, max_exclusive: index > 0 ? scale[index-1].min : null };
     }
     const decision = result.decision || {};
     const reasons = [...(decision.hard_rules_triggered || []), ...(decision.soft_notes || [])]
          .map(r => r.message || r.rule).filter(Boolean);
     if (decision.gap_analysis?.verdict === 'too_far') reasons.push('Gap benchmark terlalu jauh → TIDAK_LAYAK.');
     if (!reasons.length && rating?.capped_by?.includes('keputusan')) {
          reasons.push(...(decision.reasons || []));
          if (!reasons.length) reasons.push('Rincian penyebab keputusan tidak tersimpan; tinjau input dan jalankan penilaian ulang.');
     }
     return { rating, band, referenceOnly, decision: decision.decision || null, reasons };
}

/** Explain the stored calculation; never recompute using today's settings or borrower data. */
export function scoreExplanation(result = {}) {
     const weights = result.weights || {};
     const saved = new Map((result.pillars || []).map(p => [p.key, p]));
     const rows = PILLARS.map(key => ({ key, label: saved.get(key)?.label || PILLAR_LABELS[key],
          score: saved.get(key)?.score ?? result.pillarScores?.[key],
          rawWeight: weights.pillar_effective?.[key] ?? saved.get(key)?.weight,
          baseWeight: weights.pillar_base?.[key] }));
     const complete = rows.every(p => numeric(p.score) && numeric(p.rawWeight) && p.rawWeight >= 0);
     const sum = complete ? rows.reduce((n,p) => n + p.rawWeight,0) : 0;
     const baseSum = rows.every(p => numeric(p.baseWeight) && p.baseWeight >= 0)
          ? rows.reduce((n,p) => n + p.baseWeight,0) : 0;
     const pillars = rows.map(p => {
          const weight = sum > 0 ? p.rawWeight / sum : null;
          const definitions = COMPONENT_DEFS.filter(c => c.pillar === p.key);
          const componentComplete = definitions.every(c => numeric(result.subscores?.[c.key]) && numeric(weights.component_effective?.[c.key]) && weights.component_effective[c.key] >= 0);
          const componentSum = componentComplete ? definitions.reduce((n,c) => n + weights.component_effective[c.key],0) : 0;
          const components = definitions.map(c => {
               const score = numeric(result.subscores?.[c.key]) ? result.subscores[c.key] : null;
               const localWeight = componentSum > 0 ? weights.component_effective[c.key] / componentSum : null;
               const effectiveWeight = weight !== null && localWeight !== null ? weight * localWeight : null;
               return {key:c.key,label:c.label,score,localWeight,effectiveWeight,
                    contribution:effectiveWeight !== null && score !== null ? effectiveWeight * score : null,
                    shortfall:effectiveWeight !== null && score !== null ? effectiveWeight * (100-score) : null,
                    trace:result.score_details?.[c.key] || null};
          });
          return {...p,weight,baseWeight:baseSum > 0 && numeric(p.baseWeight) ? p.baseWeight/baseSum : null,
               contribution:weight !== null ? p.score*weight : null,components};
     });
     const total = complete && sum > 0 ? pillars.reduce((n,p) => n+p.contribution,0) : null;
     const components = pillars.flatMap(p=>p.components);
     return {pillars,finalScore:numeric(result.finalScore)?result.finalScore:null,total,
          matches:total !== null && numeric(result.finalScore) ? Math.abs(Math.round(total*10)/10 - result.finalScore)<1e-9 : null,
          contributors:components.filter(c=>c.contribution!==null).sort((a,b)=>b.contribution-a.contribution).slice(0,3),
          shortfalls:components.filter(c=>c.shortfall!==null && c.shortfall>0).sort((a,b)=>b.shortfall-a.shortfall).slice(0,3),
          rating:result.risk?.pefindo || null,weights,
          hardRules:result.decision?.hard_rules_triggered || []};
}
