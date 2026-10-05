/** Formatting helpers shared by pages (no data access here). */

/** "(423) 555-0142" → "tel:+14235550142"; "988" → "tel:988". */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return `tel:${phone.trim()}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 3 && digits !== "911") return `tel:${digits}`;
  return `tel:+${digits}`;
}

/** "2026-07-01" → "July 1, 2026" (UTC-stable, no server-timezone drift). */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** "09:00:00" → "9:00 AM" */
export function formatTime(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  const h = Number(hRaw);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mRaw} ${suffix}`;
}

const WEEKDAY_LABELS: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

export function weekdayLabel(day: string): string {
  return WEEKDAY_LABELS[day] ?? day;
}

export function directionsUrl(parts: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}): string {
  const destination = [parts.address, parts.city, parts.state, parts.postal_code]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
