import packageJSON from "./package.json" assert {type: 'json'};
import PlatformKit, {Browsers, type OS} from 'web-platform-kit';
import {createHiddenElement} from "./utils/create-hidden-element";
import {getProductId, getProductIdAsync, getTrackId, getTrackIdAsync} from "./utils/get-id";
import {getTopmostWindow} from "./utils/get-topmost-window";
import {addEvent, removeEvent} from "./utils/event-listener-utils";

declare global {
    interface Document {
        webkitVisibilityState?: 'hidden' | 'visible';
        mozVisibilityState?: 'hidden' | 'visible';
        msVisibilityState?: 'hidden' | 'visible';
        webkitHidden?: boolean;
        mozHidden?: boolean;
        msHidden?: boolean;
    }

    interface FileSystemDirectoryHandle {
        values(): AsyncIterableIterator<FileSystemHandle>
    }

    interface SymbolConstructor {
        readonly asyncIterator: symbol;
    }

    var showOpenFilePicker: (options?: OpenFilePickerOptions) => Promise<FileSystemFileHandle[]>;
    var showDirectoryPicker: (options?: OpenDirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
    var cordova: CordovaPlugin | undefined;
}

interface OpenFilePickerOptions {
    excludeAcceptAllOption?: boolean;
    id?: string;
    multiple?: boolean;
    startIn?: OpenPickerStartIn;
    types?: {
        description?: string;
        accept: Record<string, string[]>;
    }[];
}

interface OpenDirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: OpenPickerStartIn;
}

interface IteratorYieldResult<TYield> {
    done?: false;
    value: TYield;
}

interface IteratorReturnResult<TReturn> {
    done: true;
    value: TReturn;
}

interface AsyncIterator<T, TReturn = any, TNext = any> {
    next(...[value]: [] | [TNext]): Promise<IteratorResult<T, TReturn>>;

    return?(value?: TReturn | PromiseLike<TReturn>): Promise<IteratorResult<T, TReturn>>;

    throw?(e?: any): Promise<IteratorResult<T, TReturn>>;
}

interface AsyncIterableIterator<T, TReturn = any, TNext = any> extends AsyncIterator<T, TReturn, TNext> {
    [Symbol.asyncIterator](): AsyncIterableIterator<T, TReturn, TNext>;
}

type IteratorResult<T, TReturn = any> = IteratorYieldResult<T> | IteratorReturnResult<TReturn>;
export declare type URLCandidate = URL | string;
export declare type URLCandidateOrFallback = URLCandidate | (() => any);
export declare type URLStringOrFallback = string | (() => any);
export declare type OpenPickerStartIn = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
export declare type AppOpenedBy = 'scheme' | 'universal' | 'intent' | 'fallback' | 'store';

export enum SettingType {
    General = 'general',
    Network = 'network',
    Display = 'display',
    Appearance = 'appearance',
    Accessibility = 'accessibility',
    Battery = 'battery',
    Datetime = 'datetime',
    Language = 'language',
    Accounts = 'accounts',
    Storage = 'storage',
}

interface CordovaPlugin {
    InAppBrowser?: CordovaInAppBrowser;
}

interface CordovaInAppBrowser {
    open(url?: string | URL, target?: string, features?: string): WindowProxy | null;
}

interface EventConfig {
    target?: EventTarget;
    type?: string;
}

interface FocusEventConfig {
    focus: EventConfig;
    blur: EventConfig;
    visibilitychange: EventConfig;
}

interface IntentInfo {
    scheme?: string;
    packageName?: string;
    fallback?: string;
}

export declare interface AppInfo {
    scheme?: URLCandidate;
    fallback?: URLCandidateOrFallback;
    timeout?: number;
    allowAppStore?: boolean;
    allowWebStore?: boolean;
}

export declare interface AndroidAppInfo extends AppInfo {
    intent?: URLCandidate;
    packageName?: string;
}

export declare interface IOSAppInfo extends AppInfo {
    universal?: URLCandidate;
    bundleId?: string;
    trackId?: string;
}

export declare interface WindowsAppInfo extends AppInfo {
    packageFamilyName?: string;
    productId?: string;
}

export declare interface MacOSAppInfo extends AppInfo {
    bundleId?: string;
    trackId?: string;
}

export declare interface AppOpenOptions {
    android?: AndroidAppInfo;
    ios?: IOSAppInfo;
    windows?: WindowsAppInfo;
    macos?: MacOSAppInfo;
}

export declare interface TelephoneOptions {
    to?: string;
}

export declare interface MessageOptions {
    to?: string | string[];
    body?: string;
}

export declare interface MailOptions {
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    body?: string;
}

export declare interface FilepickerOptions {
    accept?: string | string[];
    id?: string;
    directory?: boolean;
    multiple?: boolean;
    startIn?: OpenPickerStartIn;
}

/**
 * Auxiliary helpers for {@link LaunchKitInstance} — environment probes and store-id lookups.
 */
interface LaunchKitUtils {
    /**
     * Whether Android `intent://` links can launch apps in the current browser.
     *
     * @remarks
     * `false` outside Android, and for browsers with known intent regressions
     * (certain Firefox/Opera ranges) or in-app browsers (Facebook, Instagram, WeChat, TikTok).
     */
    get canOpenIntent(): boolean;

    /**
     * Whether iOS universal links are available (iOS 9+).
     */
    get canOpenUniversal(): boolean;

    /**
     * Whether {@link LaunchKitInstance.setting} can open settings on this platform.
     *
     * @remarks
     * `false` on iOS, on Windows below 10, and on macOS below 10.10.
     */
    get canOpenSetting(): boolean;

    /**
     * Looks up an App Store `trackId` from an iOS/macOS bundle id (async, non-blocking).
     *
     * @param bundleId - The app's bundle identifier (e.g. `'com.example.app'`).
     * @returns The numeric track id as a string, or `undefined` if not found.
     *
     * @remarks
     * Uses `fetch` and caches results for one hour; failures resolve to `undefined`
     * rather than throwing. The synchronous `getTrackId` named export exists for internal
     * use but blocks the main thread.
     */
    getTrackId(bundleId: string): Promise<string | undefined>;

    /**
     * Looks up a Microsoft Store `ProductId` from a package family name (async, non-blocking).
     *
     * @param packageFamilyName - The Windows package family name.
     * @returns The product id, or `undefined` if not found.
     *
     * @remarks
     * Uses `fetch` and caches results for one hour; failures resolve to `undefined`
     * rather than throwing. Market and language are derived from {@link LocaleKit}.
     */
    getProductId(packageFamilyName: string): Promise<string | undefined>;
}

/**
 * Launcher for external apps and communication intents from the web.
 *
 * Opens installed apps via deep links / custom schemes, Android `intent://` URLs,
 * and iOS universal links — trying each candidate in order until one succeeds, with
 * App Store / web-store fallbacks. Also covers `tel`, `sms`, `mailto`, a file picker,
 * and system-settings deep links.
 *
 * @remarks
 * App-opening relies on focus/visibility heuristics with per-OS timeouts; results
 * indicate a candidate was attempted and the page appeared to background, not a hard
 * confirmation of launch. Deep links need a real user gesture — call these methods
 * from within a click/tap handler, or universal links and custom schemes fall back
 * to the web instead of opening the app.
 *
 * @example
 * ```ts
 * const openedBy = await LaunchKit.app({
 *      android: {
 *          scheme: 'ms-excel://',
 *          packageName: 'com.microsoft.office.excel',
 *          intent: 'intent://#Intent;scheme=ms-excel;package=com.microsoft.office.excel;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.microsoft.office.excel;end',
 *          fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
 *          allowAppStore: true,
 *          allowWebStore: false,
 *          timeout: 1000,
 *      },
 *      ios: {
 *          scheme: 'ms-excel://',
 *          bundleId: 'com.microsoft.Office.Excel',
 *          trackId: '586683407',
 *          universal: 'https://1drv.ms/x/c/7f3d9a02c81b4e65/IQBk2wYfN8pTQ5vHmR9xLzUcAeXtP0jWnK4oD3iFgZs7bQY?e=Rk9mZ2',
 *          fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
 *          allowAppStore: true,
 *          allowWebStore: false,
 *          timeout: 2000,
 *      },
 *      windows: {
 *          scheme: 'ms-excel://',
 *          packageFamilyName: 'Microsoft.Office.Desktop_8wekyb3d8bbwe',
 *          productId: 'cfq7ttc0pr28',
 *          fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
 *          allowAppStore: true,
 *          allowWebStore: false,
 *          timeout: 750,
 *      },
 *      macos: {
 *          scheme: 'ms-excel://',
 *          bundleId: 'com.microsoft.Excel',
 *          trackId: '462058435',
 *          fallback: 'https://www.microsoft.com/ko-kr/microsoft-365/excel',
 *          allowAppStore: true,
 *          allowWebStore: false,
 *          timeout: 750,
 *      }
 * });
 * ```
 */
export interface LaunchKitInstance {
    /**
     * The installed package version.
     */
    readonly version: string;

    /**
     * Enum of system-settings panes (alias of the named {@link SettingType} export).
     */
    readonly SettingType: typeof SettingType;

    /**
     * Auxiliary helpers: capability probes and async store-id lookups.
     */
    readonly utils: LaunchKitUtils;

    /**
     * Attempts to open an installed app for the current OS, trying each resolved
     * candidate in order until one appears to launch it.
     *
     * @param options - Per-platform launch info; only the block matching the current OS is used.
     * @returns The route that opened the app: `'scheme'`, `'universal'`, `'intent'`, `'fallback'`, or `'store'`.
     *
     * @remarks
     * Candidates are ordered per platform (e.g. iOS: universal → scheme → fallback →
     * store). A resolved value means that route was attempted and the page backgrounded,
     * not a guaranteed launch. Rejects when the OS is undetected or no candidate can be
     * built for it. `bundleId` / `packageFamilyName` are resolved to a store id via a
     * blocking lookup when the store fallback is needed.
     */
    app(options?: AppOpenOptions): Promise<AppOpenedBy>;

    /**
     * Opens the dialer with a `tel:` URL.
     *
     * @param options - The recipient number in `to`.
     * @returns Resolves once the launch attempt settles.
     *
     * @remarks
     * Per RFC 3966, `+` is preserved and visual separators (spaces, dashes, dots,
     * parens) are stripped before dialing.
     */
    telephone(options?: TelephoneOptions): Promise<void>;

    /**
     * Opens the SMS composer with an `sms:` URL.
     *
     * @param options - One or more recipients in `to`, and an optional `body`.
     * @returns Resolves once the launch attempt settles.
     *
     * @remarks
     * Body prefill uses OS-specific delimiters (`?`/`&`/`;`); iOS 7 in particular cannot
     * prefill the body at all. Recipients are sanitized to digits, `+`, `-`, and `.`.
     */
    message(options?: MessageOptions): Promise<void>;

    /**
     * Opens the mail composer with a `mailto:` URL.
     *
     * @param options - `to` / `cc` / `bcc` (each a string or array), plus optional `subject` and `body`.
     * @returns Resolves once the launch attempt settles.
     *
     * @remarks
     * Encodes fields per RFC 6068. The body's line breaks are normalized to CRLF.
     */
    mail(options?: MailOptions): Promise<void>;

    /**
     * Opens a file or directory picker and resolves with the chosen files.
     *
     * @param options - `accept` filters, `directory` for folder selection, `multiple`, `id`, and `startIn`.
     * @returns The selected files; an empty array if the user cancels.
     *
     * @remarks
     * Uses the File System Access API (`showOpenFilePicker` / `showDirectoryPicker`)
     * where available, falling back to a hidden `<input type="file">`. Directory
     * selection is recursive and populates each file's `webkitRelativePath`.
     */
    filepicker(options?: FilepickerOptions): Promise<File[]>;

    /**
     * Opens a system-settings pane where the platform supports it.
     *
     * @param type - The settings pane to open; defaults to {@link SettingType.General}.
     * @returns Resolves once the launch attempt settles.
     *
     * @remarks
     * Not supported on iOS (settings schemes are private API) and rejects there, and on
     * Windows below 10 / macOS below 10.10. Some Android panes fall back to the general
     * settings screen on older API levels; macOS 13+ uses the newer System Settings schema.
     */
    setting(type?: SettingType): Promise<void>;
}

const SETTING_URL: Record<'android' | 'windows' | 'macos' | 'macos13', Record<SettingType, string>> = {
    android: {
        general: 'intent:#Intent;action=android.settings.SETTINGS;end',
        network: 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end',
        display: 'intent:#Intent;action=android.settings.DISPLAY_SETTINGS;end',
        appearance: 'intent:#Intent;action=android.settings.DISPLAY_SETTINGS;end',
        accessibility: 'intent:#Intent;action=android.settings.ACCESSIBILITY_SETTINGS;end',
        battery: 'intent:#Intent;action=android.settings.BATTERY_SAVER_SETTINGS;end',
        datetime: 'intent:#Intent;action=android.settings.DATE_SETTINGS;end',
        language: 'intent:#Intent;action=android.settings.LOCALE_SETTINGS;end',
        accounts: 'intent:#Intent;action=android.settings.SYNC_SETTINGS;end',
        storage: 'intent:#Intent;action=android.settings.INTERNAL_STORAGE_SETTINGS;end',
    },
    windows: {
        general: 'ms-settings:system',
        network: 'ms-settings:network',
        display: 'ms-settings:display',
        appearance: 'ms-settings:colors',
        accessibility: 'ms-settings:easeofaccess',
        battery: 'ms-settings:batterysaver',
        datetime: 'ms-settings:dateandtime',
        language: 'ms-settings:regionlanguage',
        accounts: 'ms-settings:emailandaccounts',
        storage: 'ms-settings:storagesense',
    },
    macos: {
        general: 'x-apple.systempreferences:',
        network: 'x-apple.systempreferences:com.apple.preference.network',
        display: 'x-apple.systempreferences:com.apple.preference.displays',
        appearance: 'x-apple.systempreferences:com.apple.preference.general',
        accessibility: 'x-apple.systempreferences:com.apple.preference.universalaccess',
        battery: 'x-apple.systempreferences:com.apple.preference.energysaver',
        datetime: 'x-apple.systempreferences:com.apple.preference.datetime',
        language: 'x-apple.systempreferences:com.apple.Localization',
        accounts: 'x-apple.systempreferences:com.apple.preferences.internetaccounts',
        storage: 'x-apple.systempreferences:',
    },
    macos13: {
        general: 'x-apple.systempreferences:com.apple.General-Settings.extension',
        network: 'x-apple.systempreferences:com.apple.Network-Settings.extension',
        display: 'x-apple.systempreferences:com.apple.Displays-Settings.extension',
        appearance: 'x-apple.systempreferences:com.apple.Appearance-Settings.extension',
        accessibility: 'x-apple.systempreferences:com.apple.Accessibility-Settings.extension',
        battery: 'x-apple.systempreferences:com.apple.Battery-Settings.extension',
        datetime: 'x-apple.systempreferences:com.apple.Date-Time-Settings.extension',
        language: 'x-apple.systempreferences:com.apple.Localization-Settings.extension',
        accounts: 'x-apple.systempreferences:com.apple.Internet-Accounts-Settings.extension',
        storage: 'x-apple.systempreferences:com.apple.settings.Storage',
    }
}

const ANDROID_DEFAULT_TIMEOUT: number = 1000;
const IOS_DEFAULT_TIMEOUT: number = 2000;
const WINDOWS_DEFAULT_TIMEOUT: number = 750;
const MACOS_DEFAULT_TIMEOUT: number = 750;
const SETTING_DEFAULT_TIMEOUT: number = 750;
const NAVIGATOR: Navigator | undefined = globalThis.navigator;
let CLEANUP_INPUT_ELEMENT: null | (() => void) = null;

function createTypeGuard<T>(tag: string): (value: unknown) => value is T {
    return function (value: unknown): value is T {
        return Object.prototype.toString.call(value) === '[object ' + tag + ']';
    }
}

const isURL: (value: unknown) => value is URL = createTypeGuard<URL>('URL');
const isDOMException: (value: unknown) => value is DOMException = createTypeGuard<DOMException>('DOMException');
const isArray: (value: unknown) => value is Array<unknown> = createTypeGuard<Array<unknown>>('Array');
const isPromise: (value: unknown) => value is Promise<unknown> = createTypeGuard<Promise<unknown>>('Promise');
const isHTMLInputElement: (value: unknown) => value is HTMLInputElement = createTypeGuard<HTMLInputElement>('HTMLInputElement');

function isHTMLInputElementLike(value: unknown): value is HTMLInputElement {
    if (isHTMLInputElement(value)) return true;

    // IE <= 8 reports DOM elements as '[object Object]'; detect structurally via nodeType 1 + tagName instead
    const maybe: HTMLInputElement = value as HTMLInputElement;

    return typeof maybe === 'object'
        && maybe !== null
        && maybe.nodeType === 1
        && typeof maybe.tagName === 'string'
        && maybe.tagName.toUpperCase() === 'INPUT';
}

function getDefaultTimeout(): number {
    switch (PlatformKit.os.name) {
        case 'android':
            return ANDROID_DEFAULT_TIMEOUT;
        case 'ios':
            return IOS_DEFAULT_TIMEOUT;
        case 'windows':
            return WINDOWS_DEFAULT_TIMEOUT;
        case 'macos':
            return MACOS_DEFAULT_TIMEOUT;
        default:
            return WINDOWS_DEFAULT_TIMEOUT;
    }
}

function isDocumentHidden(): boolean {
    const top: WindowProxy = getTopmostWindow();
    const topDocument: Document = top.document;

    if (topDocument.visibilityState === 'hidden') return true;
    if (topDocument.webkitVisibilityState === 'hidden') return true;
    if (topDocument.mozVisibilityState === 'hidden') return true;
    if (topDocument.msVisibilityState === 'hidden') return true;
    if (typeof topDocument.hidden !== 'undefined') return topDocument.hidden;
    if (typeof topDocument.webkitHidden !== 'undefined') return topDocument.webkitHidden;
    if (typeof topDocument.mozHidden !== 'undefined') return topDocument.mozHidden;
    if (typeof topDocument.msHidden !== 'undefined') return topDocument.msHidden;
    if (typeof topDocument.hasFocus === 'function') return !topDocument.hasFocus();

    return true;
}

function dispatchClickEvent(element: HTMLElement, view: WindowProxy = globalThis as unknown as WindowProxy): void {
    let fake: MouseEvent;

    try {
        fake = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: view
        });
    } catch (_: unknown) {
        // ES5 or Browsers in the ES5~ES6 transition period
        fake = globalThis.document.createEvent('MouseEvents');

        fake.initMouseEvent('click', true, true, view, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    }

    element.dispatchEvent(fake);
}

function hasFocus(document: Document): boolean {
    if (typeof document.hasFocus === 'function') return document.hasFocus();
    return false;
}

function focus(target: WindowProxy | HTMLOrSVGElement): void {
    try {
        target.focus({preventScroll: true});
    } catch (_: unknown) {
        try {
            target.focus();
        } catch (_: unknown) {
        }
    }
}

function restoreFocus(): boolean {
    const top: WindowProxy = getTopmostWindow();
    const topDocument: Document = top.document;

    focus(top);

    if (hasFocus(topDocument)) return true;

    if (topDocument.body.tabIndex < 0) topDocument.body.tabIndex = -1;

    focus(topDocument.body);

    if (hasFocus(topDocument)) return true;

    let input: HTMLInputElement | undefined = undefined;

    try {
        input = createHiddenElement('input');

        if (typeof input === 'undefined') return false;

        input.type = 'text';
        input.readOnly = true;

        topDocument.body.appendChild(input);

        focus(input);

        try {
            input.select();
        } catch (_: unknown) {
        }

        if (hasFocus(topDocument)) return true;
    } catch (_: unknown) {
    } finally {
        if (typeof input !== 'undefined' && input !== null) {
            try {
                input.blur();
            } catch (_: unknown) {
            }

            try {
                topDocument.body.removeChild(input);
            } catch (_: unknown) {
            }
        }
    }

    return hasFocus(topDocument);
}

function stripURL<T>(value: T | undefined): (T extends URL ? string : T) | undefined {
    return typeof value === 'undefined' ? undefined : isURL(value) ? value.toString() as T extends URL ? string : T : value as Exclude<T, URL>;
}

function resolveFocusEventConfig(): FocusEventConfig {
    const top: WindowProxy = getTopmostWindow();
    const topDocument: Document = top.document;

    if (typeof globalThis.cordova !== 'undefined') {
        return {
            focus: {
                target: topDocument,
                type: 'resume',
            },
            blur: {
                target: topDocument,
                type: 'pause',
            },
            visibilitychange: {}
        };
    } else if (PlatformKit.os.name === 'ios') {
        if (PlatformKit.compareVersion(PlatformKit.os.version, '8.0') >= 0) {
            return {
                focus: {},
                blur: {},
                visibilitychange: {
                    target: topDocument,
                    type: 'visibilitychange',
                }
            };
        } else {
            return {
                focus: {
                    target: top,
                    type: 'pageshow',
                },
                blur: {
                    target: top,
                    type: 'pagehide',
                },
                visibilitychange: {}
            }
        }
    } else if (typeof globalThis.document.addEventListener === 'function') {
        return {
            focus: {
                target: top,
                type: 'focus',
            },
            blur: {
                target: top,
                type: 'blur',
            },
            visibilitychange: {
                target: topDocument,
                type: 'visibilitychange',
            }
        };
    } else {
        return {
            focus: {
                target: topDocument,
                type: 'focus',
            },
            blur: {
                target: topDocument,
                type: 'blur',
            },
            visibilitychange: {
                target: topDocument,
                type: 'visibilitychange',
            }
        }
    }
}

function openURL(tried: number, url: string, timeout: number): Promise<void> {
    const config: FocusEventConfig = resolveFocusEventConfig();
    const top: WindowProxy = getTopmostWindow();
    const topDocument: Document = top.document;
    let anchor: HTMLAnchorElement | undefined = undefined;
    let iframe: HTMLIFrameElement | undefined = undefined;

    function open(): void {
        if (typeof globalThis.cordova !== 'undefined') {
            if (typeof globalThis.cordova.InAppBrowser !== 'undefined') {
                // required `cordova plugin add cordova-plugin-inappbrowser`
                globalThis.cordova.InAppBrowser.open(url, '_system');
            } else {
                globalThis.open(url, '_system');
            }

            return;
        }

        if (isUserActivationActive() || tried === 0) {
            top.location.href = url;
        } else {
            try {
                anchor = createHiddenElement('a');
                anchor.href = url;
                topDocument.body.appendChild(anchor);

                dispatchClickEvent(anchor, top);
            } catch (_: unknown) {
            } finally {
                if (typeof anchor !== 'undefined') {
                    try {
                        topDocument.body.removeChild(anchor);
                    } catch (_: unknown) {
                    }
                }
            }
        }

        try {
            iframe = createHiddenElement('iframe');
            iframe.src = url;
            topDocument.body.appendChild(iframe);

            globalThis.setTimeout(function (): void {
                if (typeof iframe !== 'undefined') {
                    try {
                        topDocument.body.removeChild(iframe);
                    } catch (_: unknown) {
                    }
                }
            }, 500);

            return;
        } catch (_: unknown) {
        }
    }

    return new Promise<void>(function (resolve: () => void, reject: () => void): void {
        // Pause here when DevTools is open — focus/blur detection is unreliable while debugging
        debugger;

        let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
        let resolved: boolean = false;

        function cleanup(): void {
            if (typeof timeoutId !== 'undefined') {
                clearTimeout(timeoutId);

                timeoutId = undefined;
            }

            try {
                removeEvent(config.blur.target, config.blur.type, onblur);
                removeEvent(config.focus.target, config.focus.type, onfocus);
                removeEvent(config.visibilitychange.target, config.visibilitychange.type, onvisibilitychange);
            } catch (_: unknown) {
                // cross-origin window
            }

            if (typeof anchor !== 'undefined') {
                try {
                    topDocument.body.removeChild(anchor);
                } catch (_: unknown) {
                }
            }

            if (typeof iframe !== 'undefined') {
                try {
                    topDocument.body.removeChild(iframe);
                } catch (_: unknown) {
                }
            }
        }

        function done(success: boolean): void {
            if (resolved) return;

            resolved = true;

            cleanup();
            if (success) resolve();
            else reject();
        }

        function onblur(): void {
            if (typeof timeoutId !== 'undefined') {
                clearTimeout(timeoutId);

                timeoutId = undefined;
            }

            removeEvent(config.blur.target, config.blur.type, onblur);
            addEvent(config.focus.target, config.focus.type, onfocus);
        }

        function onfocus(): void {
            done(true);
        }

        function onvisibilitychange(): void {
            if (isDocumentHidden()) onblur();
            else onfocus();
        }

        timeoutId = globalThis.setTimeout(function (): void {
            done(false);
        }, timeout);

        addEvent(config.blur.target, config.blur.type, onblur);
        addEvent(config.visibilitychange.target, config.visibilitychange.type, onvisibilitychange);

        if (!hasFocus(topDocument)) restoreFocus();

        try {
            open();
        } catch (_: unknown) {
            done(false);
        }
    });
}

function resolveOptions(option: AppOpenOptions): [[AppOpenedBy, URLStringOrFallback][], number] {
    const resolved: [AppOpenedBy, URLStringOrFallback][] = [];
    const os: OS = PlatformKit.os.name;

    if (os === 'unknown') throw new Error('Cannot resolve app open options: unsupported or undetected OS. (userAgent: "' + PlatformKit.userAgent + '")');

    // common
    let scheme: string | undefined;
    let fallback: URLStringOrFallback | undefined;
    let allowAppStore: boolean | undefined;
    let allowWebStore: boolean | undefined;
    let timeout: number | undefined;

    // android
    let intent: string | undefined;
    let packageName: string | undefined;

    // ios & macos
    let bundleId: string | undefined;
    let trackId: string | undefined;

    // ios
    let universal: string | undefined;

    // windows
    let packageFamilyName: string | undefined;
    let productId: string | undefined;

    switch (os) {
        case 'android':
            if (typeof option.android === 'undefined') return [[], 0];

            intent = stripURL(option.android.intent);
            scheme = stripURL(option.android.scheme);
            fallback = stripURL(option.android.fallback);
            packageName = option.android.packageName;
            allowAppStore = option.android.allowAppStore;
            allowWebStore = option.android.allowWebStore;
            timeout = option.android.timeout;

            // intent ⭢ scheme / packageName / fallback
            if (typeof intent !== 'undefined' && (typeof scheme === 'undefined' || typeof packageName === 'undefined' || typeof fallback === 'undefined')) {
                const parsed: IntentInfo = parseIntentURL(intent);

                if (typeof parsed.scheme !== 'undefined' && typeof scheme === 'undefined') scheme = parsed.scheme;
                if (typeof parsed.packageName !== 'undefined' && typeof packageName === 'undefined') packageName = parsed.packageName;
                if (typeof parsed.fallback !== 'undefined' && typeof fallback === 'undefined') fallback = parsed.fallback;
            }

            // scheme / packageName / fallback ⭢ intent
            if (typeof scheme !== 'undefined' && typeof intent === 'undefined') intent = createIntentURL(scheme, packageName, fallback);

            // default android timeout
            if (typeof timeout === 'undefined') timeout = ANDROID_DEFAULT_TIMEOUT;

            // intent ⭢ scheme ⭢ fallback ⭢ app store ⭢ web store
            if (typeof intent !== 'undefined' && canOpenIntent()) resolved.push(['intent', intent]);
            if (typeof scheme !== 'undefined') resolved.push(['scheme', scheme]);
            if (typeof fallback !== 'undefined') resolved.push(['fallback', fallback]);
            if (typeof packageName !== 'undefined') {
                if (allowAppStore) resolved.push(['store', createAppStoreURL(packageName, os)]);
                if (allowWebStore) resolved.push(['store', createWebStoreURL(packageName, os)]);
            }

            return [resolved, timeout];
        case 'ios':
            if (typeof option.ios === 'undefined') return [[], 0];

            universal = stripURL(option.ios.universal);
            scheme = stripURL(option.ios.scheme);
            fallback = stripURL(option.ios.fallback);
            bundleId = option.ios.bundleId;
            trackId = option.ios.trackId;
            allowAppStore = option.ios.allowAppStore;
            allowWebStore = option.ios.allowWebStore;
            timeout = option.ios.timeout;

            // bundle id ⭢ track id
            if (typeof bundleId !== 'undefined' && typeof trackId === 'undefined') trackId = getTrackId(bundleId);

            // default ios timeout
            if (typeof timeout === 'undefined') timeout = IOS_DEFAULT_TIMEOUT;

            // universal ⭢ scheme ⭢ fallback ⭢ app store ⭢ web store
            if (typeof universal !== 'undefined' && canOpenUniversal()) resolved.push(['universal', universal]);
            if (typeof scheme !== 'undefined') resolved.push(['scheme', scheme]);
            if (typeof fallback !== 'undefined') resolved.push(['fallback', fallback]);
            if (typeof trackId !== 'undefined') {
                if (allowAppStore) resolved.push(['store', createAppStoreURL(trackId, os)]);
                if (allowWebStore) resolved.push(['store', createWebStoreURL(trackId, os)]);
            }

            return [resolved, timeout];
        case 'windows':
            if (typeof option.windows === 'undefined') return [[], 0];

            scheme = stripURL(option.windows.scheme);
            fallback = stripURL(option.windows.fallback);
            packageFamilyName = option.windows.packageFamilyName;
            productId = option.windows.productId;
            allowAppStore = option.windows.allowAppStore;
            allowWebStore = option.windows.allowWebStore;
            timeout = option.windows.timeout;

            // package family name ⭢ product id
            if (typeof packageFamilyName !== 'undefined' && typeof productId === 'undefined') productId = getProductId(packageFamilyName);

            // default windows timeout
            if (typeof timeout === 'undefined') timeout = WINDOWS_DEFAULT_TIMEOUT;

            // scheme ⭢ fallback ⭢ app store ⭢ web store
            if (typeof scheme !== 'undefined') resolved.push(['scheme', scheme]);
            if (typeof fallback !== 'undefined') resolved.push(['fallback', fallback]);
            if (typeof productId !== 'undefined') {
                if (allowAppStore) resolved.push(['store', createAppStoreURL(productId, os)]);
                if (allowWebStore) resolved.push(['store', createWebStoreURL(productId, os)]);
            }

            return [resolved, timeout];
        case 'macos':
            if (typeof option.macos === 'undefined') return [[], 0];

            scheme = stripURL(option.macos.scheme);
            fallback = stripURL(option.macos.fallback);
            bundleId = option.macos.bundleId;
            trackId = option.macos.trackId;
            allowAppStore = option.macos.allowAppStore;
            allowWebStore = option.macos.allowWebStore;
            timeout = option.macos.timeout;

            // bundle id ⭢ track id
            if (typeof bundleId !== 'undefined' && typeof trackId === 'undefined') trackId = getTrackId(bundleId);

            // default macos timeout
            if (typeof timeout === 'undefined') timeout = MACOS_DEFAULT_TIMEOUT;

            // scheme ⭢ fallback ⭢ app store ⭢ web store
            if (typeof scheme !== 'undefined') resolved.push(['scheme', scheme]);
            if (typeof fallback !== 'undefined') resolved.push(['fallback', fallback]);
            if (typeof trackId !== 'undefined') {
                if (allowAppStore) resolved.push(['store', createAppStoreURL(trackId, os)]);
                if (allowWebStore) resolved.push(['store', createWebStoreURL(trackId, os)]);
            }

            return [resolved, timeout];
    }
}

function canOpenIntent(): boolean {
    if (PlatformKit.os.name !== 'android') return false;

    const browser: Browsers = PlatformKit.browser.name;
    const version: string = PlatformKit.browser.version;

    // Browser:     Samsung Internet
    // Version:     17.0.1.69 ≤ v < 17.0.4.3 (17.0.1.69, 17.0.2.69)
    // Bug:         `intent://` links open a blank tab instead of launching the target app. (window.open(_blank))
    // Rationale:   The regression is reported for 17.0.1; Test results show that the bug persists up to version 17.0.2.69.
    // Sources:     https://forum.developer.samsung.com/t/chrome-intent-scheme/20237
    // if (browser === 'samsung' && PlatformKit.compareVersion(version, '17.0.1.69') >= 0 && PlatformKit.compareVersion(version, '17.0.4.3') < 0) return false;

    // Browser:     Firefox
    // Version:     v < 41.0
    // Bug:         `intent://` links cannot launch apps because Intent URI handling is not implemented yet.
    // Rationale:   The Firefox for Android 41.0 release notes list “Open Android applications from a webpage via Intent URIs” as a new feature, implying earlier versions did not support it.
    // Sources:     https://bugzilla.mozilla.org/show_bug.cgi?id=851693
    if (browser === 'firefox' && PlatformKit.compareVersion(version, '41.0') < 0) return false;

    // Browser:     Firefox
    // Version:     59.0 ≤ v < 68.11.0
    // Bug:         When an `intent://` URL contains a `package` parameter, Firefox may incorrectly redirect to the Play Store (or fail to launch the installed app) even if the app is already installed.
    // Rationale:   Bugzilla bug 851693 comments report a regression in the 59.x range where a `package` parameter causes Play Store redirection; no explicit fix is documented for 58–68 Fennec, and 68.11.0 is announced as the final Fennec release, so we conservatively assume the entire 58–68.10.* range is impacted.
    // Sources:     https://bugzilla.mozilla.org/show_bug.cgi?id=1453784
    if (browser === 'firefox' && PlatformKit.compareVersion(version, '59.0') >= 0 && PlatformKit.compareVersion(version, '68.11.0') < 0) return false;

    // Browser:     Firefox
    // Version:     80.0 ≤ v < 82.0
    // Bug:         Index links / `intent://` URLs may open the Play Store instead of the already-installed target app when loaded inside Firefox for Android (Fenix).
    // Rationale:   GitHub issue mozilla-mobile/fenix#12746 and related Support threads describe installed apps being ignored and links going to Play Store starting from 79; follow-up comments indicate fixes landing and QA verification around 81–82.
    // Sources:     https://github.com/mozilla-mobile/fenix/issues/12746
    if (browser === 'firefox' && PlatformKit.compareVersion(version, '80.0') >= 0 && PlatformKit.compareVersion(version, '82.0') < 0) return false;

    // Browser:     Firefox
    // Version:     96.0 ≤ v < 107.0
    // Bug:         `S.browser_fallback_url` is always followed even when the target app is installed and should handle the intent, causing the fallback URL to load unnecessarily and potentially leaking SameSite=Strict cookies across contexts.
    // Rationale:   Fenix issue #23397 reports `S.browser_fallback_url` always being executed in 96.2.0, and CVE-2022-45413 documents the SameSite cookie leak for Firefox for Android versions prior to 107, so we treat 96–106.* as affected.
    // Sources:     https://github.com/mozilla-mobile/fenix/issues/23397
    if (browser === 'firefox' && PlatformKit.compareVersion(version, '96.0') >= 0 && PlatformKit.compareVersion(version, '107.0') < 0) return false;

    // Browser:     Opera
    // Version:     v < 14.0
    // Bug:         Presto-based Opera for Android does not reliably support Chrome-style `intent://` links for launching installed apps.
    // Rationale:   Opera switched from Presto to Chromium around Opera 14; prior to this, its engine did not fully implement Chrome-specific Android Intent URI semantics.
    // Sources:     https://forums.opera.com/topic/11318
    if (browser === 'opera' && PlatformKit.compareVersion(version, '14.0') < 0) return false;

    // Browser:     Facebook / Instagram / WeChat / TicTok in-app browsers
    // Version:
    // Bug:
    // Rationale:
    // Sources:     https://developers.facebook.com/community/threads/470205278761649
    return !(/(?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/[\w.]+;/i.test(PlatformKit.userAgent) || /instagram[\/ ][-\w.]+/i.test(PlatformKit.userAgent) || /micromessenger\/([\w.]+)/i.test(PlatformKit.userAgent) || /musical_ly(?:.+app_?version\/|_)[\w.]+/i.test(PlatformKit.userAgent) || /ultralite app_version\/[\w.]+/i.test(PlatformKit.userAgent));
}

function canOpenUniversal(): boolean {
    return PlatformKit.os.name === 'ios' && PlatformKit.compareVersion(PlatformKit.os.version, '9.0') >= 0;
}

function canOpenSetting(): boolean {
    const os: OS = PlatformKit.os.name;
    const version: string = PlatformKit.os.version;

    return !(
        os === 'unknown'
        || (os === 'android' && !canOpenIntent())
        || os === 'ios'
        || (os === 'windows' && (version === 'Vista' || version === 'XP' || version === '2000' || version === 'NT 4.0' || version === 'NT 3.11' || version === 'ME' || PlatformKit.compareVersion(version, '10') < 0))
        || (os === 'macos' && PlatformKit.compareVersion(version, '10.10') < 0)
    );
}

function parseIntentURL(intent: string): IntentInfo {
    const parsed: IntentInfo = {};
    const split: string[] = intent.split('#Intent;');

    if (split.length !== 2) return parsed;

    const host: string = split[0].replace(/^intent:\/\//i, '');
    const parameterString: string = split[1].replace(/;?end\s*$/i, '');
    const parameters: string[] = parameterString.split(';');
    const extras: Record<string, string> = {};

    for (let i: number = 0; i < parameters.length; i++) {
        const part: string = parameters[i];
        const index: number = part.indexOf('=');

        if (index !== -1) extras[part.substring(0, index)] = part.substring(index + 1);
    }

    if (typeof extras['scheme'] !== 'undefined') {
        if (host.length > 0) parsed.scheme = extras['scheme'] + '://' + host;
        else parsed.scheme = extras['scheme'] + '://';
    }

    if (typeof extras['package'] !== 'undefined') parsed.packageName = extras['package'];

    if (typeof extras['S.browser_fallback_url'] !== 'undefined') {
        let fallback: string = extras['S.browser_fallback_url'];

        try {
            fallback = globalThis.decodeURIComponent(fallback);
        } catch (_: unknown) {
        }

        if (/^https?:\/\//i.test(fallback)) parsed.fallback = fallback;
    }

    return parsed;
}

function createIntentURL(scheme: string, packageName?: string, fallback?: string | (() => any)): string {
    const split: string[] = scheme.split('://');
    const prefix: string = split[0];
    const suffix: string = split[1];

    let intent: string = 'intent://';

    if (typeof suffix !== 'undefined') intent += suffix;

    intent += '#Intent;scheme=' + prefix + ';' + 'action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;';

    if (typeof packageName !== 'undefined') intent += 'package=' + packageName + ';';
    if (typeof fallback !== 'undefined' && typeof fallback === 'string') intent += 'S.browser_fallback_url=' + globalThis.encodeURIComponent(fallback) + ';';
    else if (typeof packageName !== 'undefined') intent += 'S.browser_fallback_url=' + globalThis.encodeURIComponent(createAppStoreURL(packageName, 'android')!) + ';';

    return intent + 'end';
}

function createAppStoreURL(id: string, os: Exclude<OS, 'unknown'>): string {
    switch (os) {
        case 'android':
            return 'market://details?id=' + id;
        case 'ios':
            return 'itms-apps://itunes.apple.com/app/id' + id + '?mt=8';
        case 'windows':
            return 'ms-windows-store://pdp/?ProductId=' + id;
        case 'macos':
            return 'macappstore://itunes.apple.com/app/id' + id + '?mt=12';
        default:
            return os satisfies never;
    }
}

function createWebStoreURL(id: string, os: Exclude<OS, 'unknown'>): string {
    switch (os) {
        case 'android':
            return 'https://play.google.com/store/apps/details?id=' + id;
        case 'ios':
            return 'https://itunes.apple.com/app/id' + id + '?mt=8';
        case 'windows':
            return 'https://apps.microsoft.com/detail/' + id;
        case 'macos':
            return 'https://apps.apple.com/app/id' + id + '?mt=12';
        default:
            return os satisfies never;
    }
}

function escapeURIComponentString(value: string): string {
    return globalThis.encodeURIComponent(value)
        .replace(/[!'()*]/g, function (char: string): string {
            return '%' + char.charCodeAt(0).toString(16);
        });
}

function sanitizeSMSRecipient(value: string): string {
    return value.replace(/[^\d+\-.]/g, '');
}

function escapeURIComponentMailAddressString(value: string): string {
    return escapeURIComponentString(value)
        .replace(/%40/g, '@')
        .replace(/%2C/gi, ',');
}

function encodeMailBody(value: string): string {
    return escapeURIComponentString(value.replace(/\r\n|\n|\r/g, '\r\n'));
}

function toArray(value: string | string[] | undefined): string[] {
    return typeof value === 'undefined' ? [] : typeof value === 'string' ? [value] : value;
}

function joining<T>(values: ArrayLike<T>, mapfn: ((value: T) => string) | undefined = undefined, separator: string = ','): string {
    const length: number = values.length;
    let result: string = '';

    for (let i: number = 0; i < length; i++) {
        if (i !== 0) result += separator;

        if (typeof mapfn !== 'undefined') result += mapfn(values[i]);
        else result += values[i];
    }

    return result;
}

function tokenize(string: string): string[] {
    if (string === '') return [];

    return string
        .split(/\s*[,，]\s*/)
        .filter(function (string: string): boolean {
            return string !== '';
        });
}

function flatten<T>(arrays: T[][]): T[] {
    const result: T[] = [];

    for (let i: number = 0; i < arrays.length; i++) {
        const sub: T[] = arrays[i];

        for (let j: number = 0; j < sub.length; j++) {
            result.push(sub[j]);
        }
    }

    return result;
}

function isUserActivationActive(): boolean {
    return typeof NAVIGATOR !== 'undefined' && typeof NAVIGATOR.userActivation !== 'undefined' && NAVIGATOR.userActivation.isActive;
}

function canShowDirectoryPicker(): boolean {
    return typeof globalThis.showDirectoryPicker === 'function';
}

function canShowOpenFilePicker(): boolean {
    return typeof globalThis.showOpenFilePicker === 'function';
}

function isFileSystemFileHandle(handle: FileSystemHandle): handle is FileSystemFileHandle {
    return handle.kind === 'file';
}

function isFileSystemDirectoryHandle(handle: FileSystemHandle): handle is FileSystemDirectoryHandle {
    return handle.kind === 'directory';
}

function fileListToArray(fileList: FileList | null): File[] {
    const files: File[] = [];

    if (fileList === null) return files;

    for (let i: number = 0; i < fileList.length; i++) {
        const file: File = fileList[i];

        files.push(file);
    }

    return files;
}

function setWebkitRelativePath(file: File, path: string = file.webkitRelativePath): File {
    Object.defineProperty(
        file,
        'webkitRelativePath',
        {
            value: path,
            writable: false,
            configurable: true,
            enumerable: true,
        }
    );

    return file;
}

function resolveFile(module: HTMLInputElement | Promise<FileSystemDirectoryHandle> | Promise<FileSystemFileHandle[]>): Promise<File[]> {
    const top: WindowProxy = getTopmostWindow();
    const topDocument: Document = top.document;
    const config: FocusEventConfig = resolveFocusEventConfig();

    function resolveFileSystemHandle(module: Promise<FileSystemDirectoryHandle> | Promise<FileSystemFileHandle[]>, resolve: (files: File[]) => void, reject: (reason?: any) => void): void {
        module
            .then(function (result: FileSystemDirectoryHandle | FileSystemFileHandle[]) {
                if (isArray(result)) {
                    const handles: Promise<File>[] = [];

                    for (let i: number = 0; i < result.length; i++) handles[i] = result[i].getFile();

                    return Promise
                        .all(handles)
                        .then(resolve)
                        .catch(reject);
                } else if (isFileSystemDirectoryHandle(result)) {
                    return walk(result, result.name)
                        .then(resolve)
                        .catch(reject);
                }
            })
            .catch(function (error: unknown): void {
                if (isDOMException(error) && error.name === 'AbortError') return resolve([]);

                reject(error);
            });
    }

    function resolveInput(module: HTMLInputElement, resolve: (files: File[]) => void): void {
        let resolved: boolean = false;

        function done(success: boolean): void {
            if (resolved) return;

            resolved = true;
            cleanup();

            if (!success) return resolve([]);

            resolve(fileListToArray(module.files));
        }

        function onfocus(): void {
            globalThis.setTimeout(function (): void {
                if (module.value.length > 0) done(true);
                else done(false);
            }, 1000);
        }

        function onvisibilitychange(): void {
            if (!isDocumentHidden()) onfocus();
        }

        function onclick(): void {
            done(false);
        }

        module.onchange = function (): void {
            done(true);
        };

        if (CLEANUP_INPUT_ELEMENT !== null) CLEANUP_INPUT_ELEMENT();

        if (typeof module.oncancel !== 'undefined') {
            module.oncancel = function (): void {
                done(false);
            };
        } else {
            module.onclick = function (): void {
                addEvent(config.focus.target, config.focus.type, onfocus);
                addEvent(config.visibilitychange.target, config.visibilitychange.type, onvisibilitychange);
                globalThis.setTimeout(function (): void {
                    addEvent(topDocument, 'click', onclick);
                }, 100);

                CLEANUP_INPUT_ELEMENT = function (): void {
                    done(false);
                };
            }
        }

        function cleanup(): void {
            CLEANUP_INPUT_ELEMENT = null;

            try {
                removeEvent(config.focus.target, config.focus.type, onfocus);
                removeEvent(config.visibilitychange.target, config.visibilitychange.type, onvisibilitychange);
                removeEvent(topDocument, 'click', onclick);
            } catch (_) {
            }
        }

        dispatchClickEvent(module);
    }

    return new Promise(function (resolve: (files: File[]) => void, reject: (reason?: any) => void): void {
        if (isPromise(module)) return resolveFileSystemHandle(module, resolve, reject);
        else if (isHTMLInputElementLike(module)) return resolveInput(module, resolve);
        else reject(new TypeError('resolveFile expects an HTMLInputElement or a file-system handle Promise, but received: ' + Object.prototype.toString.call(module)));
    });
}

function walk(directory: FileSystemDirectoryHandle, basePath: string = ''): Promise<File[]> {
    return new Promise(function (resolve: (files: File[]) => void, reject: (reason?: any) => void): void {
        const iterator: AsyncIterableIterator<FileSystemHandle> = directory.values();
        const handles: FileSystemHandle[] = [];

        function collectNext(): void {
            iterator
                .next()
                .then(function (result: IteratorResult<FileSystemHandle>): void {
                    if (result.done) {
                        processHandles();
                        return;
                    }

                    handles.push(result.value);
                    collectNext();
                })
                .catch(reject);
        }

        function processHandles(): void {
            const promises: Promise<File[]>[] = [];

            for (let i: number = 0; i < handles.length; i++) {
                const handle: FileSystemHandle = handles[i];
                const name: string = handle.name;
                let path: string;

                if (basePath === '') path = name;
                else path = basePath + '/' + name;

                if (isFileSystemFileHandle(handle)) {
                    const filePromise: Promise<File[]> = handle
                        .getFile()
                        .then(function (file: File): File[] {
                            return [setWebkitRelativePath(file, path)];
                        });

                    promises.push(filePromise);
                } else if (isFileSystemDirectoryHandle(handle)) {
                    promises.push(walk(handle, path));
                }
            }

            Promise
                .all(promises)
                .then(flatten)
                .then(resolve)
                .catch(reject);
        }

        collectNext();
    });
}

const LaunchKit: LaunchKitInstance = {
    SettingType: SettingType,
    version: packageJSON.version,

    utils: {
        get canOpenIntent(): boolean {
            return canOpenIntent();
        },

        get canOpenUniversal(): boolean {
            return canOpenUniversal();
        },

        get canOpenSetting(): boolean {
            return canOpenSetting();
        },

        getTrackId: getTrackIdAsync,
        getProductId: getProductIdAsync,
    },

    app(options: AppOpenOptions = {}): Promise<AppOpenedBy> {
        let resolved: [[AppOpenedBy, URLStringOrFallback][], number];

        try {
            resolved = resolveOptions(options);
        } catch (error: unknown) {
            return Promise.reject(error);
        }

        const tried: string[] = [];
        const urls: [AppOpenedBy, URLStringOrFallback][] = resolved[0];
        const timeout: number = resolved[1];

        if (urls.length === 0) return Promise.reject(new Error('No openable URL candidates were resolved for the current OS ("' + PlatformKit.os.name + '"). Provide at least one of: scheme, intent, universal, fallback, or store id for this platform.'));

        return new Promise(function (resolve: (value: AppOpenedBy) => void, reject: (urlOpenError: Error) => void): Promise<void> | void {
            function openURLSequential(index: number = 0): Promise<void> | void {
                if (index >= urls.length) return reject(new Error('Failed to open the application using all available URLs.\n\n' + 'Attempted URLs:\n' + joining(tried, undefined, '\n↓\n')));

                const entry: [AppOpenedBy, URLStringOrFallback] = urls[index];
                const by: AppOpenedBy = entry[0];
                const url: URLStringOrFallback = entry[1];

                if (typeof url === 'string') {
                    tried[index] = url;

                    return openURL(index, url, timeout)
                        .then(function (): void {
                            resolve(by);
                        })
                        .catch(function (): void {
                            openURLSequential(index + 1);
                        });
                } else {
                    tried[index] = '[function fallback]';

                    url();
                    resolve(by);
                }
            }

            return openURLSequential();
        });
    },

    telephone(options: TelephoneOptions = {}): Promise<void> {
        let url: string = 'tel:';

        // RFC 3966: '+' is a delimiter and MUST NOT be percent-encoded; visual separators (- . space parens) are stripped before dialing
        // https://datatracker.ietf.org/doc/html/rfc3966#section-3
        if (typeof options.to !== 'undefined') url += options.to.replace(/[^\d+*#]/g, '');

        return openURL(0, url, getDefaultTimeout());
    },

    message(options: MessageOptions = {}): Promise<void> {
        const to: string[] = toArray(options.to);
        let url: string = 'sms:';

        // Apple URL Scheme Reference: sms recipient may contain only 0-9, '+', '-', '.'
        // https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/SMSLinks/SMSLinks.html
        if (to.length > 0) url += joining(to, sanitizeSMSRecipient);

        if (typeof options.body !== 'undefined') {
            // iOS < 7 needs ';body=', iOS 7 cannot prefill body at all, iOS 8+ needs '&body=', everything else follows RFC 5724 '?body='
            // https://weblog.west-wind.com/posts/2013/Oct/09/Prefilling-an-SMS-on-Mobile-Devices-with-the-sms-Uri-Scheme
            if (PlatformKit.os.name !== 'ios') url += '?';
            else if (PlatformKit.compareVersion(PlatformKit.os.version, '8.0') >= 0) url += '&';
            else url += ';';

            url += 'body=' + escapeURIComponentString(options.body);
        }

        return openURL(0, url, getDefaultTimeout());
    },

    mail(options: MailOptions = {}): Promise<void> {
        const params: string[] = [];
        const to: string[] = toArray(options.to);
        const cc: string[] = toArray(options.cc);
        const bcc: string[] = toArray(options.bcc);
        let url: string = 'mailto:';

        // mailto: — RFC 6068
        // https://datatracker.ietf.org/doc/html/rfc6068
        if (to.length > 0) url += joining(to, escapeURIComponentMailAddressString);
        if (cc.length > 0) params.push('cc=' + joining(cc, escapeURIComponentMailAddressString));
        if (bcc.length > 0) params.push('bcc=' + joining(bcc, escapeURIComponentMailAddressString));
        if (typeof options.subject === 'string') params.push('subject=' + escapeURIComponentString(options.subject));
        if (typeof options.body === 'string') params.push('body=' + encodeMailBody(options.body));

        if (params.length > 0) url += '?' + joining(params, undefined, '&');

        return openURL(0, url, getDefaultTimeout());
    },

    filepicker(options: FilepickerOptions = {}): Promise<File[]> {
        let module: HTMLInputElement | Promise<FileSystemDirectoryHandle> | Promise<FileSystemFileHandle[]>;
        let accepts: string[] = [];

        if (isArray(options.accept)) accepts = options.accept;
        else if (typeof options.accept === 'string') accepts = tokenize(options.accept);

        if (options.directory) {
            if (canShowDirectoryPicker()) {
                const option: OpenDirectoryPickerOptions = {mode: 'read'};

                if (typeof options.id !== 'undefined') option.id = options.id;
                if (typeof options.startIn !== 'undefined') option.startIn = options.startIn;

                module = globalThis.showDirectoryPicker(option);
            } else {
                const input: HTMLInputElement = createHiddenElement('input');

                input.type = 'file';
                input.webkitdirectory = true;
                input.accept = accepts.join(',');

                module = input;
            }
        } else {
            if (canShowOpenFilePicker()) {
                const option: OpenFilePickerOptions = {};

                if (typeof options.id !== 'undefined') option.id = options.id;
                if (typeof options.startIn !== 'undefined') option.startIn = options.startIn;
                if (typeof options.multiple !== 'undefined') option.multiple = options.multiple;

                if (accepts.length > 0) {
                    const acceptObject: Record<string, string[]> = {};

                    option.excludeAcceptAllOption = true;
                    option.types = [{
                        description: '',
                        accept: acceptObject,
                    }];

                    for (let i: number = 0; i < accepts.length; i++) {
                        const accept: string = accepts[i];

                        if (accept.startsWith('.')) {
                            if (typeof acceptObject['application/octet-stream'] === 'undefined') acceptObject['application/octet-stream'] = [];

                            acceptObject['application/octet-stream'].push(accept);
                        } else if (accept.includes('/')) {
                            acceptObject[accept] = [];
                        }
                    }
                }

                module = globalThis.showOpenFilePicker(option);
            } else {
                const input: HTMLInputElement = createHiddenElement('input');

                input.type = 'file';
                input.accept = accepts.join(',');
                if (typeof options.multiple !== 'undefined') input.multiple = options.multiple;

                module = input;
            }
        }

        return resolveFile(module);
    },

    setting(type: SettingType = SettingType.General): Promise<void> {
        const os: OS = PlatformKit.os.name;
        const version: string = PlatformKit.os.version;
        const urls: string[] = [];

        if (!canOpenSetting()) return Promise.reject(new Error('Opening system settings is not supported on this platform. (userAgent: "' + PlatformKit.userAgent + '")'));

        switch (os) {
            case 'android':
                // https://developer.android.com/reference/android/provider/Settings
                if (
                    (type === 'accessibility' && PlatformKit.compareVersion(version, '2.0') < 0)    // API 5
                    || (type === 'battery' && PlatformKit.compareVersion(version, '5.1') < 0)       // API 22
                    || (type === 'accounts' && PlatformKit.compareVersion(version, '1.5') < 0)      // API 3
                    || (type === 'storage' && PlatformKit.compareVersion(version, '1.5') < 0)       // API 3
                    || type === 'general'
                ) {
                    urls.push(SETTING_URL.android.general);
                    break;
                }

                urls.push(SETTING_URL.android[type]);
                urls.push(SETTING_URL.android.general);
                break;
            case 'windows':
                urls.push(SETTING_URL.windows[type]);
                break;
            case 'macos':
                // https://www.apple.com/uk/newsroom/2018/06/apple-introduces-macos-mojave/
                if (type === 'appearance' && PlatformKit.compareVersion(version, '10.14') < 0) urls.push(SETTING_URL.macos.general);
                else if (PlatformKit.compareVersion(version, '13.0') < 0) urls.push(SETTING_URL.macos[type]);
                else urls.push(SETTING_URL.macos13[type]);
        }

        return new Promise(function (resolve: () => void, reject: (urlOpenError: Error) => void): Promise<void> | void {
            function openURLSequential(index: number = 0): Promise<void> | void {
                if (index >= urls.length) return reject(new Error('Failed to open the "' + type + '" settings pane using all available URLs.\n\nAttempted URLs:\n' + joining(urls, undefined, '\n↓\n')));

                return openURL(index, urls[index], SETTING_DEFAULT_TIMEOUT)
                    .then(function (): void {
                        resolve();
                    })
                    .catch(function (): void {
                        openURLSequential(index + 1);
                    });
            }

            return openURLSequential();
        });
    },
}

export default LaunchKit;
