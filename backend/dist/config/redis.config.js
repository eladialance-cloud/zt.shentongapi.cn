"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisConfig = void 0;
const redisConfig = (config) => ({
    type: 'single',
    url: config.get('REDIS_URL') || 'redis://localhost:6379',
});
exports.redisConfig = redisConfig;
//# sourceMappingURL=redis.config.js.map