import "react-native-get-random-values";
import "@ethersproject/shims";
import { Buffer } from "buffer";
global.Buffer = Buffer;
// Polyfill navigator.userAgent for browser-or-node (used by @polymarket/clob-client).
// React Native defines `navigator` but leaves `userAgent` undefined, which causes
// navigator.userAgent.includes(...) to throw at module load time.
if (typeof navigator !== 'undefined' && navigator.userAgent == null) {
    try {
        Object.defineProperty(navigator, 'userAgent', {
            value: 'react-native',
            configurable: true,
            writable: true,
        });
    } catch (_) {
        // If defineProperty fails (some RN versions), fall back to direct assign
        // eslint-disable-next-line no-global-assign
        navigator = Object.assign({}, navigator, { userAgent: 'react-native' });
    }
}
// Then import the expo router
import "expo-router/entry";