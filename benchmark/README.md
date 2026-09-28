# Foxglove Studio Benchmarking

Benchmarks are specific combinations of layout and synthetic data playback. When a benchmark is opened, playback automatically starts and summary results are printed to the developer console.

## Instructions

Run a dev or prod build and open a benchmark URL from `benchmarks.txt`.

`yarn benchmark:serve` to start the benchmark dev build.

`yarn benchmark:build:prod` followed by `npx serve -p 8080 benchmark/.webpack`.

Use the production build when comparing numbers; the dev build is much slower and noisier.

## 3D panel benchmark (`?ds=threedee`)

The `threedee` data source plays synthetic data covering the main 3D panel workloads, with a new message on every topic in every frame:

| Topic      | Schema                     | Controlled by                                        |
| ---------- | -------------------------- | ---------------------------------------------------- |
| `/tf`      | `foxglove.FrameTransforms` | `tfDepth`: depth of the transform tree               |
| `/cloud_N` | `foxglove.PointCloud`      | `clouds`, `points` (per cloud)                       |
| `/scene`   | `foxglove.SceneUpdate`     | `entities` (cube, sphere, arrow, line each), `texts` |
| `/scan_N`  | `foxglove.LaserScan`       | `scans`, `beams`                                     |
| `/grid`    | `foxglove.Grid`            | `grid`: width and height in cells, 0 disables it     |

The layout is generated with `panels` 3D panels (default 4), each showing every topic.

Other parameters: `warmup` and `duration` (seconds, default 3 and 15), `rate` (message pipeline frame cap, default 240) and `gpuSync=1` (wait for the GPU after every renderer frame, so GPU execution time is measured in `gpuWaitMs`; this lowers frame rates).

`preset=<name>` selects a parameter set; individual parameters override preset values. Most presets load a single workload so a change to one part of the 3D panel can be measured in isolation:

| Preset        | Workload                                                         |
| ------------- | ---------------------------------------------------------------- |
| `full`        | everything at default sizes (default)                            |
| `pointclouds` | 4 × 500k point clouds                                            |
| `entities`    | 3000 scene entities                                              |
| `texts`       | 500 scene entities, all with text labels                         |
| `laserscans`  | 8 × 4000-beam laser scans                                        |
| `grid`        | 1024 × 1024 grid                                                 |
| `transforms`  | 200-deep transform tree with a small cloud and 200 entities      |
| `panels1`     | `full` in one panel; compare with `panels9` to see panel scaling |
| `panels9`     | `full` in nine panels                                            |

Example: `http://localhost:8080/?ds=threedee&preset=pointclouds&points=1000000&gpuSync=1`

After the measurement the page prints a table to the console and sets `window.benchmarkResult`. It reports:

- **renderer**: time spent in each 3D panel's frame handler, split into message processing (subscription handlers such as point cloud parsing), render (scene extension updates and WebGL draw call submission) and GPU wait (only with `gpuSync=1`), plus draw calls, triangles and points per frame. These timings are not capped by the frame rate, so they are the most sensitive measure of 3D panel changes.
- **pipeline**: time for the message pipeline to deliver a frame and for every panel to finish with it. The pipeline cannot go faster than `rate`, so improvements below `1000 / rate` ms are not visible here.
- **animationFrames**: browser animation frame intervals, i.e. the frame rate the user sees.

### Automated runs and comparisons

`benchmark/runThreeDee.ts` runs presets in Chromium with Playwright, several times each, and writes the results to a JSON file. To compare a change against a baseline, build and serve each version in turn on the same machine:

```sh
# on the baseline commit
yarn benchmark:build:prod && npx serve -p 8080 benchmark/.webpack &
npx ts-node benchmark/runThreeDee.ts --out baseline.json

# on the candidate commit
yarn benchmark:build:prod && npx serve -p 8080 benchmark/.webpack &
npx ts-node benchmark/runThreeDee.ts --out candidate.json --compare baseline.json
```

Options: `--presets pointclouds,entities`, `--runs 5`, `--query "duration=30&gpuSync=1"`, `--headed`, `--executable <chromium>`, `--url <server>`. All options are described at the top of the script.

Headless Chromium often renders with a software rasterizer (SwiftShader); the runner prints a warning when it does. Software rendering is fine for CPU-side changes (message processing, scene updates) but GPU-bound results need `--headed` on a machine with a GPU.
