import type {
  TfNSWLocation,
  TfNSWDepartureResponse,
  TfNSWStopEvent,
  TfNSWTripResponse,
  TfNSWJourney,
  TfNSWTripLeg,
} from "./api.js";

const TRANSPORT_ICONS: Record<string, string> = {
  "1": "\u{1F686}",   // Train
  "2": "\u{1F687}",   // Metro
  "4": "\u{1F688}",   // Light rail
  "5": "\u{1F68C}",   // Bus
  "7": "\u{1F68C}",   // Coach
  "9": "\u26F4\uFE0F",   // Ferry
  "11": "\u{1F68C}",  // School bus
  "99": "\u{1F6B6}",  // Walk
  "100": "\u{1F6B6}", // Walk
};

function icon(productClass?: string | number): string {
  return TRANSPORT_ICONS[String(productClass)] ?? "\u{1F68F}";
}

function extractTime(isoString?: string): string {
  if (!isoString) return "??:??";
  // Extract HH:MM from ISO 8601 string like "2024-01-15T14:30:00+11:00"
  const match = isoString.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "??:??";
}

function minutesUntil(isoString?: string): string {
  if (!isoString) return "";
  try {
    // Parse the full ISO 8601 string directly — respects timezone offset
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return "";
    const diff = Math.round((dt.getTime() - Date.now()) / 60000);
    if (diff <= 0) return "now";
    if (diff === 1) return "1 min";
    return `${diff} min`;
  } catch {
    return "";
  }
}

export function formatLocation(loc: TfNSWLocation): string {
  const lines: string[] = [];
  lines.push(`\u{1F4CD} ${loc.name ?? "Unknown"}`);
  if (loc.id) lines.push(`   ID: ${loc.id}`);
  if (loc.type) lines.push(`   Type: ${loc.type}`);
  if (Array.isArray(loc.coord) && loc.coord.length >= 2) {
    lines.push(`   Coords: ${loc.coord[0]}, ${loc.coord[1]}`);
  }
  if (loc.parent?.name) lines.push(`   Area: ${loc.parent.name}`);
  return lines.join("\n");
}

export function formatDepartures(data: TfNSWDepartureResponse): string {
  const events = data?.stopEvents;
  if (!Array.isArray(events) || events.length === 0) {
    return "No departures found.";
  }

  const stopName = events[0]?.location?.name ?? "Unknown Stop";
  const lines: string[] = [`\n\u{1F68F} Departures from ${stopName}\n`];

  for (const ev of events) {
    const transport = ev.transportation ?? {};
    const dest = transport.destination?.name ?? "??";
    const line = transport.number ?? transport.disassembledName ?? "";
    const product = transport.product?.class;
    const emoji = icon(product);

    const pTime = extractTime(ev.departureTimePlanned);
    const eTime = extractTime(ev.departureTimeEstimated);

    const timeDisplay = eTime !== "??:??" && eTime !== pTime ? `${pTime} \u2192 ${eTime}` : pTime;
    const eta = minutesUntil(ev.departureTimeEstimated ?? ev.departureTimePlanned);
    const etaStr = eta ? ` (${eta})` : "";

    // Platform info
    const platform = ev.location?.properties?.platform ?? "";
    const platStr = platform ? ` [Plt ${platform}]` : "";

    lines.push(`${emoji} ${line} \u2192 ${dest}  ${timeDisplay}${etaStr}${platStr}`);
  }

  return lines.join("\n");
}

export function formatTrip(data: TfNSWTripResponse): string {
  const journeys = data?.journeys;
  if (!Array.isArray(journeys) || journeys.length === 0) {
    return "No trips found.";
  }

  const lines: string[] = ["\n\u{1F5FA}\uFE0F Trip Options\n"];

  for (let i = 0; i < journeys.length; i++) {
    const j: TfNSWJourney = journeys[i];
    const legs = j.legs ?? [];
    if (legs.length === 0) continue;

    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const depTime = extractTime(firstLeg.origin?.departureTimePlanned);
    const arrTime = extractTime(lastLeg.destination?.arrivalTimePlanned);

    // Duration
    const durationMin = j.duration ? Math.round(j.duration / 60) : null;
    const durStr = durationMin ? ` (${durationMin} min)` : "";

    // Fare
    const fare = j.fare?.tickets?.[0];
    const fareStr = fare?.properties?.priceBrutto ? ` $${(Number(fare.properties.priceBrutto) / 100).toFixed(2)}` : "";

    lines.push(`--- Option ${i + 1}: ${depTime} \u2192 ${arrTime}${durStr}${fareStr} ---`);

    for (const leg of legs) {
      const transport = leg.transportation ?? {};
      const product = transport.product?.class;
      const emoji = icon(product);
      const lineName = transport.number ?? transport.disassembledName ?? "Walk";
      const from = leg.origin?.name ?? "??";
      const to = leg.destination?.name ?? "??";
      const legDep = extractTime(leg.origin?.departureTimePlanned);
      const legArr = extractTime(leg.destination?.arrivalTimePlanned);
      const stops = leg.stopSequence?.length ? ` (${leg.stopSequence.length - 1} stops)` : "";

      lines.push(`  ${emoji} ${legDep} ${lineName}: ${from} \u2192 ${to} arr ${legArr}${stops}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
