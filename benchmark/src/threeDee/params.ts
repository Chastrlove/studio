// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/**
 * Parameters for the `threedee` benchmark. Each parameter can be overridden with a URL query
 * parameter of the same name, e.g. `?ds=threedee&points=500000&panels=1`.
 */
export type ThreeDeeParams = {
  /** Number of 3D panels in the layout. Each panel subscribes to every topic. */
  panels: number;
  /** Number of point cloud topics */
  clouds: number;
  /** Points per point cloud message */
  points: number;
  /** Scene entities in the SceneUpdate message. Each entity has a cube, a sphere, an arrow and a line strip. */
  entities: number;
  /** Scene entities which also carry a text label */
  texts: number;
  /** Number of LaserScan topics */
  scans: number;
  /** Beams per LaserScan message */
  beams: number;
  /** Grid width and height in cells; 0 disables the grid topic */
  grid: number;
  /** Depth of the transform tree between the fixed frame and the sensor frame */
  tfDepth: number;
  /** Seconds of playback before measurement starts */
  warmup: number;
  /** Seconds of measured playback */
  duration: number;
  /** Pipeline message rate (frames per second cap) */
  rate: number;
  /** When 1, wait for the GPU after each frame so GPU execution time is measured */
  gpuSync: number;
};

const DEFAULTS: ThreeDeeParams = {
  panels: 4,
  clouds: 2,
  points: 100_000,
  entities: 500,
  texts: 50,
  scans: 1,
  beams: 1080,
  grid: 256,
  tfDepth: 10,
  warmup: 3,
  duration: 15,
  rate: 240,
  gpuSync: 0,
};

const NO_LOAD: Partial<ThreeDeeParams> = {
  clouds: 0,
  entities: 0,
  texts: 0,
  scans: 0,
  grid: 0,
};

/**
 * Named parameter sets, selected with `?preset=<name>`. Most presets load a single workload so a
 * change to one part of the 3D panel can be measured in isolation. Individual query parameters
 * override preset values.
 */
export const PRESETS: Record<string, Partial<ThreeDeeParams>> = {
  /** Every workload at once, with default sizes */
  full: {},
  /** Large point clouds: point cloud parsing, buffer upload and point rendering */
  pointclouds: { ...NO_LOAD, clouds: 4, points: 500_000 },
  /** Many scene entities without labels: SceneUpdate handling and primitive rendering */
  entities: { ...NO_LOAD, entities: 3000 },
  /** Text labels: label texture generation and rendering */
  texts: { ...NO_LOAD, entities: 500, texts: 500 },
  /** Many laser scans */
  laserscans: { ...NO_LOAD, scans: 8, beams: 4000 },
  /** A large grid: texture upload */
  grid: { ...NO_LOAD, grid: 1024 },
  /** A deep transform tree: transform lookups for every rendered object */
  transforms: { ...NO_LOAD, clouds: 1, points: 10_000, entities: 200, tfDepth: 200 },
  /** Fixed per-panel load with a single panel, compare with `panels9` to see scaling */
  panels1: { panels: 1 },
  panels9: { panels: 9 },
};

export function parseThreeDeeParams(search: string): ThreeDeeParams {
  const query = new URLSearchParams(search);
  const presetName = query.get("preset") ?? "full";
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(
      `Unknown benchmark preset ${presetName}, expected one of ${Object.keys(PRESETS).join(", ")}`,
    );
  }
  const params = { ...DEFAULTS, ...preset };
  for (const key of Object.keys(DEFAULTS) as (keyof ThreeDeeParams)[]) {
    const raw = query.get(key);
    if (raw == undefined) {
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid value for benchmark parameter ${key}: ${raw}`);
    }
    params[key] = value;
  }
  params.panels = Math.max(1, Math.floor(params.panels));
  params.texts = Math.min(params.texts, params.entities);
  return params;
}

export const TOPICS = {
  tf: "/tf",
  scene: "/scene",
  grid: "/grid",
  cloud: (index: number): string => `/cloud_${index}`,
  scan: (index: number): string => `/scan_${index}`,
};

export const FIXED_FRAME = "map";
export const SENSOR_FRAME = "sensor";

export function linkFrame(index: number): string {
  return `link_${index}`;
}
