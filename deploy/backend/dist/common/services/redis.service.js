"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    config;
    logger = new common_1.Logger(RedisService_1.name);
    client;
    constructor(config) {
        this.config = config;
    }
    onModuleInit() {
        const url = this.config.get('REDIS_URL', 'redis://localhost:6379');
        this.client = new ioredis_1.default(url, {
            retryStrategy: (times) => {
                if (times > 10) {
                    this.logger.error(`Redis reconnect attempts exhausted (${times} times)`);
                    return null;
                }
                const delay = Math.min(times * 200, 2000);
                this.logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableOfflineQueue: true,
        });
        this.client.on('error', (err) => {
            this.logger.error(`Redis client error: ${err.message}`);
        });
        this.client.on('connect', () => {
            this.logger.log('Redis client connected');
        });
        this.client.on('reconnecting', (delay) => {
            this.logger.warn(`Redis client reconnecting in ${delay}ms`);
        });
        this.client.on('close', () => {
            this.logger.warn('Redis client connection closed');
        });
    }
    async get(key) {
        return this.client.get(key);
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds) {
            await this.client.set(key, value, 'EX', ttlSeconds);
        }
        else {
            await this.client.set(key, value);
        }
    }
    async del(key) {
        await this.client.del(key);
    }
    async setNx(key, value, ttlSeconds) {
        const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
    }
    async saddIfAbsent(key, member, ttlSeconds) {
        const luaScript = `
      local added = redis.call('SADD', KEYS[1], ARGV[1])
      if added == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[2])
      end
      return added
    `;
        const result = await this.client.eval(luaScript, 1, key, member, String(ttlSeconds));
        return Number(result) === 1;
    }
    async releaseLock(key, value) {
        const luaScript = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
        const result = await this.client.eval(luaScript, 1, key, value);
        return Number(result) === 1;
    }
    async expire(key, ttlSeconds) {
        await this.client.expire(key, ttlSeconds);
    }
    getClient() {
        return this.client;
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map