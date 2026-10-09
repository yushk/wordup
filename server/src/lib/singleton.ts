const globalStore = globalThis as unknown as Record<string, unknown>

/** dev 热重载下防止重复创建单例（如 PrismaClient） */
export function singleton<T>(key: string, create: () => T): T {
  if (!(key in globalStore)) {
    globalStore[key] = create()
  }
  return globalStore[key] as T
}
