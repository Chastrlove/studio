// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Time } from "@foxglove/rostime";
import {
  Color,
  FrameTransform,
  FrameTransforms,
  Grid,
  LaserScan,
  LineType,
  NumericType,
  PointCloud,
  Pose,
  SceneEntity,
  SceneUpdate,
} from "@foxglove/schemas";

import { FIXED_FRAME, SENSOR_FRAME, ThreeDeeParams, linkFrame } from "./params";

/** Number of precomputed variants per point cloud, cycled through so every frame uploads new data */
const CLOUD_VARIANTS = 4;
const POINT_STRIDE = 16;

const IDENTITY_POSE: Pose = {
  position: { x: 0, y: 0, z: 0 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
};

function yawQuaternion(yaw: number): Pose["orientation"] {
  return { x: 0, y: 0, z: Math.sin(yaw / 2), w: Math.cos(yaw / 2) };
}

function hsvToColor(h: number, a = 1): Color {
  const k = (n: number) => (n + h * 6) % 6;
  const f = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return { r: f(5), g: f(3), b: f(1), a };
}

function packRgba(color: Color): number {
  return (
    ((Math.trunc(color.r * 255) << 24) |
      (Math.trunc(color.g * 255) << 16) |
      (Math.trunc(color.b * 255) << 8) |
      Math.trunc(color.a * 255)) >>>
    0
  );
}

function makeCloudData(pointCount: number, cloudIndex: number, variant: number): Uint8Array {
  const data = new Uint8Array(pointCount * POINT_STRIDE);
  const view = new DataView(data.buffer);
  const side = Math.max(1, Math.ceil(Math.sqrt(pointCount)));
  const spacing = 20 / side;
  const phase = (variant / CLOUD_VARIANTS) * 2 * Math.PI;
  for (let i = 0; i < pointCount; i++) {
    const col = i % side;
    const row = Math.floor(i / side);
    const x = col * spacing - 10;
    const y = row * spacing - 10;
    const z = Math.sin(x * 0.5 + phase) * Math.cos(y * 0.5) + cloudIndex * 2;
    const offset = i * POINT_STRIDE;
    view.setFloat32(offset + 0, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);
    view.setUint32(offset + 12, packRgba(hsvToColor((z + 1) / 4 - Math.floor((z + 1) / 4))), true);
  }
  return data;
}

function makeGridData(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const view = new DataView(data.buffer);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const value = Math.sin(col / 8) * Math.cos(row / 8);
      view.setFloat32((row * size + col) * 4, value, true);
    }
  }
  return data;
}

/** Generates the messages for each frame of the `threedee` benchmark */
export class ThreeDeeMessageGenerator {
  #params: ThreeDeeParams;
  #cloudData: Uint8Array[][];
  #gridData: Uint8Array;

  public constructor(params: ThreeDeeParams) {
    this.#params = params;
    this.#cloudData = [];
    for (let cloud = 0; cloud < params.clouds; cloud++) {
      const variants: Uint8Array[] = [];
      for (let variant = 0; variant < CLOUD_VARIANTS; variant++) {
        variants.push(makeCloudData(params.points, cloud, variant));
      }
      this.#cloudData.push(variants);
    }
    this.#gridData = makeGridData(params.grid);
  }

  public transforms(stamp: Time, frame: number): FrameTransforms {
    const transforms: FrameTransform[] = [];
    const depth = this.#params.tfDepth;
    let parent = FIXED_FRAME;
    for (let i = 0; i < depth; i++) {
      const child = linkFrame(i);
      transforms.push({
        timestamp: stamp,
        parent_frame_id: parent,
        child_frame_id: child,
        translation: { x: i === 0 ? 0 : 0.01, y: 0, z: 0 },
        // Only the first link moves, so the scene stays in view regardless of depth
        rotation: yawQuaternion(i === 0 ? frame * 0.01 : 0),
      });
      parent = child;
    }
    transforms.push({
      timestamp: stamp,
      parent_frame_id: parent,
      child_frame_id: SENSOR_FRAME,
      translation: { x: 0, y: 0, z: 1 },
      rotation: yawQuaternion(0),
    });
    return { transforms };
  }

  public pointCloud(stamp: Time, frame: number, cloudIndex: number): PointCloud {
    const variants = this.#cloudData[cloudIndex]!;
    return {
      timestamp: stamp,
      frame_id: SENSOR_FRAME,
      pose: IDENTITY_POSE,
      point_stride: POINT_STRIDE,
      fields: [
        { name: "x", offset: 0, type: NumericType.FLOAT32 },
        { name: "y", offset: 4, type: NumericType.FLOAT32 },
        { name: "z", offset: 8, type: NumericType.FLOAT32 },
        { name: "rgba", offset: 12, type: NumericType.UINT32 },
      ],
      data: variants[frame % variants.length]!,
    };
  }

  public sceneUpdate(stamp: Time, frame: number): SceneUpdate {
    const { entities: entityCount, texts } = this.#params;
    const side = Math.max(1, Math.ceil(Math.sqrt(entityCount)));
    const entities: SceneEntity[] = [];
    for (let i = 0; i < entityCount; i++) {
      const x = (i % side) * 1.5 - side * 0.75;
      const y = Math.floor(i / side) * 1.5 - side * 0.75;
      const z = 0.5 + 0.25 * Math.sin(frame * 0.05 + i);
      const color = hsvToColor(i / entityCount, 0.9);
      const pose: Pose = { position: { x, y, z }, orientation: yawQuaternion(frame * 0.02 + i) };
      entities.push({
        timestamp: stamp,
        frame_id: FIXED_FRAME,
        id: `entity_${i}`,
        lifetime: { sec: 0, nsec: 0 },
        frame_locked: false,
        metadata: [],
        arrows: [
          {
            pose: { position: { x, y, z: z + 0.6 }, orientation: pose.orientation },
            shaft_length: 0.4,
            shaft_diameter: 0.05,
            head_length: 0.15,
            head_diameter: 0.12,
            color,
          },
        ],
        cubes: [{ pose, size: { x: 0.4, y: 0.4, z: 0.4 }, color }],
        spheres: [
          {
            pose: { position: { x: x + 0.5, y, z }, orientation: pose.orientation },
            size: { x: 0.3, y: 0.3, z: 0.3 },
            color,
          },
        ],
        cylinders: [],
        lines: [
          {
            type: LineType.LINE_STRIP,
            pose: IDENTITY_POSE,
            thickness: 0.02,
            scale_invariant: false,
            points: [
              { x, y, z: 0 },
              { x, y, z },
              { x: x + 0.5, y, z },
            ],
            color,
            colors: [],
            indices: [],
          },
        ],
        triangles: [],
        texts:
          i < texts
            ? [
                {
                  pose: { position: { x, y, z: z + 1 }, orientation: IDENTITY_POSE.orientation },
                  billboard: true,
                  font_size: 12,
                  scale_invariant: true,
                  color: { r: 1, g: 1, b: 1, a: 1 },
                  text: `entity ${i} @ ${frame}`,
                },
              ]
            : [],
        models: [],
      });
    }
    return { deletions: [], entities };
  }

  public laserScan(stamp: Time, frame: number, scanIndex: number): LaserScan {
    const beams = this.#params.beams;
    const ranges: number[] = new Array(beams);
    const intensities: number[] = new Array(beams);
    for (let i = 0; i < beams; i++) {
      ranges[i] = 8 + 2 * Math.sin((i / beams) * 16 * Math.PI + frame * 0.1 + scanIndex);
      intensities[i] = i % 256;
    }
    return {
      timestamp: stamp,
      frame_id: SENSOR_FRAME,
      pose: {
        position: { x: 0, y: 0, z: 0.1 * scanIndex },
        orientation: IDENTITY_POSE.orientation,
      },
      start_angle: -Math.PI,
      end_angle: Math.PI,
      ranges,
      intensities,
    };
  }

  public grid(stamp: Time): Grid {
    const size = this.#params.grid;
    return {
      timestamp: stamp,
      frame_id: FIXED_FRAME,
      pose: {
        position: { x: -size * 0.05, y: -size * 0.05, z: -0.5 },
        orientation: IDENTITY_POSE.orientation,
      },
      column_count: size,
      cell_size: { x: 0.1, y: 0.1 },
      row_stride: size * 4,
      cell_stride: 4,
      fields: [{ name: "value", offset: 0, type: NumericType.FLOAT32 }],
      data: this.#gridData,
    };
  }
}
