import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface TfNSWLocation {
  id?: string;
  name?: string;
  type?: string;
  coord?: number[];
  isBest?: boolean;
  matchQuality?: number;
  assignedStops?: TfNSWLocation[];
  parent?: { name?: string; type?: string };
  properties?: Record<string, string>;
  [key: string]: unknown;
}

export interface TfNSWTransportProduct {
  class?: number;
  name?: string;
  iconId?: number;
}

export interface TfNSWTransportation {
  id?: string;
  name?: string;
  number?: string;
  disassembledName?: string;
  product?: TfNSWTransportProduct;
  destination?: { name?: string; id?: string };
  origin?: { name?: string; id?: string };
  operator?: { name?: string; id?: string };
}

export interface TfNSWStopEvent {
  departureTimePlanned?: string;
  departureTimeEstimated?: string;
  arrivalTimePlanned?: string;
  arrivalTimeEstimated?: string;
  location?: TfNSWLocation & { properties?: Record<string, string> };
  transportation?: TfNSWTransportation;
  infos?: Array<{ priority?: string; subtitle?: string; content?: string }>;
}

export interface TfNSWDepartureResponse {
  stopEvents?: TfNSWStopEvent[];
  systemMessages?: Array<{ type?: string; text?: string }>;
}

export interface TfNSWTripLeg {
  origin?: {
    name?: string;
    departureTimePlanned?: string;
    departureTimeEstimated?: string;
  };
  destination?: {
    name?: string;
    arrivalTimePlanned?: string;
    arrivalTimeEstimated?: string;
  };
  transportation?: TfNSWTransportation;
  stopSequence?: Array<{ name?: string }>;
  duration?: number;
}

export interface TfNSWJourney {
  legs?: TfNSWTripLeg[];
  duration?: number;
  fare?: {
    tickets?: Array<{
      properties?: { priceBrutto?: string | number };
    }>;
  };
}

export interface TfNSWTripResponse {
  journeys?: TfNSWJourney[];
  systemMessages?: Array<{ type?: string; text?: string }>;
}

export interface TfNSWStopFinderResponse {
  locations?: TfNSWLocation[];
}

export interface ApiConfig {
  apiKey: string;
  baseUrl: string;
}

export function getApiKey(): string {
  // Direct env var first
  if (process.env.TFNSW_API_KEY) return process.env.TFNSW_API_KEY;

  // 1Password reference
  const ref = process.env.TFNSW_API_KEY_REF ?? "op://Claude API Access/Transport for NSW Open Data API Token/token";
  try {
    return execFileSync("op", ["read", ref], { encoding: "utf-8" }).trim();
  } catch (e) {
    throw new Error(
      `Failed to read TfNSW API key. Set TFNSW_API_KEY env var or ensure 1Password CLI is configured.\nRef: ${ref}\n${e}`
    );
  }
}

export async function tfnswGet(apiKey: string, endpoint: string, params: Record<string, string>): Promise<unknown> {
  const base = process.env.TFNSW_API_BASE ?? "https://api.transport.nsw.gov.au/v1/tp";
  const qs = new URLSearchParams(params).toString();
  const url = `${base}${endpoint}?${qs}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `apikey ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "tfnsw-cli/0.1",
    },
  });
  if (!res.ok) throw new Error(`TfNSW API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function haGetState(entityId: string): Promise<Record<string, unknown>> {
  const baseUrl = process.env.HA_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      "Home Assistant integration requires HA_BASE_URL to be set.\n" +
      "Set the following environment variables:\n" +
      "  HA_BASE_URL     - Your Home Assistant URL (e.g. https://your-ha-instance.local)\n" +
      "  HA_TOKEN        - A long-lived access token, OR\n" +
      "  HA_TOKEN_FILE   - Path to a file containing the token"
    );
  }

  let token: string;
  if (process.env.HA_TOKEN) {
    token = process.env.HA_TOKEN;
  } else if (process.env.HA_TOKEN_FILE) {
    token = readFileSync(process.env.HA_TOKEN_FILE, "utf-8").trim();
  } else {
    throw new Error(
      "Home Assistant authentication not configured.\n" +
      "Set one of the following environment variables:\n" +
      "  HA_TOKEN        - A long-lived access token\n" +
      "  HA_TOKEN_FILE   - Path to a file containing the token"
    );
  }

  const url = `${baseUrl}/api/states/${encodeURIComponent(entityId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HA API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Record<string, unknown>>;
}

export function bestLocation(resp: TfNSWStopFinderResponse, preferTypes?: Set<string>): TfNSWLocation | null {
  let locs: TfNSWLocation[] = resp?.locations ?? [];
  if (!Array.isArray(locs) || locs.length === 0) return null;

  // Flatten assignedStops
  const expanded: TfNSWLocation[] = [];
  for (const l of locs) {
    if (typeof l === "object" && l) {
      expanded.push(l);
      if (Array.isArray(l.assignedStops)) {
        for (const a of l.assignedStops) {
          if (typeof a === "object" && a) expanded.push(a);
        }
      }
    }
  }
  locs = expanded;

  if (preferTypes) {
    const filtered = locs.filter((l) => preferTypes.has(l?.type ?? ""));
    if (filtered.length > 0) locs = filtered;
  }

  // Prefer isBest
  for (const l of locs) {
    if (l?.isBest === true) return l;
  }

  // Highest matchQuality
  let best: TfNSWLocation | null = null;
  let bestQ = -1;
  for (const l of locs) {
    const mq = Number(l?.matchQuality ?? -1);
    if (mq > bestQ || best === null) {
      bestQ = mq;
      best = l;
    }
  }
  return best;
}

export async function resolveLocation(apiKey: string, query: string): Promise<TfNSWLocation | null> {
  const q = query.trim();

  // HA person entity
  if (q.startsWith("person.")) {
    const st = await haGetState(q);
    const attrs = st?.attributes as Record<string, unknown> | undefined;
    const lat = attrs?.latitude as number | undefined;
    const lon = attrs?.longitude as number | undefined;
    if (lat == null || lon == null) return null;
    const coordQ = `${lon}:${lat}:EPSG:4326`;
    const resp = await tfnswGet(apiKey, "/coord", {
      outputFormat: "rapidJSON",
      coord: coordQ,
      coordOutputFormat: "EPSG:4326",
      inclFilter: "1",
      type_1: "BUS_POINT",
      radius_1: "1200",
      PoisOnMapMacro: "true",
    }) as TfNSWStopFinderResponse;
    const locs = resp?.locations;
    if (Array.isArray(locs)) {
      const stations = locs.filter((l) => typeof l?.name === "string" && l.name.toLowerCase().includes("station"));
      if (stations.length > 0) {
        const stationResp: TfNSWStopFinderResponse = { ...resp, locations: stations };
        const b = bestLocation(stationResp, new Set(["stop", "platform"]));
        if (b) return b;
      }
    }
    return bestLocation(resp, new Set(["stop", "platform"]));
  }

  // Numeric stop ID
  if (/^\d+$/.test(q)) {
    return { id: q, name: q, type: "stop" };
  }

  // Coordinate
  if (/^-?\d+(?:\.\d+)?:-?\d+(?:\.\d+)?:EPSG:4326$/.test(q)) {
    const resp = await tfnswGet(apiKey, "/stop_finder", {
      outputFormat: "rapidJSON",
      type_sf: "coord",
      name_sf: q,
      coordOutputFormat: "EPSG:4326",
      TfNSWSF: "true",
    }) as TfNSWStopFinderResponse;
    return bestLocation(resp, new Set(["stop", "platform"]));
  }

  // Name search
  const resp = await tfnswGet(apiKey, "/stop_finder", {
    outputFormat: "rapidJSON",
    type_sf: "any",
    name_sf: q,
    coordOutputFormat: "EPSG:4326",
    TfNSWSF: "true",
  }) as TfNSWStopFinderResponse;
  return bestLocation(resp);
}
