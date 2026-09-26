export function normalizePaperUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid HTTPS paper link");
  }
  if (url.protocol !== "https:" || !url.hostname) throw new Error("Enter a valid HTTPS paper link");
  return url.toString();
}
