"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcPagination = calcPagination;
function calcPagination(total, page, pageSize) {
    return {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize) || 0,
    };
}
//# sourceMappingURL=pagination.util.js.map