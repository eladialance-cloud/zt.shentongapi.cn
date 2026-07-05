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
Object.defineProperty(exports, "__esModule", { value: true });
exports.N8nController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const n8n_service_1 = require("../services/n8n.service");
let N8nController = class N8nController {
    service;
    constructor(service) {
        this.service = service;
    }
    health() {
        return this.service.health();
    }
};
exports.N8nController = N8nController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], N8nController.prototype, "health", null);
exports.N8nController = N8nController = __decorate([
    (0, swagger_1.ApiTags)('N8N'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('n8n'),
    __metadata("design:paramtypes", [n8n_service_1.N8nService])
], N8nController);
//# sourceMappingURL=n8n.controller.js.map