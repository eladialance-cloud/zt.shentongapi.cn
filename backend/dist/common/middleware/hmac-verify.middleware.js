"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HmacVerifyMiddleware = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = __importStar(require("crypto"));
const redis_service_1 = require("../services/redis.service");
const TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;
const NONCE_TTL_SECONDS = 300;
const NONCE_SET_KEY = 'hmac:nonces';
let HmacVerifyMiddleware = class HmacVerifyMiddleware {
    redis;
    config;
    constructor(redis, config) {
        this.redis = redis;
        this.config = config;
    }
    async use(req, res, next) {
        const signature = req.header('x-signature');
        if (!signature) {
            return next();
        }
        const timestamp = req.header('x-timestamp');
        const nonce = req.header('x-nonce');
        if (!timestamp || !nonce) {
            return this.fail(res, 'SIGNATURE_INVALID', '缺少验签字段');
        }
        const ts = Number(timestamp);
        if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_DRIFT_MS) {
            return this.fail(res, 'SIGNATURE_INVALID', '时间戳超出允许漂移范围');
        }
        const added = await this.redis.saddIfAbsent(NONCE_SET_KEY, nonce, NONCE_TTL_SECONDS);
        if (!added) {
            return this.fail(res, 'NONCE_REPLAYED', '请求已过期或重复');
        }
        const secretKey = this.config.get('HMAC_SECRET', 'shentong-ai-hmac-secret');
        const bodyMd5 = this.computeBodyMd5(req);
        const path = req.originalUrl || req.url || '';
        const raw = `${req.method}\n${path}\n${timestamp}\n${nonce}\n${bodyMd5}`;
        const expected = crypto
            .createHmac('sha256', secretKey)
            .update(raw, 'utf8')
            .digest('hex');
        if (!this.safeEqual(expected, signature)) {
            return this.fail(res, 'SIGNATURE_INVALID', '签名校验失败');
        }
        next();
    }
    computeBodyMd5(req) {
        const raw = req.rawBody;
        let payload;
        if (raw && Buffer.isBuffer(raw)) {
            payload = raw.toString('utf8');
        }
        else if (req.body && Object.keys(req.body).length > 0) {
            payload = JSON.stringify(req.body);
        }
        else {
            payload = '';
        }
        return crypto.createHash('md5').update(payload, 'utf8').digest('hex');
    }
    safeEqual(a, b) {
        const bufA = Buffer.from(a, 'hex');
        const bufB = Buffer.from(b, 'hex');
        if (bufA.length !== bufB.length) {
            return false;
        }
        return crypto.timingSafeEqual(bufA, bufB);
    }
    fail(res, code, message) {
        res.status(401).json({
            code,
            data: null,
            message,
            timestamp: Date.now(),
        });
    }
};
exports.HmacVerifyMiddleware = HmacVerifyMiddleware;
exports.HmacVerifyMiddleware = HmacVerifyMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        config_1.ConfigService])
], HmacVerifyMiddleware);
//# sourceMappingURL=hmac-verify.middleware.js.map