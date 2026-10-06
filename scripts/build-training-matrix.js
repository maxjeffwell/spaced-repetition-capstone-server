#!/usr/bin/env node
'use strict';

/**
 * Build the v2 training matrix.
 *
 * Why this exists (2026-10-06): the v1 model always predicted ~2 days. Its label
 * was the observed gap to the next review (x1.2) and a third of its features were
 * `timeSinceLastReview` in disguise, so it learned "next interval = previous
 * interval". v2 trains on a label that ENCODES GROWTH -- the next interval a
 * sound spaced-repetition policy would assign given the card's state and the
 * graded outcome -- and on features produced by the production feature code
 * (ml/advanced-features.js), so training and inference cannot drift apart.
 *
 * Sources:
 *   1. training-data-clean.json (simulated reviews): state is taken from each
 *      row's features, prevInterval from metadata.reviewHistory[reviewIndex].
 *   2. A synthetic grid over the state space, so the policy is learned across
 *      the full range of memory strength / success rate / streaks, not only the
 *      narrow region the simulation visited.
 *
 * Label (days):
 *   recalled  -> clamp(round(max(prev * ease, prev + 1)), 1, 90)
 *   forgotten -> 1
 *   ease = clamp(1.3 + 1.2*successRate + 0.05*min(consecutiveCorrect, 10)
 *                    - 0.6*difficultyRating, 1.3, 3.0)
 *
 * Output: ml/training-matrix-v2.json  { featureNames, X, y, meta }
 */

const fs = require('fs');
const path = require('path');
const {
  FEATURE_VERSION,
  createAdvancedFeatureVector,
  getFeatureArray,
  getFeatureNames
} = require('../ml/advanced-features');

const MIN_INTERVAL = 1;
const MAX_INTERVAL = 90;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function ease(successRate, consecutiveCorrect, difficultyRating) {
  return clamp(1.3 + 1.2 * successRate + 0.05 * Math.min(consecutiveCorrect, 10) - 0.6 * difficultyRating, 1.3, 3.0);
}

function label(prevInterval, recalled, successRate, consecutiveCorrect, difficultyRating) {
  if (!recalled) return MIN_INTERVAL;
  const grown = Math.max(prevInterval * ease(successRate, consecutiveCorrect, difficultyRating), prevInterval + 1);
  return clamp(Math.round(grown), MIN_INTERVAL, MAX_INTERVAL);
}

// Same rule as utils/question-helpers.js updateLinkedList(): the stored memoryStrength.
function memoryStrengthFromInterval(interval, successRate, totalReviews) {
  const performanceMultiplier = 1 + successRate * 0.5;
  const experienceBonus = Math.min(2, 1 + Math.log(totalReviews + 1) * 0.1);
  return clamp(interval * performanceMultiplier * experienceBonus, 1, 90);
}

// Deterministic PRNG so the matrix is reproducible.
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function rowsFromSimulation(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = Array.isArray(data) ? data : Object.values(data).find(Array.isArray);
  const out = [];
  let skipped = 0;
  for (const r of rows) {
    const f = r.features || {};
    const hist = (r.metadata && r.metadata.reviewHistory) || [];
    const idx = r.metadata ? r.metadata.reviewIndex : undefined;
    const current = Number.isInteger(idx) ? hist[idx] : null;
    if (!current) { skipped++; continue; }
    const prevInterval = clamp(Number(current.intervalUsed) || 1, 1, MAX_INTERVAL);
    const recalled = !!current.recalled;
    const successRate = clamp(Number(f.successRate) || 0, 0, 1);
    const difficultyRating = clamp(Number(f.difficultyRating) || 0, 0, 1);
    const consecutiveCorrect = Math.max(0, Number(f.consecutiveCorrect) || 0);
    const totalReviews = Math.max(1, Number(f.totalReviews) || 1);
    out.push({
      base: {
        memoryStrength: memoryStrengthFromInterval(prevInterval, successRate, totalReviews),
        difficultyRating,
        successRate,
        averageResponseTime: Number(f.averageResponseTime) || 3000,
        totalReviews,
        consecutiveCorrect,
        timeOfDay: clamp(Number(f.timeOfDay) || 0, 0, 1),
        recalled
      },
      y: label(prevInterval, recalled, successRate, consecutiveCorrect, difficultyRating),
      source: 'simulation'
    });
  }
  return { rows: out, skipped };
}

function syntheticRows(count, seed = 42) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    // log-uniform interval 1..90 so small intervals (where users live) are dense
    const prevInterval = clamp(Math.round(Math.exp(rnd() * Math.log(MAX_INTERVAL))), 1, MAX_INTERVAL);
    const successRate = clamp(0.15 + rnd() * 0.85, 0, 1);
    const totalReviews = 1 + Math.floor(rnd() * 40);
    const recalled = rnd() < successRate;
    const streakCap = Math.min(totalReviews, 20);
    const consecutiveCorrect = recalled ? Math.floor(rnd() * (streakCap + 1)) : 0;
    const difficultyRating = clamp(1 - successRate + (rnd() - 0.5) * 0.3, 0, 1);
    const averageResponseTime = 800 + rnd() * 11000;
    out.push({
      base: {
        memoryStrength: memoryStrengthFromInterval(prevInterval, successRate, totalReviews),
        difficultyRating,
        successRate,
        averageResponseTime,
        totalReviews,
        consecutiveCorrect,
        timeOfDay: rnd(),
        recalled
      },
      y: label(prevInterval, recalled, successRate, consecutiveCorrect, difficultyRating),
      source: 'synthetic'
    });
  }
  return out;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const simFile = path.join(root, 'training-data-clean.json');
  const outFile = path.join(root, 'ml', 'training-matrix-v2.json');
  const synthCount = parseInt(process.env.SYNTH_ROWS || '40000', 10);

  const sim = fs.existsSync(simFile) ? rowsFromSimulation(simFile) : { rows: [], skipped: 0 };
  const synth = syntheticRows(synthCount);
  const all = sim.rows.concat(synth);

  const names = getFeatureNames();
  const X = [];
  const y = [];
  for (const r of all) {
    const arr = getFeatureArray(createAdvancedFeatureVector(r.base, null));
    if (arr.length !== names.length || arr.some(v => !Number.isFinite(v))) continue;
    X.push(arr);
    y.push(r.y);
  }

  const meta = {
    featureVersion: FEATURE_VERSION,
    featureCount: names.length,
    rows: X.length,
    simulationRows: sim.rows.length,
    simulationSkipped: sim.skipped,
    syntheticRows: synth.length,
    label: 'recalled ? clamp(round(max(prev*ease, prev+1)),1,90) : 1; ease = clamp(1.3+1.2*successRate+0.05*min(consecutive,10)-0.6*difficulty,1.3,3.0)',
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(outFile, JSON.stringify({ featureNames: names, X, y, meta }));

  const ys = y.slice().sort((a, b) => a - b);
  console.log(`Wrote ${outFile}`);
  console.log(`  rows: ${X.length} (simulation ${sim.rows.length}, skipped ${sim.skipped}; synthetic ${synth.length})`);
  console.log(`  features: ${names.length} (v${FEATURE_VERSION})`);
  console.log(`  label days: min ${ys[0]} median ${ys[Math.floor(ys.length / 2)]} p90 ${ys[Math.floor(ys.length * 0.9)]} max ${ys[ys.length - 1]}`);
  console.log(`  share forgotten (label=1 & recalled=0): ${(all.filter(r => !r.base.recalled).length / all.length * 100).toFixed(1)}%`);
}

if (require.main === module) main();

module.exports = { label, ease, memoryStrengthFromInterval, syntheticRows };
