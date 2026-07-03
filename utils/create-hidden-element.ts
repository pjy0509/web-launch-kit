interface HTMLPresentationAttributes {
    width?: string;
    height?: string;
    border?: string;
    frameBorder?: string;
    scrolling?: string;
    cellPadding?: string;
    cellSpacing?: string;
    frame?: string;
    rules?: string;
    noWrap?: boolean;
}

export function createHiddenElement<K extends keyof HTMLElementTagNameMap>(tagName: K, focusable: boolean = true): HTMLElementTagNameMap[K] {
    const element: HTMLElementTagNameMap[K] & HTMLPresentationAttributes = globalThis.document.createElement(tagName) as HTMLElementTagNameMap[K] & HTMLPresentationAttributes;

    if (typeof element.width !== 'undefined') element.width = '0';
    if (typeof element.height !== 'undefined') element.height = '0';
    if (typeof element.border !== 'undefined') element.border = '0';
    if (typeof element.frameBorder !== 'undefined') element.frameBorder = '0';
    if (typeof element.scrolling !== 'undefined') element.scrolling = 'no';
    if (typeof element.cellPadding !== 'undefined') element.cellPadding = '0';
    if (typeof element.cellSpacing !== 'undefined') element.cellSpacing = '0';
    if (typeof element.frame !== 'undefined') element.frame = 'void';
    if (typeof element.rules !== 'undefined') element.rules = 'none';
    if (typeof element.noWrap !== 'undefined') element.noWrap = true;

    element.tabIndex = -1;
    element.setAttribute('role', 'presentation');

    if (focusable) {
        element.setAttribute('aria-hidden', 'false');

        element.style.width = '1px';
        element.style.height = '1px';
    } else {
        element.setAttribute('aria-hidden', 'true');

        element.style.width = '0';
        element.style.height = '0';
        element.style.zIndex = '-9999';
        element.style.display = 'none';
        element.style.visibility = 'hidden';
        element.style.pointerEvents = 'none';
    }

    element.style.position = 'absolute';
    element.style.top = '0';
    element.style.left = '0';
    element.style.padding = '0';
    element.style.margin = '0';
    element.style.border = 'none';
    element.style.outline = 'hidden';
    element.style.clip = 'rect(1px, 1px, 1px, 1px)';
    element.style.clipPath = 'inset(50%)';
    element.style.overflow = 'hidden';
    element.style.whiteSpace = 'nowrap';

    return element;
}
