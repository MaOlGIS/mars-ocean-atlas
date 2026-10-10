# Publish Mars Ocean Atlas

The application exports to `out/` with Next.js `output: 'export'`. All map interaction, WebGL rendering, numeric inspection, and area-weighted ocean calculations run in the browser. No API server, database, Python runtime, NASA download, or environment secrets are required in production. Host at a domain root; the current `/data/…` URLs are deliberately root-relative, so a GitHub Pages project subdirectory would require a separate base-path change.

The atlas is now deployed on Vercel. For the existing connected project, use the future-update workflow below; the repository-creation/import steps are retained for setting up another copy. The nomenclature and 3D globe additions use the same static export and need no hosting setting changes. Three.js is installed by npm ci; the globe reuses existing MOLA browser assets.

## 1. Verify locally

Use Node 24 (`nvm install && nvm use` if you use nvm):

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:production
npm start
```

Open http://127.0.0.1:3001. `npm start` previews the exported files, not a Next.js server. Browser QA owns port 3002 and stops it on completion; your dev server on port 3001 can stay running during tests. Stop an existing port-3001 server before running `npm start`.

Tests use `/usr/bin/chromium` when available. Otherwise install the matching browser with `npx playwright install chromium` (Linux may need `npx playwright install --with-deps chromium`), or set `PLAYWRIGHT_CHROMIUM_PATH` to an installed Chromium binary. `npm run test:browser` tests isolated development; `npm run test:production` tests the already-built `out/` directory.

Optional scientific integration checks in the original processing workspace:

```bash
npm run test:data
npm run verify:sources
python tests/check_gpu_screenshot.py
```

Python scientific checks need NumPy, Pillow, and GDAL. The four derived-grid integration tests skip when `derived/` is absent. Production builds never run Python or access original/derived science data. The Node asset verifier runs before and after every build, checks the complete tile/sample matrix, PNG format/dimensions, binary lengths, and all recorded SHA-256 hashes. A partial or corrupted asset upload fails the build.

## 2. Create an empty GitHub repository

In GitHub, choose **New repository**, name it `mars-ocean-atlas`, and choose your personal account as owner. Public is convenient for sharing the code; the Vercel website can also be public when its source repository is private. Do not initialize the remote with a README, license, or .gitignore, because those files already exist locally. Choose a license separately if you want to license your application code; NASA source attribution is retained in the project.

For a new repository on `main`, before the first commit:

```bash
cd /home/ayabp/mars
# For a separate copy without .git, first run: git init -b main

git add .
git status --short
# Must print no paths:
git ls-files '20261009T122401589809/*' 'derived/*' 'node_modules/*' '.next/*' '.next-qa/*' 'out/*' 'test-results/*'
# Must print 1707:
git ls-files public/data | wc -l

git commit -m "Prepare Mars Ocean Atlas for static deployment"
git remote add origin https://github.com/YOUR_USERNAME/mars-ocean-atlas.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username and use the exact remote URL displayed by GitHub. Authenticate through your Git credential helper, SSH, or GitHub CLI; do not embed tokens in files or URLs. These commands are instructions for you to execute when ready. The nomenclature update has not been committed, pushed, or deployed automatically.

## 3. Import into Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Connect GitHub, grant access to this repository, and import `mars-ocean-atlas`.
3. Use these settings (the build settings are also in `vercel.json`):

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | Repository root (`.`) |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `out` |
| Node.js version | 24.x (`package.json` specifies this) |
| Production branch | `main` |
| Environment variables | None |

4. Click **Deploy**. Build logs should show both `public/data` and `out/data` verifying **1707 files, 121768051 bytes** and static `/` output. No scientific regeneration occurs.
5. Open the **Production** URL, usually `https://mars-ocean-atlas-….vercel.app` (use the actual URL Vercel assigns).

Use GitHub import rather than uploading this checkout with the Vercel CLI. As checked on 2026-10-09, [Vercel's limits](https://vercel.com/docs/limits#static-file-uploads) specify a **100 MB total source upload limit for Hobby CLI deployments** (1 GB for Pro). Our precomputed source assets exceed that CLI limit. That paragraph is specifically about CLI source uploads; it is not an individual-file or Git-built static-output limit. Vercel documents no upper limit on the number of build-output files; this site has only 1,707 data assets. The 2,048 routing limit applies to configured routes/headers/rewrites, not each PNG. The two header rules here revalidate data and identify sampling files as binary. Use a personal-account repository for Hobby; organization-owned Git repositories have plan restrictions. Normal hosting transfer/usage quotas still apply.

Vercel currently supports [Node 24.x](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). This is a build runtime only; the exported app does not deploy Node functions.

## 4. Check and share the public URL

Open the production URL in a private/incognito browser where you are not logged into Vercel. If Vercel asks visitors to log in, adjust **Settings → Deployment Protection** for the production deployment using the controls available on your plan. Share the stable production domain, rather than a protected preview URL or the Vercel dashboard URL.

Verify:

- The terrain appears, `/data/manifest.json` returns JSON, and `/nomenclature/mars.json` returns the official feature snapshot.
- `/data/tiles/4/31/15.png` returns a PNG (not an HTML error).
- `/data/samples/31/15.f32` downloads 129,600 bytes and `/data/samples/31/15.u8` downloads 32,400 bytes.
- Zoom through every resolution transition, fit the planet, and pan across the longitude seam.
- Move both ocean sliders, reset to 71%, and click terrain for elevation/depth.
- Mobile controls work, and browser Console/Network show no map errors or missing assets.

Only then send friends the production URL. Local production QA verifies the exported files; it does not claim an as-yet-unpublished Vercel deployment has been tested.

## 5. Deploy future updates

After editing:

```bash
npm test
npm run typecheck
npm run build
npm run test:production
git add .
git commit -m "Describe your update"
git push
```

[Vercel's Git integration](https://vercel.com/docs/git) automatically builds pushes to the connected repository: `main` updates production, and other branches/pull requests normally create previews. No manual upload or raster processing is needed. If a deployment fails, the prior successful production deployment remains available; use the Vercel dashboard to inspect logs or roll back.

## Browser asset policy

Commit **all of `public/data/` and `public/nomenclature/`**, plus `docs/browser-assets.json`, source, config, lockfile, and docs. Current assets comprise 682 numeric RGBA PNG tiles, 512 float32 sample chunks, 512 quality chunks, and one manifest: **121,768,051 bytes (116.13 MiB)**. The filesystem's block-based `du` estimate is approximately 119 MiB. The largest individual file is the **801,179-byte manifest**. GitHub warns above 50 MiB and rejects files above 100 MiB; these files are well below both, so [Git LFS is unnecessary](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github). Avoid GitHub's browser upload workflow; push with Git.

Keep original NASA downloads (`20261009T122401589809/`), source rasters/archives, the approximately 98 MiB `derived/` directory, virtual environments, `node_modules`, `.next*`, `out/`, test screenshots/reports, `.vercel/`, and local environment files excluded. `.gitignore` and `.vercelignore` enforce this. Deployments consume already-validated browser assets; they never recreate the source dataset.

If intentionally regenerating data locally, run scientific validation first, then `node scripts/verify-assets.mjs --record` to explicitly update the committed integrity index. Review and commit the manifest, **all** regenerated browser files, and that index together. Do not update the index to bypass an unexplained integrity failure. Unchanged asset paths use revalidation rather than long-lived immutable browser caching.
