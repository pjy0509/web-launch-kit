declare global {
    interface EventTarget {
        attachEvent?(type: string, listener: (event: Event) => void): void;
        detachEvent?(type: string, listener: (event: Event) => void): void;
    }
}

type IEWrapper = (event: Event) => void;
type IEWrapperRecord = {
    target: EventTarget;
    type: string;
    callback: EventListenerOrEventListenerObject;
    wrapper: IEWrapper;
};

const IE_WRAPPER_STORE: IEWrapperRecord[] = [];
const VENDORS: string[] = ['', 'webkit', 'moz', 'ms', 'MS', 'o', 'O'];
const LEGACY_TYPE_MAP: Record<string, string[]> = {
    'focus': ['focus', 'focusin'],
    'blur': ['blur', 'focusout'],
};

function resolveVendor(target: EventTarget, type: string): string {
    let types: string[];
    const legacy: string[] | undefined = LEGACY_TYPE_MAP[type];

    if (typeof legacy !== 'undefined') types = legacy;
    else types = [type];

    for (let i: number = 0; i < VENDORS.length; i++) {
        for (let j: number = 0; j < types.length; j++) {
            const name: string = VENDORS[i] + types[j];

            if (typeof (target as unknown as Record<string, unknown>)['on' + name] !== 'undefined') return name;
        }
    }

    return type;
}

function findIEWrapper(target: EventTarget, type: string, callback: (evt: Event) => void): IEWrapper | undefined {
    for (let i: number = 0; i < IE_WRAPPER_STORE.length; i++) {
        const wrapper: IEWrapperRecord = IE_WRAPPER_STORE[i];

        if (wrapper.target === target && wrapper.type === type && wrapper.callback === callback) return wrapper.wrapper;
    }

    return undefined;
}

function setIEWrapper(target: EventTarget, type: string, callback: (evt: Event) => void, wrapper: IEWrapper): void {
    IE_WRAPPER_STORE.push({target, type, callback, wrapper});
}

function removeIEWrapper(target: EventTarget, type: string, callback: (evt: Event) => void): IEWrapper | undefined {
    for (let i: number = 0; i < IE_WRAPPER_STORE.length; i++) {
        const wrapper: IEWrapperRecord = IE_WRAPPER_STORE[i];

        if (wrapper.target === target && wrapper.type === type && wrapper.callback === callback) {
            IE_WRAPPER_STORE.splice(i, 1);

            return wrapper.wrapper;
        }
    }

    return undefined;
}

function preventDefaultPolyfill(this: Event): void {
    this.returnValue = false;
}

function stopPropagationPolyfill(this: Event): void {
    this.cancelBubble = true;
}

export function addEvent(target: EventTarget | undefined, type: string | undefined, callback: (evt: Event) => void): void {
    if (typeof target === 'undefined' || typeof type === 'undefined') return;

    type = resolveVendor(target, type);

    if (typeof target.addEventListener === 'function') {
        return target.addEventListener(type, callback);
    }

    if (typeof target.attachEvent === 'function') {
        const existing: IEWrapper | undefined = findIEWrapper(target, type, callback);

        if (typeof existing === 'function') return;

        const wrapper: IEWrapper = function (event: Event | undefined): void {
            if (typeof event === 'undefined') event = globalThis.event;
            if (typeof event === 'undefined') return;

            try {
                Object.defineProperty(event, 'currentTarget', {value: target, configurable: true});
            } catch (_: unknown) {
            }

            if (typeof event.preventDefault !== 'function') event.preventDefault = preventDefaultPolyfill.bind(event);
            if (typeof event.stopPropagation !== 'function') event.stopPropagation = stopPropagationPolyfill.bind(event);

            callback.call(target, event);
        };

        setIEWrapper(target, type, callback, wrapper);

        return target.attachEvent('on' + type, wrapper);
    }
}

export function removeEvent(target: EventTarget | undefined, type: string | undefined, callback: (evt: Event) => void): void {
    if (typeof target === 'undefined' || typeof type === 'undefined') return;

    type = resolveVendor(target, type);

    if (typeof target.removeEventListener === 'function') {
        return target.removeEventListener(type, callback);
    }

    if (typeof target.detachEvent === 'function') {
        const wrapper: IEWrapper | undefined = removeIEWrapper(target, type, callback);

        if (typeof wrapper === 'function') target.detachEvent('on' + type, wrapper);

        return;
    }
}

