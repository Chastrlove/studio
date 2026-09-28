// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useMemo, useState } from "react";

import {
  SharedRoot,
  IDataSourceFactory,
  AppSetting,
  LaunchPreferenceValue,
  StudioApp,
} from "@foxglove/studio-base";

import { McapLocalBenchmarkDataSourceFactory, SyntheticDataSourceFactory } from "./dataSources";
import { LAYOUTS } from "./layouts";
import {
  PointcloudPlayer,
  SinewavePlayer,
  ThreeDeePlayer,
  TransformPlayer,
  TransformPreloadingPlayer,
} from "./players";
import { MemoryAppConfiguration } from "./services";
import { makeThreeDeeLayout } from "./threeDee/layout";
import { parseThreeDeeParams } from "./threeDee/params";

export function Root(): JSX.Element {
  const [threeDeeParams] = useState(() => parseThreeDeeParams(window.location.search));
  const [appConfiguration] = useState(() => {
    const isThreeDee = new URLSearchParams(window.location.search).get("ds") === "threedee";
    return new MemoryAppConfiguration({
      defaults: {
        [AppSetting.LAUNCH_PREFERENCE]: LaunchPreferenceValue.WEB,
        [AppSetting.MESSAGE_RATE]: isThreeDee ? threeDeeParams.rate : 240,
      },
    });
  });

  const dataSources: IDataSourceFactory[] = useMemo(() => {
    const sources = [
      new McapLocalBenchmarkDataSourceFactory(),
      new SyntheticDataSourceFactory(
        "pointcloud",
        PointcloudPlayer,
        LAYOUTS.pointCloudMultipleThreeDee,
      ),
      new SyntheticDataSourceFactory("sinewave", SinewavePlayer, LAYOUTS.sinewave),
      new SyntheticDataSourceFactory("transform", TransformPlayer, LAYOUTS.multipleThreeDee),
      new SyntheticDataSourceFactory(
        "transformpreloading",
        TransformPreloadingPlayer,
        LAYOUTS.transformPreloading,
      ),
      new SyntheticDataSourceFactory(
        "threedee",
        ThreeDeePlayer,
        makeThreeDeeLayout(threeDeeParams),
      ),
    ];

    return sources;
  }, [threeDeeParams]);

  const url = new URL(window.location.href);

  return (
    <SharedRoot
      enableLaunchPreferenceScreen={false}
      deepLinks={[url.href]}
      dataSources={dataSources}
      appConfiguration={appConfiguration}
    >
      <StudioApp />
    </SharedRoot>
  );
}
