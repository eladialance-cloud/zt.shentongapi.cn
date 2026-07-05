"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Public = void 0;
const common_1 = require("@nestjs/common");
const app_constant_1 = require("../constants/app.constant");
const Public = () => (0, common_1.SetMetadata)(app_constant_1.IS_PUBLIC_KEY, true);
exports.Public = Public;
//# sourceMappingURL=public.decorator.js.map