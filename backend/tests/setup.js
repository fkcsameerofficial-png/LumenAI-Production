"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupTestDb = cleanupTestDb;
// Point the app at an isolated, throwaway SQLite file + deterministic secrets for tests,
// BEFORE any application module (which reads these at import time) is imported.
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const testDbPath = path_1.default.resolve(__dirname, `../data/test-${process.pid}.db`);
process.env.DATABASE_PATH = testDbPath;
process.env.DATABASE_URL = ""; // force the SQLite adapter for tests regardless of local .env
process.env.UPLOAD_DIR = path_1.default.resolve(__dirname, `../data/test-uploads-${process.pid}`);
process.env.JWT_SECRET = "test-jwt-secret";
process.env.REFRESH_SECRET = "test-refresh-secret";
process.env.ENCRYPTION_KEY = "test-encryption-key-32-bytes-ok!";
process.env.NODE_ENV = "test";
process.env.ALLOW_SHARED_KEYS = "false";
function cleanupTestDb() {
    for (const ext of ["", "-wal", "-shm"]) {
        const p = testDbPath + ext;
        if (fs_1.default.existsSync(p))
            fs_1.default.unlinkSync(p);
    }
}
//# sourceMappingURL=setup.js.map