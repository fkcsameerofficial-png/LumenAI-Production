import { ChatProvider } from "./base";
import { openaiProvider } from "./openaiProvider";
import { anthropicProvider } from "./anthropicProvider";
import { ollamaProvider } from "./ollamaProvider";
import { geminiProvider } from "./geminiProvider";

// Registry of all available providers. To add a new one: implement ChatProvider in its own
// file, import it here, and add it to this list — nothing else in the app needs to change.
export const providers: ChatProvider[] = [openaiProvider, anthropicProvider, ollamaProvider, geminiProvider];

export function getProvider(id: string): ChatProvider | undefined {
  return providers.find((p) => p.id === id);
}
