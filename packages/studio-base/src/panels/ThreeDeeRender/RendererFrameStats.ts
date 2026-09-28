// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/** Per-frame timing and draw statistics reported by a 3D panel Renderer */
export type RendererFrameStats = {
  /** Time spent running subscription handlers for queued messages */
  messageProcessingMs: number;
  /** Time spent updating scene extensions and issuing WebGL draw calls */
  renderMs: number;
  /** Time spent waiting for the GPU to finish, only measured when `waitForGpu` is set */
  gpuWaitMs: number;
  /** Total time spent in the renderer frame handler */
  totalMs: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
};

type RendererFrameStatsListener = {
  onFrame: (rendererId: number, stats: RendererFrameStats) => void;
  /**
   * When true, the renderer blocks after each frame until the GPU has finished all submitted work,
   * so that `gpuWaitMs` reflects GPU execution time. This is slow and only intended for benchmarks.
   */
  waitForGpu: boolean;
};

let listener: RendererFrameStatsListener | undefined;

/**
 * Install a listener that receives per-frame statistics from every 3D panel Renderer. Stats are
 * only collected while a listener is installed, so this has no cost in normal use. Pass undefined
 * to remove the listener.
 */
// ts-unused-exports:disable-next-line
export function setRendererFrameStatsListener(
  newListener: RendererFrameStatsListener | undefined,
): void {
  listener = newListener;
}

export function getRendererFrameStatsListener(): RendererFrameStatsListener | undefined {
  return listener;
}
