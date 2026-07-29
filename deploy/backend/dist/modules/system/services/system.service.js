"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemService = void 0;
const common_1 = require("@nestjs/common");
let SystemService = class SystemService {
    health() {
        return { status: 'ok', module: 'system' };
    }
    getSystemStatus(userId) {
        return {
            status: 'ok',
            version: '1.0.0',
            maintenance: false,
            features: {
                chat: true,
                payment: true,
                knowledgeBase: true,
                rag: false,
                mcp: false,
                n8n: false,
            },
        };
    }
    getPublicConfig() {
        return {
            siteName: '深瞳AI',
            siteDescription: 'AI Agent 平台',
            supportEmail: 'support@example.com',
            maxUploadSize: 10485760,
            allowedFileTypes: ['pdf', 'docx', 'txt', 'md'],
        };
    }
    getFeatureFlags(userId) {
        return {
            flags: {
                enableRag: false,
                enableMcp: false,
                enableN8n: false,
                enableOpc: true,
                enableTenant: true,
            },
        };
    }
};
exports.SystemService = SystemService;
exports.SystemService = SystemService = __decorate([
    (0, common_1.Injectable)()
], SystemService);
//# sourceMappingURL=system.service.js.map