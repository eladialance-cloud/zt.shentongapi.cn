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
exports.OperationLogInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const admin_log_service_1 = require("./admin-log.service");
let OperationLogInterceptor = class OperationLogInterceptor {
    logService;
    constructor(logService) {
        this.logService = logService;
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const method = request.method;
        const path = request.path || request.url || '';
        if (!path.includes('/admin/')) {
            return next.handle();
        }
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            return next.handle();
        }
        return next.handle().pipe((0, operators_1.tap)(() => {
            const adminUser = request.adminUser;
            if (!adminUser) {
                return;
            }
            const type = this.mapType(method);
            this.logService
                .record({
                userId: adminUser.id,
                username: adminUser.username,
                type,
                target: path,
                operation: `${method} ${path}`,
                ip: request.ip,
                ua: request.headers?.['user-agent'],
            })
                .catch(() => {
            });
        }));
    }
    mapType(method) {
        switch (method) {
            case 'POST':
                return 'create';
            case 'PUT':
            case 'PATCH':
                return 'update';
            case 'DELETE':
                return 'delete';
            default:
                return 'other';
        }
    }
};
exports.OperationLogInterceptor = OperationLogInterceptor;
exports.OperationLogInterceptor = OperationLogInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [admin_log_service_1.AdminLogService])
], OperationLogInterceptor);
//# sourceMappingURL=operation-log.interceptor.js.map