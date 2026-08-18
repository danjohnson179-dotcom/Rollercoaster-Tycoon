# RideOps — Rollercoaster Operator Simulator

A desktop-first browser game foundation for realistic theme-park ride operation. The current playable attraction is **Toxicator**, a procedural WebGL suspended Top Spin with a complete park opening/loading/cycle/unloading flow, 38 live seat circuits, automatic programmes, manual brake-and-momentum operation, enforced interlocks, guest scoring and throughput challenges.

## Toxicator operation

The gondola begins empty. Energise the controls, open the ride entrance and then open the load gate to board guests from the queue. Close the gate, close and prove the occupied restraints, confirm the platform, enable the main arm drive and hold dispatch. At the end of a cycle, open the restraints and load gate to unload before accepting the next group.

The manual mode models the defining Top Spin interaction: motor-driven arms move the gondola pivot while gravity, pivot acceleration and inertia drive the independently swinging gondola. A pressure-ramped hold brake captures the gondola relative to the arms; it is not treated as a second powered motor. Automatic modes provide three original ride sequences built from the same physics.

Keyboard controls: `K` control key, `O` entrance, `G` load gate, `R` restraints, `C` platform clear, `D` drive enable, `Space` dispatch, hold the arrow keys for arm drive, hold `B` for gondola brake pressure, `L` arm lock, `S` stop/return, `W` water effects, `1`–`4` operating mode, `E` emergency stop and `F` fault reset.

## Run locally

ES modules require an HTTP server. From the project folder, run any static server (for example `python -m http.server 8080`) and open `http://localhost:8080`. No bundler or build step is required.

## GitHub Pages

Publish the repository root from the `main` branch. All paths are relative and `.nojekyll` is included, so the project also works from a repository subpath.

When uploading through GitHub's web interface, preserve the folders exactly. The correct application entry point is `js/app.js`; do not upload it as a root-level `app.js`. Extract the supplied archive first, then drag the complete contents—including the `css`, `js`, and `assets` folders—into the repository. See `DEPLOYMENT.md` for the complete manifest.

## Supabase

The public client is configured in `js/config.js`. Run `supabase-schema.sql` once in the project's SQL editor to create profiles, session history, trigger setup and row-level security policies. The publishable browser key is intentionally public; data access is protected by RLS.

## Structure

- `css/main.css` — shared design system and responsive layouts
- `js/services` — Supabase and Web Audio adapters
- `js/core` — persistent settings
- `js/simulator/state-machine.js` — deterministic ride/interlock logic
- `js/simulator/scene.js` — Three.js scene and procedural ride model
- `js/simulator/main.js` — console binding, telemetry and render loop
- `vendor/three` — locally hosted Three.js r180 module and MIT license
- `assets/models` and `assets/audio` — production asset integration points

This is an independent simulation project and is not affiliated with a ride manufacturer or theme park. It must not be used as real-world operator training.
