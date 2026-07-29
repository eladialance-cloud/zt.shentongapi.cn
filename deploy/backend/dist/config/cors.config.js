"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsConfig = void 0;
const corsConfig = (config) => {
    const origins = config.get('CORS_ORIGINS') || 'http://localhost:3000';
    if (origins === '*') {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('CORS_ORIGINS 不能为 * (生产环境)，请配置精确域名列表（逗号分隔）');
        }
        return {
            origin: ['http://localhost:3000', 'http://localhost:5173'],
            credentials: true,
        };
    }
    return {
        origin: origins.split(','),
        credentials: true,
    };
};
exports.corsConfig = corsConfig;
//# sourceMappingURL=cors.config.js.map