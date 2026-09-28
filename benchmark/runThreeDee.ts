// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/* eslint-disable no-restricted-syntax */

// Runs the `threedee` benchmark presets in Chromium and writes the results to a JSON file.
// Optionally compares against a previous results file, so a baseline build and a candidate build
// can be measured on the same machine and compared.
//
// Usage (with a benchmark build served on port 8080):
//   npx ts-node benchmark/runThreeDee.ts --out baseline.json
//   npx ts-node benchmark/runThreeDee.ts --out candidate.json --compare baseline.json
//
// Options:
//   --url <url>            Benchmark server (default http://localhost:8080)
//   --presets <a,b,...>    Presets to run (default: all presets)
//   --query <params>       Extra query parameters for every run, e.g. "duration=30&gpuSync=1"
//   --runs <n>             Runs per preset (default 3); results report the median run
//   --out <file>           Where to write results (default threedee-results.json)
//   --compare <file>       Previous results file to compare against
//   --headed               Show the browser window (uses the real GPU more reliably)
//   --executable <path>    Chromium executable to use
//   --timeout <seconds>    Per-run timeout (default 180)

import fs from "fs";
import { chromium } from "playwright";

import { PRESETS } from "./src/threeDee/params";
import type { ThreeDeeBenchmarkResult } from "./src/threeDee/result";

type Options = {
  url: string;
  presets: string[];
  query: string;
  runs: number;
  out: string;
  compare?: string;
  headed: boolean;
  executable?: string;
  timeoutSec: number;
};

type PresetResult = {
  preset: string;
  /** The run with the median renderer total time */
  median: ThreeDeeBenchmarkResult;
  runs: ThreeDeeBenchmarkResult[];
};

type ResultsFile = {
  createdAt: string;
  options: Options;
  results: PresetResult[];
};

/** Metrics shown in the summary and comparison tables. `lowerIsBetter` decides the verdict. */
const METRICS: { name: string; lowerIsBetter: boolean; get: (r: ThreeDeeBenchmarkResult) => number }[] =
  [
    { name: "renderer total mean (ms)", lowerIsBetter: true, get: (r) => r.renderer.totalMs.mean },
    { name: "renderer total p90 (ms)", lowerIsBetter: true, get: (r) => r.renderer.totalMs.p90 },
    {
      name: "renderer messages mean (ms)",
      lowerIsBetter: true,
      get: (r) => r.renderer.messageProcessingMs.mean,
    },
    { name: "renderer render mean (ms)", lowerIsBetter: true, get: (r) => r.renderer.renderMs.mean },
    {
      name: "renderer gpu wait mean (ms)",
      lowerIsBetter: true,
      get: (r) => r.renderer.gpuWaitMs.mean,
    },
    { name: "pipeline frame p50 (ms)", lowerIsBetter: true, get: (r) => r.pipeline.frameMs.p50 },
    { name: "pipeline frame p90 (ms)", lowerIsBetter: true, get: (r) => r.pipeline.frameMs.p90 },
    { name: "pipeline fps", lowerIsBetter: false, get: (r) => r.pipeline.fps },
    { name: "animation fps", lowerIsBetter: false, get: (r) => r.animationFrames.fps },
    { name: "draw calls / frame", lowerIsBetter: true, get: (r) => r.renderer.drawCalls.mean },
    { name: "JS heap (MB)", lowerIsBetter: true, get: (r) => r.jsHeapUsedMB ?? NaN },
  ];

/** Changes smaller than this are reported as noise */
const NOISE_THRESHOLD = 0.05;

function parseArgs(argv: string[]): Options {
  const options: Options = {
    url: "http://localhost:8080",
    presets: Object.keys(PRESETS),
    query: "",
    runs: 3,
    out: "threedee-results.json",
    headed: false,
    timeoutSec: 180,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value == undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      return value;
    };
    switch (arg) {
      case "--url":
        options.url = next();
        break;
      case "--presets":
        options.presets = next().split(",");
        break;
      case "--query":
        options.query = next();
        break;
      case "--runs":
        options.runs = Number(next());
        break;
      case "--out":
        options.out = next();
        break;
      case "--compare":
        options.compare = next();
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--executable":
        options.executable = next();
        break;
      case "--timeout":
        options.timeoutSec = Number(next());
        break;
      default:
        throw new Error(`Unknown argument ${arg}`);
    }
  }
  for (const preset of options.presets) {
    if (!(preset in PRESETS)) {
      throw new Error(`Unknown preset ${preset}, expected one of ${Object.keys(PRESETS).join(", ")}`);
    }
  }
  return options;
}

function median(results: ThreeDeeBenchmarkResult[]): ThreeDeeBenchmarkResult {
  const sorted = [...results].sort((a, b) => a.renderer.totalMs.mean - b.renderer.totalMs.mean);
  return sorted[Math.floor(sorted.length / 2)]!;
}

async function runPreset(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  options: Options,
  preset: string,
): Promise<ThreeDeeBenchmarkResult> {
  // A fresh context per run, so layouts and caches from previous runs don't carry over
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => {
    console.error(`[${preset}] page error: ${err.message}`);
  });
  try {
    const query = new URLSearchParams(options.query);
    query.set("ds", "threedee");
    query.set("preset", preset);
    await page.goto(`${options.url}/?${query.toString()}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.benchmarkResult != undefined, undefined, {
      timeout: options.timeoutSec * 1000,
      polling: 1000,
    });
    return (await page.evaluate(() => window.benchmarkResult))!;
  } finally {
    await context.close();
  }
}

function fmt(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "-";
}

function printSummary(results: PresetResult[]): void {
  for (const { preset, median: result, runs } of results) {
    console.log(`\n=== ${preset} (median of ${runs.length} runs) ===`);
    const rows: Record<string, Record<string, string>> = {};
    for (const metric of METRICS) {
      const values = runs.map(metric.get);
      rows[metric.name] = {
        median: fmt(metric.get(result)),
        min: fmt(Math.min(...values)),
        max: fmt(Math.max(...values)),
      };
    }
    console.table(rows);
  }
}

function printComparison(baseline: ResultsFile, current: PresetResult[]): void {
  console.log(`\n=== Comparison against ${baseline.createdAt} ===`);
  console.log(
    `Changes within ±${NOISE_THRESHOLD * 100}% are marked as noise. ` +
      `Check the min/max spread of each run before trusting small differences.`,
  );
  for (const { preset, median: result } of current) {
    const base = baseline.results.find((r) => r.preset === preset);
    if (!base) {
      console.log(`\n${preset}: no baseline`);
      continue;
    }
    console.log(`\n--- ${preset} ---`);
    if (JSON.stringify(base.median.params) !== JSON.stringify(result.params)) {
      console.warn(
        "WARNING: parameters differ from the baseline run, so the results are not comparable",
      );
    }
    if (base.median.environment.gpu !== result.environment.gpu) {
      console.warn(
        `WARNING: GPU differs from the baseline run (${base.median.environment.gpu} vs ` +
          `${result.environment.gpu})`,
      );
    }
    const rows: Record<string, Record<string, string>> = {};
    for (const metric of METRICS) {
      const before = metric.get(base.median);
      const after = metric.get(result);
      const change = before === 0 ? NaN : (after - before) / before;
      let verdict = "noise";
      if (!Number.isFinite(change)) {
        verdict = "-";
      } else if (Math.abs(change) >= NOISE_THRESHOLD) {
        const improved = metric.lowerIsBetter ? change < 0 : change > 0;
        verdict = improved ? "better" : "WORSE";
      }
      rows[metric.name] = {
        baseline: fmt(before),
        current: fmt(after),
        change: Number.isFinite(change) ? `${(change * 100).toFixed(1)}%` : "-",
        verdict,
      };
    }
    console.table(rows);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch({
    headless: !options.headed,
    executablePath: options.executable,
    args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--disable-frame-rate-limit"],
  });

  const results: PresetResult[] = [];
  try {
    for (const preset of options.presets) {
      const runs: ThreeDeeBenchmarkResult[] = [];
      for (let run = 0; run < options.runs; run++) {
        console.log(`Running ${preset} (${run + 1}/${options.runs})…`);
        const result = await runPreset(browser, options, preset);
        console.log(
          `  renderer total mean ${fmt(result.renderer.totalMs.mean)}ms, ` +
            `pipeline ${fmt(result.pipeline.fps)} fps, GPU: ${result.environment.gpu}`,
        );
        runs.push(result);
      }
      results.push({ preset, median: median(runs), runs });
    }
  } finally {
    await browser.close();
  }

  const gpu = results[0]?.median.environment.gpu ?? "";
  if (/swiftshader|llvmpipe|software/i.test(gpu)) {
    console.warn(
      `\nWARNING: rendering used a software rasterizer (${gpu}). GPU-bound results will not ` +
        `reflect real hardware; try --headed on a machine with a GPU.`,
    );
  }

  printSummary(results);

  const file: ResultsFile = { createdAt: new Date().toISOString(), options, results };
  fs.writeFileSync(options.out, JSON.stringify(file, undefined, 2));
  console.log(`\nWrote ${options.out}`);

  if (options.compare) {
    const baseline = JSON.parse(fs.readFileSync(options.compare, "utf8")) as ResultsFile;
    printComparison(baseline, results);
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
