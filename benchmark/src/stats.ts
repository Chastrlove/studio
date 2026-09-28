// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

export type Summary = {
  count: number;
  mean: number;
  stddev: number;
  min: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
};

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return NaN;
  }
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index]!;
}

/** Compute summary statistics for a list of samples */
export function summarize(values: readonly number[]): Summary {
  // Sort numerically; the default Array#sort compares values as strings
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = count > 0 ? sorted.reduce((a, b) => a + b, 0) / count : NaN;
  const variance =
    count > 0 ? sorted.reduce((acc, value) => acc + (value - mean) ** 2, 0) / count : NaN;
  return {
    count,
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0] ?? NaN,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    p99: percentile(sorted, 0.99),
    max: sorted[count - 1] ?? NaN,
  };
}
