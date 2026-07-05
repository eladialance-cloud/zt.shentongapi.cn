"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsConfig = void 0;
const corsConfig = (config) => {
    const origins = config.get('CORS_ORIGINS') || 'http://localhost:3000';
    return {
        origin: origins.split(','),
        credentials: true,
    };
};
exports.corsConfig = corsConfig;
//# sourceMappingURL=cors.config.js.map