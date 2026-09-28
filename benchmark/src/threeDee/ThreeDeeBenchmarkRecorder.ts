// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import Log from "@foxglove/log";
import {
  RendererFrameStats,
  setRendererFrameStatsListener,
} from "@foxglove/studio-base/panels/ThreeDeeRender/RendererFrameStats";

import { ThreeDeeParams } from "./params";
import { ThreeDeeBenchmarkResult } from "./result";
import { Summary, summarize } from "../stats";

const log = Log.getLogger(__filename);

/** Frames slower than this count as dropped frames (two 60Hz vsync intervals) */
const SLOW_FRAME_MS = 1000 / 30;

type Phase = "idle" | "warmup" | "measuring" | "done";

function describeGpu(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) {
      return "WebGL2 unavailable";
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return String(renderer);
  } catch (err) {
    return `unknown (${String(err)})`;
  }
}

/**
 * Collects statistics for the `threedee` benchmark: message pipeline frame times, per-panel
 * renderer timings and browser animation frame intervals. Samples collected during warmup are
 * discarded.
 */
export class ThreeDeeBenchmarkRecorder {
  #params: ThreeDeeParams;
  #phase: Phase = "idle";
  #phaseStartMs = 0;

  #pipelineFrameMs: number[] = [];
  #rafIntervalsMs: number[] = [];
  #rafHandle?: number;
  #lastRafMs?: number;
  #rendererIds = new Set<number>();
  #rendererFrames: RendererFrameStats[] = [];

  public constructor(params: ThreeDeeParams) {
    this.#params = params;
  }

  public isDone(): boolean {
    return this.#phase === "done";
  }

  public start(): void {
    this.#phase = "warmup";
    this.#phaseStartMs = performance.now();
    setRendererFrameStatsListener({
      waitForGpu: this.#params.gpuSync === 1,
      onFrame: (rendererId, stats) => {
        if (this.#phase === "measuring") {
          this.#rendererIds.add(rendererId);
          this.#rendererFrames.push(stats);
        }
      },
    });
    log.info(`Warming up for ${this.#params.warmup}s`);
  }

  /** Record one message pipeline frame. Call after the player listener resolves. */
  public recordPipelineFrame(durationMs: number): void {
    const nowMs = performance.now();
    const elapsedMs = nowMs - this.#phaseStartMs;
    if (this.#phase === "warmup") {
      if (elapsedMs >= this.#params.warmup * 1000) {
        this.#beginMeasuring(nowMs);
      }
      return;
    }
    if (this.#phase !== "measuring") {
      return;
    }
    this.#pipelineFrameMs.push(durationMs);
    if (elapsedMs >= this.#params.duration * 1000) {
      this.#finish(elapsedMs);
    }
  }

  #beginMeasuring(nowMs: number): void {
    log.info(`Measuring for ${this.#params.duration}s`);
    this.#phase = "measuring";
    this.#phaseStartMs = nowMs;
    performance.mark("threedee-measure-start");
    const onAnimationFrame = (timestampMs: number) => {
      if (this.#lastRafMs != undefined) {
        this.#rafIntervalsMs.push(timestampMs - this.#lastRafMs);
      }
      this.#lastRafMs = timestampMs;
      this.#rafHandle = requestAnimationFrame(onAnimationFrame);
    };
    this.#rafHandle = requestAnimationFrame(onAnimationFrame);
  }

  #finish(measuredMs: number): void {
    this.#phase = "done";
    performance.mark("threedee-measure-end");
    performance.measure("threedee-measure", "threedee-measure-start", "threedee-measure-end");
    setRendererFrameStatsListener(undefined);
    if (this.#rafHandle != undefined) {
      cancelAnimationFrame(this.#rafHandle);
    }

    const measuredSec = measuredMs / 1000;
    const frames = this.#rendererFrames;
    const pick = (key: keyof RendererFrameStats) => summarize(frames.map((frame) => frame[key]));
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;

    const result: ThreeDeeBenchmarkResult = {
      scenario: "threedee",
      preset: new URLSearchParams(window.location.search).get("preset") ?? "full",
      params: this.#params,
      environment: {
        userAgent: navigator.userAgent,
        gpu: describeGpu(),
        devicePixelRatio: window.devicePixelRatio,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      },
      measuredMs,
      pipeline: {
        frames: this.#pipelineFrameMs.length,
        fps: this.#pipelineFrameMs.length / measuredSec,
        frameMs: summarize(this.#pipelineFrameMs),
        slowFrames: this.#pipelineFrameMs.filter((ms) => ms > SLOW_FRAME_MS).length,
      },
      animationFrames: {
        fps: this.#rafIntervalsMs.length / measuredSec,
        intervalMs: summarize(this.#rafIntervalsMs),
        slowFrames: this.#rafIntervalsMs.filter((ms) => ms > SLOW_FRAME_MS).length,
      },
      renderer: {
        renderersSeen: this.#rendererIds.size,
        framesPerRendererPerSec: frames.length / Math.max(1, this.#rendererIds.size) / measuredSec,
        messageProcessingMs: pick("messageProcessingMs"),
        renderMs: pick("renderMs"),
        gpuWaitMs: pick("gpuWaitMs"),
        totalMs: pick("totalMs"),
        drawCalls: pick("drawCalls"),
        triangles: pick("triangles"),
        points: pick("points"),
      },
      jsHeapUsedMB: memory ? memory.usedJSHeapSize / 1024 / 1024 : undefined,
    };

    this.#print(result);
    window.benchmarkResult = result;
    window.onBenchmarkComplete?.(result);
  }

  #print(result: ThreeDeeBenchmarkResult): void {
    const row = (summary: Summary) => ({
      mean: summary.mean.toFixed(2),
      p50: summary.p50.toFixed(2),
      p90: summary.p90.toFixed(2),
      p99: summary.p99.toFixed(2),
      max: summary.max.toFixed(2),
      count: summary.count,
    });
    log.info(
      `3D benchmark done: pipeline ${result.pipeline.fps.toFixed(1)} fps, ` +
        `rAF ${result.animationFrames.fps.toFixed(1)} fps, ` +
        `${result.renderer.renderersSeen} renderers at ` +
        `${result.renderer.framesPerRendererPerSec.toFixed(1)} fps each, GPU: ${
          result.environment.gpu
        }`,
    );
    // eslint-disable-next-line no-restricted-syntax
    console.table({
      "pipeline frame (ms)": row(result.pipeline.frameMs),
      "rAF interval (ms)": row(result.animationFrames.intervalMs),
      "renderer messages (ms)": row(result.renderer.messageProcessingMs),
      "renderer render (ms)": row(result.renderer.renderMs),
      "renderer gpu wait (ms)": row(result.renderer.gpuWaitMs),
      "renderer total (ms)": row(result.renderer.totalMs),
      "draw calls": row(result.renderer.drawCalls),
    });
    // eslint-disable-next-line no-restricted-syntax
    console.log(JSON.stringify(result));
  }
}
