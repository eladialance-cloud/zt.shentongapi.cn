# Bundle Inspection Report — getElectronPath Error Root Cause

## 1. Scope & Method

Read-only inspection of:

- `D:\\二次开发\\desktop\\dist\\main\\index.js` (built main bundle)
- `D:\\二次开发\\desktop\\electron-builder.yml` (packaging config)
- `D:\\二次开发\\desktop\\electron.vite.config.ts` (bundler config)
- Packaged artifacts under `D:\\二次开发\\desktop\\dist\\installer-v0.4.9\\win-unpacked\\resources`
- `node_modules/electron/index.js` (the source of the `getElectronPath` error)

No files were modified.

---

## 2. Evidence

### 2.1 `dist/main/index.js` references `require("electron")` at runtime

The bundle keeps Electron as an external module; all calls remain as `require("electron")`:

| # | Line | Context |
|---|------|---------|
| 1 | 33 | `let electron = require("electron");` (top-level import for app code) |
| 2 | 11790 | `constructor(app = require("electron").app)` (electron-updater adapter) |
| 3 | 11835 | `return require("electron").session.fromPartition(...)` |
| 4 | 11869 | `const request = require("electron").net.request(...)` |
| 5 | 13810 | `new (require("electron")).Notification(...)` |
| 6 | 14164 | `require("electron").autoUpdater.emit(...)` |
| 7 | 14787 | `this.nativeUpdater = require("electron").autoUpdater` |
| 8 | 15207 | `require("electron").shell.openPath(...)` |

There are **zero** occurrences of:

- `getElectronPath`
- `path.txt`
- `ELECTRON_OVERRIDE_DIST_PATH`
- `node_modules/electron/index.js`
- `Electron failed to install correctly`

This means the npm `electron` package itself is **not bundled** into `dist/main/index.js`.

### 2.2 `node_modules/electron/index.js` is the source of the error

```js
function getElectronPath() {
  let executablePath;
  if (fs.existsSync(pathFile)) {
    executablePath = fs.readFileSync(pathFile, 'utf-8');
  }
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || 'electron');
  }
  if (executablePath) {
    return path.join(__dirname, 'dist', executablePath);
  } else {
    throw new Error(
      'Electron failed to install correctly, please delete node_modules/electron and try installing again'
    );
  }
}
module.exports = getElectronPath();
```

Key facts:

- `path.txt` is **not** listed in the npm package's `files` array, so it is never copied into a packaged app.
- If the npm `electron` package is resolved at runtime inside the packaged app, `getElectronPath()` runs, cannot find `path.txt`, and throws exactly the observed error.

### 2.3 `electron-builder.yml` excludes `node_modules` from the app package

```yaml
files:
  - dist/main/**/*
  - dist/preload/**/*
  - dist/renderer/**/*
  - package.json
  - "!**/*.{ts,tsx,map}"
  - "!src/**"
  - "!electron/**"
  - "!*.config.*"
```

There is **no explicit `!node_modules/**`** here, but `builder-debug.yml` shows that electron-builder injects a default exclude first:

```yaml
firstOrDefaultFilePatterns:
  - '!**/node_modules/**'
  - ...
```

### 2.4 Electron-builder still copies runtime `node_modules` into the asar

`builder-debug.yml` also shows a second set of patterns (`nodeModuleFilePatterns`) that re-includes dependencies:

```yaml
nodeModuleFilePatterns:
  - '**/*'
  - dist/main/**/*
  - dist/preload/**/*
  - dist/renderer/**/*
  - package.json
  - '!**/*.{ts,tsx,map}'
  - '!src/**'
  - '!electron/**'
  - '!*.config.*'
```

As a result, the current packaged app contains **16,195** entries under `node_modules` inside `app.asar`:

- `electron-log`
- `electron-updater`
- `axios`
- `tree-kill`
- `@journeyapps/sqlcipher` (also unpacked to `app.asar.unpacked`)
- many renderer-only transitive deps (antd, react, pixi.js, etc.)

**However, `node_modules/electron` itself is NOT present in the packaged app.** It is a `devDependency`, and electron-builder correctly excludes dev dependencies from production packaging.

### 2.5 `electron.vite.config.ts` externalizes `electron`

```ts
const electronBuiltins = ['electron']
// ...
external: [...nativeModuleOptionalDeps, ...electronBuiltins]
```

This prevents the npm `electron` wrapper from being bundled into `dist/main/index.js`.

### 2.6 Bundler is still inlining other runtime dependencies

`dist/main/index.js` is 585,737 bytes and contains 159 `#region node_modules/...` sections, including the full source of `electron-updater`, `electron-log` (partial), `graceful-fs`, `js-yaml`, `semver`, etc. At the same time, electron-builder copies those same packages into `app.asar/node_modules`. This creates duplication and increases installer size, but it is not the direct cause of the `getElectronPath` error.

### 2.7 Stale build anomaly

`dist/installer-new/win-unpacked/resources` is **empty** (no `app.asar`). Its timestamp (2026/7/29 17:34) is earlier than `dist/main` (17:36), indicating the installer was produced before the current `dist/main` bundle existed. This artifact is broken but unrelated to `getElectronPath`.

---

## 3. Root-Cause Hypothesis

The `getElectronPath` error occurs **when the npm `electron` package is resolved at runtime inside the packaged application**.

In a normal Electron process, `require('electron')` resolves to Electron's built-in module, not the npm package. The npm package only gets resolved if:

1. The bundler did **not** externalize `electron`, so it inlined `node_modules/electron/index.js` into the main bundle. At runtime the inlined `getElectronPath()` executes, cannot find `path.txt`, and throws.
2. Or `electron` was placed under `dependencies` instead of `devDependencies`, causing electron-builder to copy `node_modules/electron` into `app.asar`. Then any `require('electron')` from inside the asar would resolve to the npm package before the built-in module, triggering the same error.

The current codebase has the correct guardrails (`electron` is a devDependency and is externalized in Vite), so **the current `dist/main/index.js` and `app.asar` should not produce this error**.

If the error is still being observed, it is most likely coming from:

- An **older build artifact** created before `external: ['electron']` was added.
- Running the main bundle directly with Node.js instead of the Electron executable.
- A build/packaging step that accidentally copies `node_modules/electron` into the app.

---

## 4. Repair Recommendations

1. **Never move `electron` to `dependencies`.**
   Keep it in `devDependencies` so electron-builder never copies the npm package into the installer.

2. **Keep `electron` external in the Vite main/preload config.**
   The current `external: ['electron']` setting is correct and must remain.

3. **Add an explicit exclusion for the npm `electron` package in `electron-builder.yml`.**
   This acts as a safety net even if someone accidentally moves `electron` to dependencies:

   ```yaml
   files:
     - dist/main/**/*
     - dist/preload/**/*
     - dist/renderer/**/*
     - package.json
     - "!node_modules/electron{,/**/*}"
     - "!**/*.{ts,tsx,map}"
     - "!src/**"
     - "!electron/**"
     - "!*.config.*"
   ```

4. **Reduce duplication/inconsistency between bundling and electron-builder packaging.**
   Currently main-process dependencies are both inlined by Vite and copied to `app.asar/node_modules`. Pick one strategy:
   - Let Vite inline them and prevent electron-builder from copying `node_modules` (add `!node_modules/**` and list only the packages that must remain unpacked, such as `@journeyapps/sqlcipher`).
   - Or externalize main dependencies in Vite and let electron-builder copy only the required production packages.

5. **Clean old installers before building.**
   `dist/installer-new` is stale/empty. Run a clean build and delete `dist/installer-*` directories before `electron-builder` to avoid confusion.

6. **Verify the packaged app.**
   After building, confirm `app.asar` does not contain `node_modules/electron`:

   ```bash
   npx asar list dist/installer-xxx/win-unpacked/resources/app.asar | grep "node_modules\\electron"
   ```

   Expected: no output.

---

## 5. Summary

- The `getElectronPath` error originates from `node_modules/electron/index.js` when `path.txt` is missing.
- The error is triggered if the npm `electron` package is either bundled by Vite or copied into the packaged app.
- The current configuration correctly prevents both failure modes, but adding an explicit `!node_modules/electron{,/**/*}` exclusion and cleaning stale installer output will make the build more robust.

---

_Report generated: 2026-07-29 — read-only inspection, no files modified._
