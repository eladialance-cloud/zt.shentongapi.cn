"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireHmac = exports.REQUIRE_HMAC_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.REQUIRE_HMAC_KEY = 'require_hmac';
const RequireHmac = () => (0, common_1.SetMetadata)(exports.REQUIRE_HMAC_KEY, true);
exports.RequireHmac = RequireHmac;
//# sourceMappingURL=require-hmac.decorator.js.map