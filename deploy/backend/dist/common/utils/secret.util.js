"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskApiKey = maskApiKey;
function maskApiKey(key) {
    if (typeof key !== 'string' || key.length === 0) {
        return '****';
    }
    if (key.length <= 8) {
        return '****';
    }
    return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
//# sourceMappingURL=secret.util.js.map