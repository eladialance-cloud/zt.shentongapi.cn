"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtConfig = void 0;
const jwtConfig = (config) => ({
    secret: config.get('JWT_SECRET'),
    signOptions: {
        expiresIn: config.get('JWT_EXPIRES_IN', '15m'),
    },
});
exports.jwtConfig = jwtConfig;
//# sourceMappingURL=jwt.config.js.map