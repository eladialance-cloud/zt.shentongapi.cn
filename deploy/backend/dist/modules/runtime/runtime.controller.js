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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const runtime_service_1 = require("./services/runtime.service");
let RuntimeController = class RuntimeController {
    service;
    constructor(service) {
        this.service = service;
    }
    async checkUpdate(platform) {
        return this.service.checkUpdate(platform || 'win32-x64');
    }
};
exports.RuntimeController = RuntimeController;
__decorate([
    (0, common_1.Get)('check-update'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '检查引擎更新（桌面端调用）' }),
    __param(0, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RuntimeController.prototype, "checkUpdate", null);
exports.RuntimeController = RuntimeController = __decorate([
    (0, swagger_1.ApiTags)('运行时引擎'),
    (0, common_1.Controller)('api/runtime'),
    __metadata("design:paramtypes", [runtime_service_1.RuntimeService])
], RuntimeController);
//# sourceMappingURL=runtime.controller.js.map