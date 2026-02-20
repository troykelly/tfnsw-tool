#!/usr/bin/env node

import { parseArgs } from "node:util";
import { getApiKey, resolveLocation, tfnswGet } from "./api.js";
import { formatLocation, formatDepartures, formatTrip } from "./format.js";

const HELP = `tfnsw - TfNSW Open Data CLI

Usage:
  tfnsw stop <query>              Resolve a stop/station name
  tfnsw nearest <person_entity>   Find nearest stop to HA person entity
  tfnsw departures <stop> [-n N]  Show departures from a stop
  tfnsw trip <from> <to>          Plan a trip
  tfnsw --help                    Show this help
  tfnsw --json                    Output raw JSON (any command)

Environment:
  TFNSW_API_KEY          API key (or uses 1Password)
  TFNSW_API_KEY_REF      1Password reference
  HA_BASE_URL            Home Assistant URL
  HA_TOKEN / HA_TOKEN_FILE  Home Assistant auth
`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  const jsonOutput = args.includes("--json");
  const cleanArgs = args.filter((a) => a !== "--json");
  const cmd = cleanArgs[0];
  const rest = cleanArgs.slice(1);

  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch (e: any) {
    console.error(e.message);
    return 2;
  }

  const now = new Date();
  const itdDate = now.toISOString().slice(0, 10).replace(/-/g, "");
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const itdTime = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;

  if (cmd === "stop") {
    if (!rest[0]) { console.error("Usage: tfnsw stop <query>"); return 1; }
    const loc = await resolveLocation(apiKey, rest.join(" "));
    if (!loc) { console.error("No matching stop found."); return 3; }
    console.log(jsonOutput ? JSON.stringify(loc, null, 2) : formatLocation(loc));
    return 0;
  }

  if (cmd === "nearest") {
    if (!rest[0]) { console.error("Usage: tfnsw nearest <person.entity>"); return 1; }
    const loc = await resolveLocation(apiKey, rest[0]);
    if (!loc) { console.error(`No stop found near ${rest[0]}.`); return 3; }
    console.log(jsonOutput ? JSON.stringify(loc, null, 2) : formatLocation(loc));
    return 0;
  }

  if (cmd === "departures") {
    if (!rest[0]) { console.error("Usage: tfnsw departures <stop> [-n N]"); return 1; }
    // Parse -n flag
    let nFlag = 5;
    const nIdx = rest.indexOf("-n");
    let stopQuery: string;
    if (nIdx >= 0 && rest[nIdx + 1]) {
      nFlag = parseInt(rest[nIdx + 1], 10) || 5;
      stopQuery = rest.filter((_, i) => i !== nIdx && i !== nIdx + 1).join(" ");
    } else {
      stopQuery = rest.join(" ");
    }

    const loc = await resolveLocation(apiKey, stopQuery);
    if (!loc?.id) { console.error(`No matching stop: ${stopQuery}`); return 3; }

    const dm = await tfnswGet(apiKey, "/departure_mon", {
      outputFormat: "rapidJSON",
      coordOutputFormat: "EPSG:4326",
      type_dm: "stop",
      name_dm: String(loc.id),
      itdDate,
      itdTime,
      departureMonitorMacro: "true",
      TfNSWDM: "true",
    });

    // Limit results
    if (dm.stopEvents && Array.isArray(dm.stopEvents)) {
      dm.stopEvents = dm.stopEvents.slice(0, nFlag);
    }

    console.log(jsonOutput ? JSON.stringify(dm, null, 2) : formatDepartures(dm));
    return 0;
  }

  if (cmd === "trip") {
    if (!rest[0] || !rest[1]) { console.error("Usage: tfnsw trip <from> <to>"); return 1; }
    const origin = await resolveLocation(apiKey, rest[0]);
    if (!origin?.id) { console.error(`No match for origin: ${rest[0]}`); return 3; }
    const dest = await resolveLocation(apiKey, rest[1]);
    if (!dest?.id) { console.error(`No match for destination: ${rest[1]}`); return 3; }

    const tr = await tfnswGet(apiKey, "/trip", {
      outputFormat: "rapidJSON",
      coordOutputFormat: "EPSG:4326",
      depArrMacro: "dep",
      type_origin: "any",
      name_origin: String(origin.id),
      type_destination: "any",
      name_destination: String(dest.id),
      itdDate,
      itdTime,
    });

    console.log(jsonOutput ? JSON.stringify(tr, null, 2) : formatTrip(tr));
    return 0;
  }

  console.error(`Unknown command: ${cmd}. Run 'tfnsw --help' for usage.`);
  return 2;
}

main().then(process.exit).catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
