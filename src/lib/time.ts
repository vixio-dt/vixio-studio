/** "73" -> "1:13" for shot/sequence runtimes. */
export const formatSeconds = (totalSeconds: number): string => {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const formatRelativeTime = (isoDate: string): string => {
  const elapsed = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
};

export const nowIso = (): string => new Date().toISOString();

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
