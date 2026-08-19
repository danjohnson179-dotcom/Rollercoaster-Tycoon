# GitHub Pages deployment

## Required structure

```text
Rollercoaster-Operator-Sim/
├── .nojekyll
├── README.md
├── DEPLOYMENT.md
├── index.html
├── login.html
├── catalogue.html
├── simulator.html
├── supabase-schema.sql
├── vendor/
│   └── three/
│       ├── LICENSE
│       ├── three.core.min.js
│       └── three.module.min.js
├── css/
│   └── main.css
├── js/
│   ├── app.js
│   ├── auth-page.js
│   ├── catalogue.js
│   ├── config.js
│   ├── core/
│   │   └── settings.js
│   ├── services/
│   │   ├── audio.js
│   │   └── supabase.js
│   └── simulator/
│       ├── guest-flow.js
│       ├── main.js
│       ├── scene.js
│       ├── state-machine.js
│       ├── topspin-physics.js
│       └── water-system.js
└── assets/
    ├── audio/
    │   └── README.md
    └── models/
        └── README.md
```

Folder and file names are case-sensitive on GitHub Pages. Use lowercase `js/app.js` with one dot.

## Upload

1. Remove the flattened root-level copies such as `app.js`, `main.css`, `scene.js`, and `state-machine.js`, plus the obsolete `auth.js`, `engine.js`, `style.css`, and `toxicator.js` files.
2. Extract the GitHub-ready ZIP on your computer.
3. Drag all extracted files and the complete `css`, `js`, `assets`, and `vendor` folders into the repository upload screen. Do not search for and select every file individually, because that removes their folder paths.
4. Commit the upload to `main`.
5. In **Settings → Pages**, publish from the root of the `main` branch.
6. Wait for Pages to finish, then hard-refresh the deployed site.

The Supabase publishable key belongs in browser code and is protected by row-level security. Run `supabase-schema.sql` once in the Supabase SQL editor before testing account profiles.
