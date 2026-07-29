"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.throttlerConfig = void 0;
const throttlerConfig = (config) => [
    {
        ttl: config.get('THROTTLE_TTL', 60000),
        limit: config.get('THROTTLE_LIMIT', 60),
    },
];
exports.throttlerConfig = throttlerConfig;
//# sourceMappingURL=throttler.config.js.map