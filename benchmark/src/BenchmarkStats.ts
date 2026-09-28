// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
import Log from "@foxglove/log";

import { summarize } from "./stats";

const log = Log.getLogger(__filename);

type Sample = {
  stamp: number;
  value: number;
};

type RecordFrameTimesFn = (frameTimes: Sample[]) => void;

class BenchmarkStats {
  static #instance: BenchmarkStats | undefined;

  #frameTimesMs: Sample[] = [];

  private constructor() {}

  public recordFrameTime(durationMs: number): void {
    this.#frameTimesMs.push({
      stamp: Date.now() / 1_000,
      value: durationMs,
    });

    if (this.#frameTimesMs.length >= 100) {
      const stats = summarize(this.#frameTimesMs.map((sample) => sample.value));

      log.info(
        `Frame time (filtered) average: ${stats.mean}, median: ${stats.p50}, P90: ${stats.p90}, stddev: ${stats.stddev}`,
      );

      const record = (window as { recordFrameTimes?: RecordFrameTimesFn }).recordFrameTimes;
      record?.(this.#frameTimesMs);

      this.#frameTimesMs.length = 0;
    }
  }

  /** Return an instance of BenchmarkStats */
  public static Instance(): BenchmarkStats {
    BenchmarkStats.#instance = BenchmarkStats.#instance ?? new BenchmarkStats();
    return BenchmarkStats.#instance;
  }
}

export { BenchmarkStats };
