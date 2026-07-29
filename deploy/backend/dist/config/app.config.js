"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = void 0;
const appConfig = (config) => ({
    port: config.get('PORT', 3001),
    env: config.get('NODE_ENV', 'development'),
});
exports.appConfig = appConfig;
//# sourceMappingURL=app.config.js.map