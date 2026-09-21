"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
require("./setup");
const crypto_1 = require("../src/utils/crypto");
const providers_1 = require("../src/providers");
(0, vitest_1.describe)("crypto helpers", () => {
    (0, vitest_1.it)("round-trips an encrypted secret", () => {
        const secret = "sk-test-1234567890abcdef";
        const enc = (0, crypto_1.encryptSecret)(secret);
        (0, vitest_1.expect)(enc).not.toBe(secret);
        (0, vitest_1.expect)((0, crypto_1.decryptSecret)(enc)).toBe(secret);
    });
    (0, vitest_1.it)("masks a secret for display", () => {
        const masked = (0, crypto_1.maskSecret)("sk-test-1234567890abcdef");
        (0, vitest_1.expect)(masked.startsWith("sk-t")).toBe(true);
        (0, vitest_1.expect)(masked).not.toContain("1234567890");
    });
});
(0, vitest_1.describe)("provider registry", () => {
    (0, vitest_1.it)("registers openai, anthropic and ollama", () => {
        const ids = providers_1.providers.map((p) => p.id).sort();
        (0, vitest_1.expect)(ids).toEqual(["anthropic", "ollama", "openai"]);
    });
    (0, vitest_1.it)("looks providers up by id", () => {
        (0, vitest_1.expect)((0, providers_1.getProvider)("openai")?.label).toContain("OpenAI");
        (0, vitest_1.expect)((0, providers_1.getProvider)("nonexistent")).toBeUndefined();
    });
    (0, vitest_1.it)("openai adapter refuses to stream without a key", async () => {
        const provider = (0, providers_1.getProvider)("openai");
        const chunks = [];
        for await (const chunk of provider.streamChat([{ role: "user", content: "hi" }], null, { model: "gpt-4o-mini" })) {
            chunks.push(chunk);
        }
        (0, vitest_1.expect)(chunks[0].type).toBe("error");
    });
});
//# sourceMappingURL=providers.test.js.map