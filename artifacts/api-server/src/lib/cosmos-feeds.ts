import * as satellite from "satellite.js";

type IssCurrent = {
  latitude: number;
  longitude: number;
  altitudeKm: number;
  velocityKmh: number;
  visibility: string;
  timestamp: number;
};

type IssPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

type Earthquake = {
  id: string;
  magnitude: number;
  place: string;
  latitude: number;
  longitude: number;
  depthKm: number;
  occurredAt: number;
  url: string;
};

export type CosmosFeeds = {
  updatedAt: number;
  stale: boolean;
  ttlSeconds: number;
  iss: {
    current: IssCurrent;
    trajectory: IssPoint[];
    nextPassAt: number | null;
    nextPassDistanceKm: number | null;
  };
  earthquakes: Earthquake[];
};

type IssApiPoint = {
  latitude?: unknown;
  longitude?: unknown;
  altitude?: unknown;
  velocity?: unknown;
  visibility?: unknown;
  timestamp?: unknown;
};

type UsGFeature = {
  id?: unknown;
  properties?: {
    mag?: unknown;
    place?: unknown;
    time?: unknown;
    url?: unknown;
  };
  geometry?: {
    coordinates?: unknown;
  };
};

const FEED_TTL_MS = 30_000;
const STALE_MAX_AGE_MS = 5 * 60_000;
const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const ISS_POSITIONS_URL = "https://api.wheretheiss.at/v1/satellites/25544/positions";
const ISS_TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE";
const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const FEIRA = { latitude: -12.2664, longitude: -38.9663 };
const TLE_TTL_MS = 6 * 60 * 60_000;
const PASS_LOOKAHEAD_MS = 24 * 60 * 60_000;
const PASS_STEP_MS = 30_000;
const MIN_PASS_ELEVATION_RAD = satellite.degreesToRadians(10);

let lastSuccess: CosmosFeeds | null = null;
let refreshInFlight: Promise<CosmosFeeds> | null = null;
let cachedTle: { line1: string; line2: string; expiresAt: number } | null = null;
let tleRefreshInFlight: Promise<{ line1: string; line2: string }> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Public feed returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchIssTle(): Promise<{ line1: string; line2: string }> {
  if (cachedTle && Date.now() < cachedTle.expiresAt) {
    return { line1: cachedTle.line1, line2: cachedTle.line2 };
  }
  if (!tleRefreshInFlight) {
    tleRefreshInFlight = (async () => {
      const response = await fetch(ISS_TLE_URL, {
        signal: AbortSignal.timeout(8_000),
        headers: { Accept: "text/plain" },
      });
      if (!response.ok) throw new Error(`ISS orbital element feed returned ${response.status}`);
      const lines = (await response.text()).split(/\r?\n/).map((line) => line.trim());
      const line1 = lines.find((line) => line.startsWith("1 "));
      const line2 = lines.find((line) => line.startsWith("2 "));
      if (!line1 || !line2) throw new Error("ISS orbital element feed returned an invalid TLE");
      cachedTle = { line1, line2, expiresAt: Date.now() + TLE_TTL_MS };
      return { line1, line2 };
    })().finally(() => {
      tleRefreshInFlight = null;
    });
  }
  return tleRefreshInFlight;
}

async function predictNextPass(nowMs: number): Promise<{ at: number; distanceKm: number } | null> {
  const tle = await fetchIssTle();
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const observer = {
    latitude: satellite.degreesToRadians(FEIRA.latitude),
    longitude: satellite.degreesToRadians(FEIRA.longitude),
    height: 0,
  };
  const lastTimestamp = nowMs + PASS_LOOKAHEAD_MS;

  for (let timestamp = nowMs; timestamp <= lastTimestamp; timestamp += PASS_STEP_MS) {
    const date = new Date(timestamp);
    const position = satellite.propagate(satrec, date)?.position;
    if (!position) continue;

    const gmst = satellite.gstime(date);
    const look = satellite.ecfToLookAngles(observer, satellite.eciToEcf(position, gmst));
    if (look.elevation < MIN_PASS_ELEVATION_RAD) continue;

    const geodetic = satellite.eciToGeodetic(position, gmst);
    const subpoint = {
      latitude: satellite.degreesLat(geodetic.latitude),
      longitude: satellite.degreesLong(geodetic.longitude),
    };
    return {
      at: timestamp,
      distanceKm: Math.round(distanceKm(FEIRA, subpoint)),
    };
  }
  return null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseIssCurrent(value: IssApiPoint, nowMs: number): IssCurrent {
  if (
    !finiteNumber(value.latitude)
    || !finiteNumber(value.longitude)
    || !finiteNumber(value.altitude)
    || !finiteNumber(value.velocity)
    || !finiteNumber(value.timestamp)
    || typeof value.visibility !== "string"
  ) {
    throw new Error("ISS feed returned an invalid current position");
  }
  return {
    latitude: value.latitude,
    longitude: value.longitude,
    altitudeKm: value.altitude,
    velocityKmh: value.velocity,
    visibility: value.visibility,
    timestamp: Math.round(value.timestamp * 1_000) || nowMs,
  };
}

function parseIssPoint(value: IssApiPoint): IssPoint | null {
  if (
    !finiteNumber(value.latitude)
    || !finiteNumber(value.longitude)
    || !finiteNumber(value.timestamp)
  ) return null;
  return {
    latitude: value.latitude,
    longitude: value.longitude,
    timestamp: Math.round(value.timestamp * 1_000),
  };
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = Math.PI / 180;
  const latitudeDelta = (b.latitude - a.latitude) * radians;
  const longitudeDelta = (b.longitude - a.longitude) * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function parseEarthquakes(value: { features?: unknown }): Earthquake[] {
  if (!Array.isArray(value.features)) throw new Error("USGS feed returned an invalid feature list");
  return (value.features as UsGFeature[])
    .flatMap((feature): Earthquake[] => {
      const properties = feature.properties;
      const coordinates = feature.geometry?.coordinates;
      if (
        typeof feature.id !== "string"
        || !properties
        || !finiteNumber(properties.mag)
        || typeof properties.place !== "string"
        || !finiteNumber(properties.time)
        || !Array.isArray(coordinates)
        || !finiteNumber(coordinates[0])
        || !finiteNumber(coordinates[1])
        || !finiteNumber(coordinates[2])
      ) return [];
      const sourceUrl = typeof properties.url === "string" && properties.url.startsWith("https://earthquake.usgs.gov/")
        ? properties.url
        : "https://earthquake.usgs.gov/earthquakes/";
      return [{
        id: feature.id,
        magnitude: properties.mag,
        place: properties.place.slice(0, 180),
        latitude: coordinates[1],
        longitude: coordinates[0],
        depthKm: coordinates[2],
        occurredAt: properties.time,
        url: sourceUrl,
      }];
    })
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, 160);
}

async function fetchFeeds(): Promise<CosmosFeeds> {
  const nowMs = Date.now();
  const nowSeconds = Math.floor(nowMs / 1_000);
  const sampleTimes = Array.from({ length: 25 }, (_, index) => nowSeconds + index * 900);
  const [currentBody, positionsBody, usgsBody, nextPass] = await Promise.all([
    fetchJson<IssApiPoint>(ISS_URL),
    fetchJson<IssApiPoint[]>(`${ISS_POSITIONS_URL}?timestamps=${sampleTimes.join(",")}`),
    fetchJson<{ features?: unknown }>(USGS_URL),
    predictNextPass(nowMs).catch(() => null),
  ]);
  if (!Array.isArray(positionsBody)) throw new Error("ISS orbit feed returned an invalid position list");

  const current = parseIssCurrent(currentBody, nowMs);
  const trajectory = positionsBody
    .map(parseIssPoint)
    .filter((point): point is IssPoint => point !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (trajectory.length < 12) throw new Error("ISS orbit feed returned too few positions");

  return {
    updatedAt: nowMs,
    stale: false,
    ttlSeconds: Math.ceil(FEED_TTL_MS / 1_000),
    iss: {
      current,
      trajectory,
      nextPassAt: nextPass?.at ?? null,
      nextPassDistanceKm: nextPass?.distanceKm ?? null,
    },
    earthquakes: parseEarthquakes(usgsBody),
  };
}

export async function getCosmosFeeds(): Promise<CosmosFeeds> {
  const now = Date.now();
  if (lastSuccess && now - lastSuccess.updatedAt < FEED_TTL_MS) {
    return {
      ...lastSuccess,
      stale: false,
      ttlSeconds: Math.max(0, Math.ceil((FEED_TTL_MS - (now - lastSuccess.updatedAt)) / 1_000)),
    };
  }

  if (!refreshInFlight) {
    refreshInFlight = fetchFeeds().then((feeds) => {
      lastSuccess = feeds;
      return feeds;
    }).finally(() => {
      refreshInFlight = null;
    });
  }

  try {
    return await refreshInFlight;
  } catch (error) {
    if (lastSuccess && Date.now() - lastSuccess.updatedAt < STALE_MAX_AGE_MS) {
      return { ...lastSuccess, stale: true, ttlSeconds: 0 };
    }
    throw error;
  }
}