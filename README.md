# RideOps — Rollercoaster Operator Simulator

A desktop-first browser game foundation for realistic theme-park ride operation. The current playable attraction is **Toxicator**, a procedural WebGL suspended Top Spin with a complete park opening/loading/cycle/unloading flow, 38 live seat circuits, automatic programmes, manual brake-and-momentum operation, enforced interlocks, animated guest movement, demand waves, empty test cycles, maintenance call-outs, scoring and throughput challenges.

## Toxicator operation

The gondola and queue begin empty. Guests arrive in small parties only while the entrance is open, with dynamic quiet, steady, busy and surge periods rather than an instant pre-filled crowd. Opening the load gate does not force a load: the operator must release one explicit batch. That committed group walks up the access route and takes centre-out assigned seats while later arrivals stay behind the batch gate for the next cycle. The entrance can be closed at any time without removing guests already waiting. Close the gate, close and prove the occupied restraints, confirm the platform, enable the main arm drive and hold dispatch.

Select **Empty test cycle** to isolate the public entrance and dispatch without riders after normal safety proving. Pressing **Return to Load** starts an automatic controlled-stop sequence that brakes the motion, parks the arms, levels the gondola and proves the load locks before unloading. Random faults use a complete call-out loop: contact the mechanic, wait for arrival, diagnose the affected system, complete the repair and reset the latched circuit. Test mode also provides deliberate training-fault injection.

The manual mode models the defining Top Spin interaction: motor-driven arms move the gondola pivot while gravity, pivot acceleration and inertia drive the independently swinging gondola. The integrator uses fixed substeps, energy damping and speed envelopes for stable momentum transfer and controlled inversions. The gondola brake has three persistent positions: RELEASED permits a free swing, HALF adds friction without locking, and FULL captures the gondola relative to the arms. Brake pressure ramps physically, generates heat and can fade when abused; it is not treated as a second powered motor. Automatic modes provide three original ride sequences built from the same physics.

Aquafun has its own pump pressure, height demand, left/centre/right isolators and five patterns. It can be operated while the ride is idle or moving; AUTO is the only pattern tied directly to ride motion.

Keyboard controls: `K` control key, `O` entrance, `G` load gate, `A` admit one batch, `R` restraints, `C` platform clear, `D` drive enable, `Space` dispatch, hold the arrow keys for arm drive, `Z`/`X`/`B` for released/half/full gondola brake, `L` arm lock, `S` return to load, `T` empty-test permit, `M` call mechanic, `W` Aquafun pump, `P` fountain pattern, `[`/`]` jet height, `1`–`4` operating mode, `E` emergency stop and `F` fault reset.

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
- `js/simulator/topspin-physics.js` — fixed-step arm, pendulum and three-position brake dynamics
- `js/simulator/guest-flow.js` — arrivals, committed batches, boarding and unloading lifecycle
- `js/simulator/water-system.js` — pump, height, patterns and individually animated water jets
- `js/simulator/scene.js` — Three.js scene and procedural ride model
- `js/simulator/main.js` — console binding, telemetry and render loop
- `vendor/three` — locally hosted Three.js r180 module and MIT license
- `assets/models` and `assets/audio` — production asset integration points

This is an independent simulation project and is not affiliated with a ride manufacturer or theme park. It must not be used as real-world operator training.
