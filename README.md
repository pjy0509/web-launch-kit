![npm](https://img.shields.io/npm/v/web-launch-kit)
![bundle size](https://img.shields.io/bundlephobia/minzip/web-launch-kit)
![types](https://img.shields.io/npm/types/web-launch-kit)

# web-launch-kit

A TypeScript library for launching **external apps** and **communication intents**
from the web. Handles deep links / custom schemes, Android `intent://` URLs, iOS
universal links, and App Store / web-store fallbacks — trying each candidate in
order until one succeeds. Also covers `tel`, `sms`, `mailto`, a file picker, and
system-settings deep links.

```bash
npm install web-launch-kit
```

The bundle is self-contained (OS/locale detection is inlined) — no peer scripts required.

## API at a glance

`LaunchKit` is a singleton.

| Member | Signature | Description |
| --- | --- | --- |
| `LaunchKit.version` | `string` | The installed package version |
| `LaunchKit.SettingType` | `enum` | Setting panes: `General`, `Network`, `Display`, `Appearance`, `Accessibility`, `Battery`, `Datetime`, `Language`, `Accounts`, `Storage` |
| `LaunchKit.app(options?)` | `Promise<AppOpenedBy>` | Launch an app via the best available route; resolves with which route opened it |
| `LaunchKit.telephone(options?)` | `Promise<void>` | Open the dialer (`tel:`) |
| `LaunchKit.message(options?)` | `Promise<void>` | Open the SMS composer (`sms:`) |
| `LaunchKit.mail(options?)` | `Promise<void>` | Open the mail composer (`mailto:`) |
| `LaunchKit.filepicker(options?)` | `Promise<File[]>` | Pick files or a directory (File System Access API, with input fallback) |
| `LaunchKit.setting(type?)` | `Promise<void>` | Open a system-settings pane where supported |
| `LaunchKit.utils` | object | `canOpenIntent` / `canOpenUniversal` / `canOpenSetting` getters, plus async `getTrackId` / `getProductId` |

`AppOpenedBy` is one of: `"scheme"`, `"universal"`, `"intent"`, `"fallback"`, `"store"`.

Named exports `getProductId` / `getTrackId` (synchronous store-id lookups) are also available.

---

## Launching an app

`app()` takes per-platform options and only acts on the block matching the current
OS. It builds an ordered list of candidates and tries each until one launches the
app, resolving with the route that worked.

```mermaid
flowchart TD
    A([LaunchKit.app called]) --> B{Detect OS via PlatformKit}
    B -->|unknown| E1([Reject: unsupported OS])
    B -->|android| AND
    B -->|ios| IOS
    B -->|windows| WIN
    B -->|macos| MAC

    subgraph AND["android · resolveOptions"]
        A1{"intent given, but scheme /<br/>packageName / fallback missing?"}
        A1 -->|yes| A2["parseIntentURL:<br/>derive scheme · packageName · fallback"]
        A1 -->|no| A3
        A2 --> A3{"scheme given, but intent missing?"}
        A3 -->|yes| A4["createIntentURL:<br/>scheme + packageName + fallback"]
        A3 -->|no| A5
        A4 --> A5["Priority list:<br/>intent (if canOpenIntent) ⭢ scheme ⭢ fallback<br/>⭢ app store ⭢ web store (by packageName)"]
    end

    subgraph IOS["ios · resolveOptions"]
        I1{"bundleId given, but trackId missing?"}
        I1 -->|yes| I2["getTrackId:<br/>iTunes lookup API (bundleId ⭢ trackId)"]
        I1 -->|no| I3
        I2 --> I3["Priority list:<br/>universal (if iOS ≥ 9) ⭢ scheme ⭢ fallback<br/>⭢ app store ⭢ web store (by trackId)"]
    end

    subgraph WIN["windows · resolveOptions"]
        W1{"packageFamilyName given,<br/>but productId missing?"}
        W1 -->|yes| W2["getProductId:<br/>packageFamilyName ⭢ productId"]
        W1 -->|no| W3
        W2 --> W3["Priority list:<br/>scheme ⭢ fallback<br/>⭢ app store ⭢ web store (by productId)"]
    end

    subgraph MAC["macos · resolveOptions"]
        M1{"bundleId given, but trackId missing?"}
        M1 -->|yes| M2["getTrackId:<br/>iTunes lookup API (bundleId ⭢ trackId)"]
        M1 -->|no| M3
        M2 --> M3["Priority list:<br/>scheme ⭢ fallback<br/>⭢ app store ⭢ web store (by trackId)"]
    end

    AND --> P
    IOS --> P
    WIN --> P
    MAC --> P

    P{"Any URL candidates?"} -->|no| E2([Reject: no openable URL candidates])
    P -->|yes| Q{"Next candidate type?"}
    Q -->|"function fallback"| R["Invoke fallback function"] --> G
    Q -->|"URL string"| O["openURL(index, url, timeout)"]
    O --> F{Opened?}
    F -->|yes| G(["Resolve AppOpenedBy:<br/>'intent' · 'universal' · 'scheme' · 'fallback' · 'store'"])
    F -->|no| H{"Candidates remaining?"}
    H -->|yes| Q
    H -->|no| E3(["Reject: all attempted URLs failed<br/>(error lists every tried URL)"])

    subgraph openURL["openURL · app-switch detection"]
        T0["Register blur + visibilitychange listeners"] --> T1{"Document focused?"}
        T1 -->|no| T2["restoreFocus:<br/>window ⭢ body ⭢ hidden input"]
        T1 -->|yes| T3
        T2 --> T3{"Environment?"}
        T3 -->|cordova| T4["InAppBrowser.open / window.open ('_system')"]
        T3 -->|browser| T5{"userActivation active<br/>or first attempt?"}
        T5 -->|yes| T6["top.location.href = url"]
        T5 -->|no| T7["Hidden anchor + synthetic click"]
        T6 --> T8["+ hidden iframe (removed after 500ms)"]
        T7 --> T8
        T4 --> T9
        T8 --> T9{"blur / hidden fired?"}
        T9 -->|"yes ⭢ wait focus"| T10([resolve: app opened])
        T9 -->|"no, until timeout"| T11([reject: app not detected])
    end

    O -.->|delegates to| T0
```

```js
import LaunchKit from 'web-launch-kit'

const openedBy = await LaunchKit.app({
	android: {
		scheme: 'ms-excel://',
		packageName: 'com.microsoft.office.excel',
		intent: 'intent://#Intent;scheme=ms-excel;package=com.microsoft.office.excel;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.microsoft.office.excel;end',
		fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
		allowAppStore: true,
		allowWebStore: false,
		timeout: 1000,
	},
	ios: {
		scheme: 'ms-excel://',
		bundleId: 'com.microsoft.Office.Excel',
		trackId: '586683407',
		universal: 'https://1drv.ms/x/c/7f3d9a02c81b4e65/IQBk2wYfN8pTQ5vHmR9xLzUcAeXtP0jWnK4oD3iFgZs7bQY?e=Rk9mZ2',
		fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
		allowAppStore: true,
		allowWebStore: false,
		timeout: 2000,
	},
	windows: {
		scheme: 'ms-excel://',
		packageFamilyName: 'Microsoft.Office.Desktop_8wekyb3d8bbwe',
		productId: 'cfq7ttc0pr28',
		fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
		allowAppStore: true,
		allowWebStore: false,
		timeout: 750,
	},
	macos: {
		scheme: 'ms-excel://',
		bundleId: 'com.microsoft.Excel',
		trackId: '462058435',
		fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
		allowAppStore: true,
		allowWebStore: false,
		timeout: 750,
	}
})

console.log(openedBy) // "universal" | "scheme" | "intent" | "fallback" | "store"
```

Per-platform fields: Android accepts `intent` / `scheme` / `packageName` / `fallback`
(scheme ⇄ intent are derived from each other); iOS accepts `universal` / `scheme` /
`bundleId` / `trackId`; Windows accepts `scheme` / `packageFamilyName` / `productId`;
macOS accepts `scheme` / `bundleId` / `trackId`. All accept `fallback`, `timeout`,
`allowAppStore`, `allowWebStore`.

## Communication intents

```js
import LaunchKit from 'web-launch-kit'

await LaunchKit.telephone({ to: '+821012345678' })

await LaunchKit.message({ to: '+821012345678', body: 'hello' })

await LaunchKit.mail({
  to: ['a@example.com', 'b@example.com'],
  cc: 'c@example.com',
  subject: 'Hi',
  body: 'from web-launch-kit',
})
```

## File picker

```js
import LaunchKit from 'web-launch-kit'

// Files (uses showOpenFilePicker where available, falls back to <input type=file>)
const files = await LaunchKit.filepicker({ accept: ['image/*', '.pdf'], multiple: true })

// A directory (recursive; webkitRelativePath is populated)
const tree = await LaunchKit.filepicker({ directory: true })
```

## System settings

```js
import LaunchKit from 'web-launch-kit'

if (LaunchKit.utils.canOpenSetting) {
  await LaunchKit.setting(LaunchKit.SettingType.Network)
}
```

## CommonJS / UMD

The bundle is built with `exports: "named"`, so the singleton lives under `.default`:

```js
const { default: LaunchKit } = require('web-launch-kit')
```

```html
<script src="https://unpkg.com/web-launch-kit/dist/launch-kit.umd.min.js"></script>
<script>
    window.LaunchKit.default.telephone({ to: '+821012345678' })
</script>
```

---

## Notes

- **Deep links need a real user gesture.** Universal links and custom schemes are
  unreliable when triggered programmatically or from a same-origin context — they
  fall back to the web instead of opening the app. Call `app()` from a click/tap handler.
- **`app()` resolves with the route, not a guarantee of launch.** Detection relies on
  focus/visibility heuristics with per-OS timeouts; a resolved `AppOpenedBy` means that
  candidate was attempted and the page appeared to background, not a hard confirmation.
- **`utils.getTrackId` / `getProductId` are async**; the named `getTrackId` / `getProductId`
  exports are synchronous (blocking XHR) and intended for internal/legacy use.
- **Store-id lookups depend on remote APIs** (iTunes Lookup, Microsoft display catalog)
  and are cached for one hour; failures resolve to `undefined` rather than throwing.
