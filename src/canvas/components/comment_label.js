export function label(t, key, fallback) {
  const value = typeof t === "function" ? t(key) : key;
  return value && value !== key ? value : fallback;
}

