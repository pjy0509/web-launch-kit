export function getTopmostWindow(): WindowProxy {
    try {
        if (globalThis.top !== null && globalThis.top !== globalThis.window) {
            void globalThis.top.location.href;
            return globalThis.top;
        }
    } catch (_: unknown) {
    }

    return globalThis as unknown as WindowProxy;
}
