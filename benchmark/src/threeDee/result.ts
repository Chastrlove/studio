// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import type { ThreeDeeParams } from "./params";
import type { Summary } from "../stats";

export type ThreeDeeBenchmarkResult = {
  scenario: "threedee";
  preset: string;
  params: ThreeDeeParams;
  environment: {
    userAgent: string;
    gpu: string;
    devicePixelRatio: number;
    viewport: { width: number; height: number };
  };
  measuredMs: number;
  /** Time for the message pipeline to deliver a frame and for all panels to finish rendering it */
  pipeline: {
    frames: number;
    fps: number;
    frameMs: Summary;
    slowFrames: number;
  };
  /** Browser animation frames, i.e. what the user actually sees */
  animationFrames: {
    fps: number;
    intervalMs: Summary;
    slowFrames: number;
  };
  /** Per-panel 3D Renderer frame statistics */
  renderer: {
    renderersSeen: number;
    framesPerRendererPerSec: number;
    messageProcessingMs: Summary;
    renderMs: Summary;
    gpuWaitMs: Summary;
    totalMs: Summary;
    drawCalls: Summary;
    triangles: Summary;
    points: Summary;
  };
  jsHeapUsedMB?: number;
};

declare global {
  interface Window {
    /** Set when a benchmark run completes, for automated runners */
    benchmarkResult?: ThreeDeeBenchmarkResult;
    /** Invoked when a benchmark run completes, for automated runners */
    onBenchmarkComplete?: (result: ThreeDeeBenchmarkResult) => void;
  }
}
