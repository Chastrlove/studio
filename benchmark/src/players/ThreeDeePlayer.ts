// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import Log from "@foxglove/log";
import { Time } from "@foxglove/rostime";
import { MessageEvent } from "@foxglove/studio";
import { GlobalVariables } from "@foxglove/studio-base/hooks/useGlobalVariables";
import {
  AdvertiseOptions,
  Player,
  PlayerPresence,
  PlayerState,
  PublishPayload,
  SubscribePayload,
  Topic,
  TopicStats,
} from "@foxglove/studio-base/players/types";
import { RosDatatypes } from "@foxglove/studio-base/types/RosDatatypes";

import { now } from "./time";
import { ThreeDeeBenchmarkRecorder } from "../threeDee/ThreeDeeBenchmarkRecorder";
import { ThreeDeeMessageGenerator } from "../threeDee/messages";
import { TOPICS, ThreeDeeParams, parseThreeDeeParams } from "../threeDee/params";

const log = Log.getLogger(__filename);

const CAPABILITIES: string[] = [];

/**
 * Plays synthetic data covering the main 3D panel workloads: a transform tree, point clouds, scene
 * entities (cubes, spheres, arrows, lines, text), laser scans and a grid. Every frame carries a
 * new message on every topic. Playback stops once the benchmark finishes measuring.
 */
class ThreeDeePlayer implements Player {
  #name = "threedee";
  #listener?: (state: PlayerState) => Promise<void>;
  #datatypes: RosDatatypes = new Map();
  #params: ThreeDeeParams;
  #closed = false;

  public constructor() {
    this.#params = parseThreeDeeParams(window.location.search);
  }

  public setListener(listener: (state: PlayerState) => Promise<void>): void {
    this.#listener = listener;
    void this.#run();
  }
  public close(): void {
    this.#closed = true;
  }
  public setSubscriptions(_subscriptions: SubscribePayload[]): void {}
  public setPublishers(_publishers: AdvertiseOptions[]): void {
    // no-op
  }
  public setParameter(_key: string, _value: unknown): void {
    throw new Error("Method not implemented.");
  }
  public publish(_request: PublishPayload): void {
    throw new Error("Method not implemented.");
  }
  public async callService(_service: string, _request: unknown): Promise<unknown> {
    throw new Error("Method not implemented.");
  }
  public setGlobalVariables(_globalVariables: GlobalVariables): void {
    // no-op
  }

  #topics(): Topic[] {
    const params = this.#params;
    const topics: Topic[] = [{ name: TOPICS.tf, schemaName: "foxglove.FrameTransforms" }];
    for (let i = 0; i < params.clouds; i++) {
      topics.push({ name: TOPICS.cloud(i), schemaName: "foxglove.PointCloud" });
    }
    if (params.entities > 0) {
      topics.push({ name: TOPICS.scene, schemaName: "foxglove.SceneUpdate" });
    }
    for (let i = 0; i < params.scans; i++) {
      topics.push({ name: TOPICS.scan(i), schemaName: "foxglove.LaserScan" });
    }
    if (params.grid > 0) {
      topics.push({ name: TOPICS.grid, schemaName: "foxglove.Grid" });
    }
    return topics;
  }

  #messages(generator: ThreeDeeMessageGenerator, stamp: Time, frame: number): MessageEvent[] {
    const params = this.#params;
    const messages: MessageEvent[] = [];
    const push = (topic: string, schemaName: string, message: unknown, sizeInBytes: number) => {
      messages.push({ topic, schemaName, receiveTime: stamp, message, sizeInBytes });
    };

    push(TOPICS.tf, "foxglove.FrameTransforms", generator.transforms(stamp, frame), 0);
    for (let i = 0; i < params.clouds; i++) {
      const cloud = generator.pointCloud(stamp, frame, i);
      push(TOPICS.cloud(i), "foxglove.PointCloud", cloud, cloud.data.byteLength);
    }
    if (params.entities > 0) {
      push(TOPICS.scene, "foxglove.SceneUpdate", generator.sceneUpdate(stamp, frame), 0);
    }
    for (let i = 0; i < params.scans; i++) {
      push(TOPICS.scan(i), "foxglove.LaserScan", generator.laserScan(stamp, frame, i), 0);
    }
    if (params.grid > 0) {
      const grid = generator.grid(stamp);
      push(TOPICS.grid, "foxglove.Grid", grid, grid.data.byteLength);
    }
    return messages;
  }

  async #run() {
    const listener = this.#listener;
    if (!listener) {
      throw new Error("Invariant: listener is not set");
    }

    log.info("Initializing 3D benchmark player", this.#params);

    await listener({
      profile: undefined,
      presence: PlayerPresence.PRESENT,
      name: this.#name,
      playerId: this.#name,
      capabilities: CAPABILITIES,
      progress: {},
      urlState: {
        sourceId: this.#name,
      },
    });

    const generator = new ThreeDeeMessageGenerator(this.#params);
    const recorder = new ThreeDeeBenchmarkRecorder(this.#params);
    const topics = this.#topics();
    const topicStats = new Map<string, TopicStats>();

    let startTime: Time | undefined;
    let totalBytesReceived = 0;
    recorder.start();

    for (let frame = 0; !this.#closed; frame++) {
      const stamp = now();
      startTime ??= stamp;

      const messages = this.#messages(generator, stamp, frame);
      for (const msg of messages) {
        totalBytesReceived += msg.sizeInBytes;
        topicStats.set(msg.topic, {
          numMessages: frame + 1,
          firstMessageTime: startTime,
          lastMessageTime: stamp,
        });
      }

      const isPlaying = !recorder.isDone();
      const frameStartMs = performance.now();
      await listener({
        profile: undefined,
        presence: PlayerPresence.PRESENT,
        name: this.#name,
        playerId: this.#name,
        capabilities: CAPABILITIES,
        progress: {},
        activeData: {
          messages: isPlaying ? messages : [],
          totalBytesReceived,
          currentTime: stamp,
          startTime,
          isPlaying,
          repeatEnabled: false,
          speed: 1,
          lastSeekTime: 1,
          endTime: stamp,
          topics,
          topicStats: new Map(topicStats),
          datatypes: this.#datatypes,
        },
      });
      recorder.recordPipelineFrame(performance.now() - frameStartMs);

      if (!isPlaying) {
        // The final state with isPlaying=false has been emitted; stop generating frames.
        break;
      }
    }
  }
}

export { ThreeDeePlayer };
