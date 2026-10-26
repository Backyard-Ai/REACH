"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { MapPoint } from "@/lib/map-points";
import { formatDate, telHref } from "@/lib/format";

// Free, keyless vector tiles (OpenFreeMap, OSM data) — swappable later
// without touching anything else in this component.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

type PanelDetails = {
  slug: string;
  name: string;
  description: string | null;
  website: string | null;
  publicPhone: string | null;
  categories: string[];
  lastVerifiedOn: string | null;
  locations: { address: string | null; city: string | null; state: string | null; postalCode: string | null }[];
};

export function ResourceMap({
  points,
  heightClass = "h-[70vh] min-h-[420px]",
}: {
  points: MapPoint[];
  heightClass?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [details, setDetails] = useState<PanelDetails | null>(null);
  const [detailsState, setDetailsState] = useState<"idle" | "loading" | "error">("idle");

  const closePanel = useCallback(() => {
    setSelected(null);
    setDetails(null);
    setDetailsState("idle");
  }, []);

  // selecting a pin resets the panel synchronously (event handler, not effect)
  const selectPoint = useCallback((p: MapPoint) => {
    setSelected(p);
    setDetails(null);
    setDetailsState("loading");
  }, []);

  // fetch the selected pin's details on demand — one resource, not the set
  useEffect(() => {
    if (!selected) return;
    const ctrl = new AbortController();
    fetch(`/api/resources/${encodeURIComponent(selected.slug)}`, {
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: PanelDetails) => {
        setDetails(d);
        setDetailsState("idle");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setDetailsState("error");
      });
    return () => ctrl.abort();
  }, [selected]);

  // keyboard: Esc closes; focus lands in the panel when it opens
  useEffect(() => {
    if (!selected) return;
    panelHeadingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, closePanel]);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;

    (async () => {
      try {
        const maplibregl = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;

        // Turbopack does not rewrite MapLibre's worker URL inside
        // node_modules; serve the worker ourselves (see
        // scripts/copy-maplibre-worker.mjs) and point the config at it.
        maplibregl.config.WORKER_URL = `${window.location.origin}/maplibre/maplibre-gl-worker.mjs`;

        const geojson = {
          type: "FeatureCollection" as const,
          features: points.map((p) => ({
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
            properties: { slug: p.slug, name: p.name, city: p.city ?? "" },
          })),
        };

        const instance = new maplibregl.Map({
          container: containerRef.current,
          style: STYLE_URL,
          center: [-82.5, 36.1],
          zoom: 7.4,
          attributionControl: { compact: true },
        });
        map = instance;
        mapRef.current = instance;
        const ml: MlMap = instance;

        ml.addControl(
          new maplibregl.NavigationControl({ visualizePitch: false }),
          "top-right",
        );

        ml.on("load", () => {
          ml.addSource("resources", {
            type: "geojson",
            data: geojson,
            cluster: true,
            clusterRadius: 60,
            clusterMaxZoom: 13,
          });
          ml.addLayer({
            id: "clusters",
            type: "circle",
            source: "resources",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#24114D",
              "circle-radius": ["step", ["get", "point_count"], 15, 10, 21, 25, 27],
              "circle-stroke-width": 3,
              "circle-stroke-color": "#FFFFFF",
            },
          });
          ml.addLayer({
            id: "cluster-count",
            type: "symbol",
            source: "resources",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 13,
            },
            paint: { "text-color": "#FFFFFF" },
          });
          ml.addLayer({
            id: "points",
            type: "circle",
            source: "resources",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": "#177A8C",
              "circle-radius": 7,
              "circle-stroke-color": "#24114D",
              "circle-stroke-width": 2,
            },
          });
          ml.addLayer({
            id: "points-highlight",
            type: "circle",
            source: "resources",
            filter: ["==", ["get", "slug"], ""],
            paint: {
              "circle-color": "#24114D",
              "circle-radius": 10,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 3,
            },
          });

          if (points.length > 0) {
            let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
            for (const p of points) {
              minLng = Math.min(minLng, p.lng);
              maxLng = Math.max(maxLng, p.lng);
              minLat = Math.min(minLat, p.lat);
              maxLat = Math.max(maxLat, p.lat);
            }
            ml.fitBounds(
              [
                [minLng, minLat],
                [maxLng, maxLat],
              ],
              { padding: 60, maxZoom: 11, duration: 0 },
            );
          }

          ml.on("click", "clusters", (e) => {
            const feature = ml.queryRenderedFeatures(e.point, {
              layers: ["clusters"],
            })[0];
            const src = ml.getSource("resources") as GeoJSONSource | undefined;
            src
              ?.getClusterExpansionZoom(feature.properties?.cluster_id as number)
              .then((zoom) => {
                if (cancelled) return;
                ml.easeTo({
                  center: (feature.geometry as GeoJSON.Point).coordinates as [
                    number,
                    number,
                  ],
                  zoom,
                });
              })
              .catch(() => undefined);
          });

          // pin click → detail panel beside the map (map stays put)
          ml.on("click", "points", (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const props = f.properties as {
              slug: string;
              name: string;
              city: string;
            };
            selectPoint({
              slug: props.slug,
              name: props.name,
              city: props.city || null,
              lat: (f.geometry as GeoJSON.Point).coordinates[1],
              lng: (f.geometry as GeoJSON.Point).coordinates[0],
            });
          });

          const cursor = (on: boolean) =>
            ml.getCanvas().style.setProperty("cursor", on ? "pointer" : "");
          ml.on("mouseenter", "clusters", () => cursor(true));
          ml.on("mouseleave", "clusters", () => cursor(false));
          ml.on("mouseenter", "points", () => cursor(true));
          ml.on("mouseleave", "points", () => cursor(false));

          setStatus("ready");
        });

        ml.on("error", (e) => {
          const msg = (e.error as Error | undefined)?.message ?? "";
          if (msg.includes("style") || msg.includes("Failed to fetch")) {
            if (!cancelled) setStatus("failed");
          }
        });
      } catch {
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
    };
  }, [points, selectPoint]);

  // highlight the selected pin on the map itself
  useEffect(() => {
    const ml = mapRef.current;
    if (!ml) return;
    const apply = () =>
      ml.setFilter(
        "points-highlight",
        selected
          ? ["==", ["get", "slug"], selected.slug]
          : ["==", ["get", "slug"], ""],
      );
    if (ml.isStyleLoaded()) apply();
    else ml.once("load", apply);
  }, [selected, status]);

  if (status === "failed") {
    return (
      <div className="flex flex-col lg:flex-row gap-4">
        <div className={`${heightClass} w-full rounded-lg border border-[#C9C9CE] bg-surface-raise flex items-center justify-center p-6 text-center`}>
          <p className="m-0">
            The map couldn&rsquo;t load right now — the full list below has
            everything, with no map required.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-stretch">
      <div className="flex-1 min-w-0">
        <div
          ref={containerRef}
          role="application"
          aria-label="Interactive map of resource locations. Select a pin to show its details beside the map; a screen-reader-friendly list of the same results is available."
          className={`${heightClass} w-full rounded-lg border border-[#C9C9CE] overflow-hidden bg-surface`}
        />
      </div>

      {selected && (
        <aside
          role="complementary"
          aria-label="Selected resource"
          className="lg:w-80 shrink-0 bg-surface-raise rounded-lg border border-surface p-4 flex flex-col gap-3 overflow-y-auto max-h-[70vh] lg:max-h-none lg:self-stretch"
        >
          <div className="flex items-start justify-between gap-2">
            <h3
              ref={panelHeadingRef}
              tabIndex={-1}
              className="font-subhead font-bold text-lg text-brand-primary m-0 outline-none"
            >
              {selected.name}
            </h3>
            <button
              type="button"
              onClick={closePanel}
              aria-label="Close details panel"
              className="min-h-11 min-w-11 -mt-1 -mr-1 flex items-center justify-center rounded-md text-text-body hover:bg-surface focus-visible:bg-surface"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {selected.city && (
            <p className="m-0 text-sm text-text-body/70">{selected.city}</p>
          )}

          <div aria-live="polite" className="grid gap-3">
            {detailsState === "loading" && (
              <p className="m-0 text-sm animate-pulse" role="status">
                Loading details…
              </p>
            )}
            {detailsState === "error" && (
              <p className="m-0 text-sm">
                Details couldn&rsquo;t load right now —{" "}
                <a
                  href={`/resources/${encodeURIComponent(selected.slug)}`}
                  className="text-brand-action font-semibold underline underline-offset-2"
                >
                  open the full page
                </a>
                .
              </p>
            )}
            {details && (
              <>
                {details.categories.length > 0 && (
                  <ul className="list-none p-0 m-0 flex flex-wrap gap-1.5">
                    {details.categories.map((c) => (
                      <li
                        key={c}
                        className="rounded-full bg-surface px-2.5 py-0.5 text-sm text-brand-primary"
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
                {details.description && (
                  <p className="m-0 text-sm line-clamp-5">{details.description}</p>
                )}
                {details.locations[0]?.address && (
                  <p className="m-0 text-sm">
                    {details.locations[0].address}
                    {details.locations[0].city ? `, ${details.locations[0].city}` : ""}
                  </p>
                )}
                <div className="grid gap-1">
                  {details.publicPhone && (
                    <a
                      href={telHref(details.publicPhone)}
                      className="text-brand-action font-semibold underline underline-offset-2"
                    >
                      Call {details.publicPhone}
                    </a>
                  )}
                  {details.website && (
                    <a
                      href={details.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-action font-semibold underline underline-offset-2"
                    >
                      Visit website
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  )}
                </div>
                <a
                  href={`/resources/${encodeURIComponent(details.slug)}`}
                  className="inline-flex items-center justify-center min-h-11 px-4 rounded-md bg-brand-primary text-white font-headline font-bold no-underline hover:bg-brand-primary-hover"
                >
                  View full details
                </a>
                {details.lastVerifiedOn && (
                  <p className="m-0 text-xs text-text-body/70">
                    Last verified {formatDate(details.lastVerifiedOn)}
                  </p>
                )}
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
