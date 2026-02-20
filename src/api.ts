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
  [key: string]: unknown;
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

export async function tfnswGet(apiKey: string, endpoint: string, params: Record<string, string>): Promise<any> {
  const base = process.env.TFNSW_API_BASE ?? "https://api.transport.nsw.gov.au/v1/tp";
  const qs = new URLSearchParams(params).toString();
  const url = `${base}${endpoint}?${qs}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `apikey ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "tfnsw-cli/1.0",
    },
  });
  if (!res.ok) throw new Error(`TfNSW API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function haGetState(entityId: string): Promise<any> {
  const baseUrl = process.env.HA_BASE_URL ?? "https://cp.mctk.co";
  const tokenFile = process.env.HA_TOKEN_FILE ?? "/home/moltbot/.ha_sy3_long_lived_token";
  let token: string;
  if (process.env.HA_TOKEN) {
    token = process.env.HA_TOKEN;
  } else {
    token = readFileSync(tokenFile, "utf-8").trim();
  }
  const url = `${baseUrl}/api/states/${encodeURIComponent(entityId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HA API ${res.status}: ${await res.text()}`);
  return res.json();
}

export function bestLocation(resp: any, preferTypes?: Set<string>): TfNSWLocation | null {
  let locs: any[] = resp?.locations ?? [];
  if (!Array.isArray(locs) || locs.length === 0) return null;

  // Flatten assignedStops
  const expanded: any[] = [];
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
    const filtered = locs.filter((l) => preferTypes.has(l?.type));
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
    try {
      const st = await haGetState(q);
      const lat = st?.attributes?.latitude;
      const lon = st?.attributes?.longitude;
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
      });
      const locs = resp?.locations;
      if (Array.isArray(locs)) {
        const stations = locs.filter((l: any) => typeof l?.name === "string" && l.name.toLowerCase().includes("station"));
        if (stations.length > 0) {
          const stationResp = { ...resp, locations: stations };
          const b = bestLocation(stationResp, new Set(["stop", "platform"]));
          if (b) return b;
        }
      }
      return bestLocation(resp, new Set(["stop", "platform"]));
    } catch {
      return null;
    }
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
    });
    return bestLocation(resp, new Set(["stop", "platform"]));
  }

  // Name search
  const resp = await tfnswGet(apiKey, "/stop_finder", {
    outputFormat: "rapidJSON",
    type_sf: "any",
    name_sf: q,
    coordOutputFormat: "EPSG:4326",
    TfNSWSF: "true",
  });
  return bestLocation(resp);
}
