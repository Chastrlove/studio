// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { LayoutData } from "@foxglove/studio-base/context/CurrentLayoutContext/actions";

import DefaultMultipleThreeDee from "./layouts/DefaultMultipleThreeDee.json";
import Empty from "./layouts/Empty.json";
import PointcloudMultipleThreeDee from "./layouts/PointcloudMultipleThreeDee.json";
import PointcloudRawMessageAnd3d from "./layouts/PointcloudRawMessageAnd3d.json";
import SinewaveSinglePlot from "./layouts/SinewaveSinglePlot.json";
import TransformPreloading from "./layouts/TransformPreloading.json";

function makeLayoutData(
  partialData: Pick<LayoutData, "configById"> & { layout?: unknown },
): LayoutData {
  return {
    configById: partialData.configById,
    // JSON imports widen the mosaic direction to `string`
    layout: partialData.layout as LayoutData["layout"],
    globalVariables: {},
    userNodes: {},
  };
}

const LAYOUTS: Record<string, LayoutData> = {
  multipleThreeDee: makeLayoutData(DefaultMultipleThreeDee),
  empty: makeLayoutData(Empty),
  sinewave: makeLayoutData(SinewaveSinglePlot),
  pointCloudRawMessage: makeLayoutData(PointcloudRawMessageAnd3d),
  pointCloudMultipleThreeDee: makeLayoutData(PointcloudMultipleThreeDee),
  transformPreloading: makeLayoutData(TransformPreloading),
};

export { LAYOUTS };
