// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { LayoutData } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";

import { FIXED_FRAME, TOPICS, ThreeDeeParams } from "./params";

type MosaicNode = NonNullable<LayoutData["layout"]>;

/** Split panels into a balanced tree, alternating row and column splits */
function makeMosaic(panelIds: string[], depth = 0): MosaicNode {
  if (panelIds.length === 1) {
    return panelIds[0]!;
  }
  const mid = Math.ceil(panelIds.length / 2);
  return {
    direction: depth % 2 === 0 ? "row" : "column",
    first: makeMosaic(panelIds.slice(0, mid), depth + 1),
    second: makeMosaic(panelIds.slice(mid), depth + 1),
  };
}

/** Build a layout of `params.panels` 3D panels, each showing every benchmark topic */
export function makeThreeDeeLayout(params: ThreeDeeParams): LayoutData {
  const topics: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < params.clouds; i++) {
    topics[TOPICS.cloud(i)] = {
      visible: true,
      pointSize: 2,
      colorField: "rgba",
      colorMode: "rgba",
    };
  }
  if (params.entities > 0) {
    topics[TOPICS.scene] = { visible: true };
  }
  for (let i = 0; i < params.scans; i++) {
    topics[TOPICS.scan(i)] = {
      visible: true,
      pointSize: 3,
      colorField: "intensity",
      colorMode: "colormap",
      colorMap: "turbo",
    };
  }
  if (params.grid > 0) {
    topics[TOPICS.grid] = { visible: true, colorField: "value", colorMode: "colormap" };
  }

  const panelConfig = {
    cameraState: {
      perspective: true,
      distance: 60,
      phi: 50,
      thetaOffset: 45,
      targetOffset: [0, 0, 0],
      target: [0, 0, 0],
      targetOrientation: [0, 0, 0, 1],
      fovy: 45,
      near: 0.01,
      far: 5000,
    },
    followMode: "follow-none",
    followTf: FIXED_FRAME,
    scene: {},
    transforms: {},
    topics,
    publish: { type: "point" },
  };

  const panelIds = Array.from({ length: params.panels }, (_, i) => `3D!bench${i}`);
  return {
    configById: Object.fromEntries(panelIds.map((id) => [id, panelConfig])),
    layout: makeMosaic(panelIds),
    globalVariables: {},
    userNodes: {},
  };
}
