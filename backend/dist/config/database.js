"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseConfig = void 0;
const path_1 = require("path");
const databaseConfig = (config) => ({
    type: 'mysql',
    host: config.get('DB_HOST', 'localhost'),
    port: config.get('DB_PORT', 3306),
    username: config.get('DB_USER', 'root'),
    password: config.get('DB_PASSWORD', ''),
    database: config.get('DB_DATABASE', 'ai_agent'),
    entities: [(0, path_1.join)(__dirname, '..', 'modules', '**', '*.entity.{ts,js}')],
    migrations: [(0, path_1.join)(__dirname, '..', 'migrations', '*.{ts,js}')],
    migrationsRun: true,
    synchronize: false,
    logging: config.get('NODE_ENV') !== 'production',
    charset: 'utf8mb4',
    timezone: '+08:00',
    extra: {
        connectionLimit: 10,
    },
});
exports.databaseConfig = databaseConfig;
//# sourceMappingURL=database.js.map