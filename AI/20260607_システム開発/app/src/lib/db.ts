import { store } from "@/lib/store/json-store";

// ARM64 Windows 等で Prisma ネイティブエンジンが動かない環境向けに JSON ファイルストアを使用
export const prisma = store;
