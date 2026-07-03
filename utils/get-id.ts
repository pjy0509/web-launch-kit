import LocaleKit from "web-locale-kit";

declare global {
    interface Map<K, V> {
        get(key: K): V | undefined;

        has(key: K): boolean;

        set(key: K, value: V): this;

        delete(key: K): boolean;
    }

    interface MapConstructor {
        new<K, V>(): Map<K, V>;
    }

    var Map: MapConstructor;
}

interface IdCache {
    get(mode: string, query: string): string | undefined;

    set(mode: string, query: string, id: string): void;
}

interface IOSAndMacOSLookupAppInfo {
    resultCount?: number;
    results?: IOSAndMacOSLookupAppResult[];
}

interface IOSAndMacOSLookupAppResult {
    trackId: number;
}

interface WindowsAppInfo {
    Products?: WindowsAppProduct[];
    Product?: WindowsAppProduct;
}

interface WindowsAppProduct {
    ProductId?: string;
}

const TRACK_ID = 'track-id';
const BUNDLE_ID = 'bundle-id';
const TRACK_ID_CACHE_TTL: number = 1000 * 60 * 60;
const idCache: IdCache = (function (): IdCache {
    let supportsLocalStorage: boolean;

    try {
        if (typeof globalThis.localStorage === 'undefined') {
            supportsLocalStorage = false;
        } else {
            const key: string = '__id_cache_test__';

            globalThis.localStorage.setItem(key, '');
            globalThis.localStorage.removeItem(key);

            supportsLocalStorage = true;
        }
    } catch (_: unknown) {
        // Safari Private Mode / Storage Disabled / Quota Exceeded
        supportsLocalStorage = false;
    }

    if (supportsLocalStorage) {
        return {
            get(mode: string, query: string): string | undefined {
                try {
                    const item: string | null = globalThis.localStorage.getItem(mode + ':' + query);

                    if (item == null) return undefined;

                    const split: string[] = item.split('|');

                    if (split.length !== 2) return undefined;

                    const expiry: number = +split[0];

                    if (isNotANumber(expiry) || expiry < getNow()) {
                        globalThis.localStorage.removeItem(mode + ':' + query);

                        return undefined;
                    }

                    return split[1];
                } catch (_: unknown) {
                    return undefined;
                }
            },

            set(mode: string, query: string, id: string): void {
                try {
                    globalThis.localStorage.setItem(mode + ':' + query, getNow() + TRACK_ID_CACHE_TTL + '|' + id);
                } catch (_: unknown) {
                    return;
                }
            }
        }
    }

    if (typeof globalThis.Map !== 'undefined') {
        const cache: Map<string, string | undefined> = new Map<string, string | undefined>();

        return {
            get(mode: string, query: string): string | undefined {
                const item: string | undefined = cache.get(mode + ':' + query);

                if (typeof item === 'undefined') return undefined;

                const split: string[] = item.split('|');

                if (split.length !== 2) return undefined;

                const expiry: number = +split[0];

                if (isNotANumber(expiry) || expiry < getNow()) {
                    cache.delete(mode + ':' + query);

                    return undefined;
                }

                return split[1];
            },

            set(mode: string, query: string, id: string): void {
                cache.set(mode + ':' + query, getNow() + TRACK_ID_CACHE_TTL + '|' + id);
            },
        }
    }

    const cache: Record<string, string | undefined> = Object.create(null);

    return {
        get(mode: string, query: string): string | undefined {
            const item: string | undefined = cache[mode + ':' + query];

            if (typeof item === 'undefined') return undefined;

            const split: string[] = item.split('|');

            if (split.length !== 2) return undefined;

            const expiry: number = +split[0];

            if (isNotANumber(expiry) || expiry < getNow()) {
                try {
                    delete cache[mode + ':' + query];
                } catch (_: unknown) {
                    cache[mode + ':' + query] = undefined;
                }

                return undefined;
            }

            return split[1];
        },

        set(mode: string, query: string, id: string): void {
            cache[mode + ':' + query] = getNow() + TRACK_ID_CACHE_TTL + '|' + id;
        }
    }
})();

function isNotANumber(value: number): boolean {
    return value !== value;
}

function getNow(): number {
    if (typeof Date.now !== 'undefined') return Date.now();
    return (new Date).getTime();
}

function requestGet<T>(url: string, async: true): Promise<T | undefined>;
function requestGet<T>(url: string, async?: false): T | undefined;
function requestGet<T>(url: string, async: boolean = false): Promise<T | undefined> | (T | undefined) {
    if (typeof globalThis.fetch === 'function' && async) {
        return globalThis.fetch(url)
            .then(function (response: Response): Promise<any> {
                return response.json();
            })
            .catch(function (_: unknown): void {
                return undefined;
            });
    } else {
        try {
            const xhr: XMLHttpRequest = new XMLHttpRequest();

            xhr.open('GET', url, async);
            xhr.send();

            const status: number = xhr.status;

            if (status >= 200 && status < 300) return JSON.parse(xhr.response);
            return undefined;
        } catch (_: unknown) {
            return undefined;
        }
    }
}

function resolveGetProductIdURL(packageFamilyName: string): string {
    const locales: readonly string[] = LocaleKit.languages;
    let locale: string = 'en-US';
    let country: string = 'US';

    for (let i: number = 0; i < locales.length; i++) {
        const candidate: string = locales[i];

        if (candidate.indexOf('-') === -1) continue;

        const subtags: string[] = candidate.split('-');

        for (let j: number = 1; j < subtags.length; j++) {
            const subtag: string = subtags[j];

            if (/^[A-Za-z]{2}$/.test(subtag) || /^\d{3}$/.test(subtag)) {
                locale = candidate;
                country = subtag;
                break;
            }
        }

        if (locale === candidate) break;
    }

    return 'https://displaycatalog.md.mp.microsoft.com/v7.0/products/lookup?value=' + globalThis.encodeURIComponent(packageFamilyName) + '&market=' + globalThis.encodeURIComponent(country) + '&languages=' + globalThis.encodeURIComponent(locale) + '&alternateId=PackageFamilyName';
}

function resolveGetTrackIdURL(bundleId: string): string {
    return 'https://itunes.apple.com/lookup?bundleId=' + globalThis.encodeURIComponent(bundleId);
}

function parseGetProductIdResponse(response: WindowsAppInfo | undefined): string | undefined {
    if (typeof response === 'undefined') return undefined;

    let product: WindowsAppProduct | undefined | null = undefined;

    if (typeof response.Products !== 'undefined') product = response.Products[0];
    else if (typeof response.Product !== 'undefined') product = response.Product;

    if (typeof product === 'undefined' || product === null) return undefined;

    return product.ProductId;
}

function parseGetTrackIdResponse(response: IOSAndMacOSLookupAppInfo | undefined): string | undefined {
    if (typeof response === 'undefined' || typeof response.results === 'undefined') return undefined;

    const results: IOSAndMacOSLookupAppResult[] = response.results;

    if (results.length === 0) return undefined;

    const result: IOSAndMacOSLookupAppResult = results[0];

    if (typeof result === 'undefined') return undefined;

    return '' + result.trackId;
}

export function getProductId(packageFamilyName: string): string | undefined {
    const cache: string | undefined = idCache.get(BUNDLE_ID, packageFamilyName);

    if (typeof cache !== 'undefined') return cache;

    try {
        const productId: string | undefined = parseGetProductIdResponse(requestGet<WindowsAppInfo>(resolveGetProductIdURL(packageFamilyName)));

        if (typeof productId === 'undefined') return undefined;

        idCache.set(BUNDLE_ID, packageFamilyName, productId);

        return productId;
    } catch (_: unknown) {
        return undefined;
    }
}

export function getTrackId(bundleId: string): string | undefined {
    const cache: string | undefined = idCache.get(TRACK_ID, bundleId);

    if (typeof cache !== 'undefined') return cache;

    try {
        const trackId: string | undefined = parseGetTrackIdResponse(requestGet<IOSAndMacOSLookupAppInfo>(resolveGetTrackIdURL(bundleId)));

        if (typeof trackId === 'undefined') return undefined;

        idCache.set(TRACK_ID, bundleId, trackId);

        return trackId;
    } catch (_: unknown) {
        return undefined;
    }
}


export function getProductIdAsync(packageFamilyName: string): Promise<string | undefined> {
    const cache: string | undefined = idCache.get(BUNDLE_ID, packageFamilyName);

    if (typeof cache !== 'undefined') return Promise.resolve(cache);

    try {
        return requestGet<WindowsAppInfo>(resolveGetProductIdURL(packageFamilyName), true)
            .then(parseGetProductIdResponse)
            .then(function (productId: string | undefined): string | undefined {
                if (typeof productId === 'undefined') return undefined;

                idCache.set(BUNDLE_ID, packageFamilyName, productId);

                return productId;
            });
    } catch (_: unknown) {
        return Promise.resolve(undefined);
    }
}

export function getTrackIdAsync(bundleId: string): Promise<string | undefined> {
    const cache: string | undefined = idCache.get(TRACK_ID, bundleId);

    if (typeof cache !== 'undefined') return Promise.resolve(cache);

    try {
        return requestGet<IOSAndMacOSLookupAppInfo>(resolveGetTrackIdURL(bundleId), true)
            .then(parseGetTrackIdResponse)
            .then(function (trackId: string | undefined): string | undefined {
                if (typeof trackId === 'undefined') return undefined;

                idCache.set(TRACK_ID, bundleId, trackId);

                return trackId;
            });
    } catch (_: unknown) {
        return Promise.resolve(undefined);
    }
}
