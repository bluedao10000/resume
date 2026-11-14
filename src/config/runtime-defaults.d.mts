export function runtimeDefaults(market: unknown): Record<string, string>
export function runtimeConfig<T extends object>(
  bindings: T,
): T & Record<string, string>
