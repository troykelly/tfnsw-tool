import type { TfNSWLocation } from "./api.js";

const TRANSPORT_ICONS: Record<string, string> = {
  "1": "🚆",   // Train
  "4": "🚈",   // Light rail
  "5": "🚌",   // Bus
  "7": "🚌",   // Coach
  "9": "⛴️",   // Ferry
  "11": "🚌",  // School bus
  "99": "🚶",  // Walk
  "100": "🚶", // Walk
};

function icon(productClass?: string | number): string {
  return TRANSPORT_ICONS[String(productClass)] ?? "🚏";
}

function fmtTime(dateStr?: string, timeStr?: string): string {
  if (!dateStr || !timeStr) return "??:??";
  // TfNSW returns "HH:MM" or "H:MM"
  return timeStr.length <= 5 ? timeStr : timeStr.slice(0, 5);
}

function minutesUntil(dateStr?: string, timeStr?: string): string {
  if (!dateStr || !timeStr) return "";
  try {
    // dateStr: "2024-01-15", timeStr: "14:30"
    // TfNSW times are in AEST/AEDT
    const parts = dateStr.split("-").map(Number);
    const timeParts = timeStr.split(":").map(Number);
    const dt = new Date(parts[0], parts[1] - 1, parts[2], timeParts[0], timeParts[1]);
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
  lines.push(`📍 ${loc.name ?? "Unknown"}`);
  if (loc.id) lines.push(`   ID: ${loc.id}`);
  if (loc.type) lines.push(`   Type: ${loc.type}`);
  if (Array.isArray(loc.coord) && loc.coord.length >= 2) {
    lines.push(`   Coords: ${loc.coord[0]}, ${loc.coord[1]}`);
  }
  const parent = (loc as any).parent;
  if (parent?.name) lines.push(`   Area: ${parent.name}`);
  return lines.join("\n");
}

export function formatDepartures(data: any): string {
  const events = data?.stopEvents;
  if (!Array.isArray(events) || events.length === 0) {
    return "No departures found.";
  }

  const stopName = events[0]?.location?.name ?? "Unknown Stop";
  const lines: string[] = [`\n🚏 Departures from ${stopName}\n`];

  for (const ev of events) {
    const transport = ev.transportation ?? {};
    const dest = transport.destination?.name ?? "??";
    const line = transport.number ?? transport.disassembledName ?? "";
    const product = transport.product?.class;
    const emoji = icon(product);

    const planned = ev.departureTimePlanned?.split("T") ?? [];
    const estimated = ev.departureTimeEstimated?.split("T") ?? [];

    const pDate = planned[0];
    const pTime = planned[1]?.slice(0, 5);
    const eTime = estimated[1]?.slice(0, 5);

    const timeDisplay = eTime && eTime !== pTime ? `${pTime} → ${eTime}` : pTime ?? "??:??";
    const eta = minutesUntil(estimated[0] ?? pDate, eTime ?? pTime);
    const etaStr = eta ? ` (${eta})` : "";

    // Platform info
    const platform = ev.location?.properties?.platform ?? "";
    const platStr = platform ? ` [Plt ${platform}]` : "";

    lines.push(`${emoji} ${line} → ${dest}  ${timeDisplay}${etaStr}${platStr}`);
  }

  return lines.join("\n");
}

export function formatTrip(data: any): string {
  const journeys = data?.journeys;
  if (!Array.isArray(journeys) || journeys.length === 0) {
    return "No trips found.";
  }

  const lines: string[] = ["\n🗺️ Trip Options\n"];

  for (let i = 0; i < journeys.length; i++) {
    const j = journeys[i];
    const legs = j.legs ?? [];
    if (legs.length === 0) continue;

    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const depTime = firstLeg.origin?.departureTimePlanned?.split("T")[1]?.slice(0, 5) ?? "??:??";
    const arrTime = lastLeg.destination?.arrivalTimePlanned?.split("T")[1]?.slice(0, 5) ?? "??:??";

    // Duration
    const durationMin = j.duration ? Math.round(j.duration / 60) : null;
    const durStr = durationMin ? ` (${durationMin} min)` : "";

    // Fare
    const fare = j.fare?.tickets?.[0];
    const fareStr = fare?.properties?.priceBrutto ? ` $${(Number(fare.properties.priceBrutto) / 100).toFixed(2)}` : "";

    lines.push(`--- Option ${i + 1}: ${depTime} → ${arrTime}${durStr}${fareStr} ---`);

    for (const leg of legs) {
      const transport = leg.transportation ?? {};
      const product = transport.product?.class;
      const emoji = icon(product);
      const lineName = transport.number ?? transport.disassembledName ?? "Walk";
      const from = leg.origin?.name ?? "??";
      const to = leg.destination?.name ?? "??";
      const legDep = leg.origin?.departureTimePlanned?.split("T")[1]?.slice(0, 5) ?? "";
      const legArr = leg.destination?.arrivalTimePlanned?.split("T")[1]?.slice(0, 5) ?? "";
      const stops = leg.stopSequence?.length ? ` (${leg.stopSequence.length - 1} stops)` : "";

      lines.push(`  ${emoji} ${legDep} ${lineName}: ${from} → ${to} arr ${legArr}${stops}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
