'use client';

import { useEffect, useRef } from 'react';
// Leaflet 2: modern ESM named exports (no global `L`, class-based API)
import {
  Map as LeafletMap,
  TileLayer,
  LayerGroup,
  Circle,
  CircleMarker,
  Rectangle,
  Marker,
  DivIcon,
  Control,
} from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  deltaLonDeg,
  haversineKm,
  isInRegion,
  squareHalfWidthKm,
  KM_PER_DEG_LAT,
  type EvalRegion,
  type ObservedEvent,
} from '@/lib/evaluation';

// Ordinal severity ramp shared with the visualization charts:
// light -> dark red = low -> high magnitude bin
const BIN_COLORS = { m3: '#f87171', m2: '#dc2626', m1: '#7f1d1d' } as const;
const OUTSIDE_COLOR = '#9ca3af'; // events inside the bounding box but outside the region

interface EvaluationMapProps {
  region: EvalRegion;
  events: ObservedEvent[];
  mainshock: { latitude: number; longitude: number; magnitude: number; quakeId: string };
  /** Bin thresholds: m1 highest, m3 lowest */
  thresholds: { m1: number; m2: number; m3: number };
}

function binFor(mag: number, t: EvaluationMapProps['thresholds']): keyof typeof BIN_COLORS | null {
  if (mag >= t.m1) return 'm1';
  if (mag >= t.m2) return 'm2';
  if (mag >= t.m3) return 'm3';
  return null;
}

/** Marker radius in px, scaled gently with magnitude */
function markerRadius(mag: number, t: EvaluationMapProps['thresholds']): number {
  return Math.max(3, 3 + (mag - t.m3) * 2);
}

function formatUtc(timeMs: number): string {
  // e.g. "2016-11-18 14:22 UTC"
  return `${new Date(timeMs).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default function EvaluationMap({ region, events, mainshock, thresholds }: EvaluationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  // Create the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new LeafletMap(containerRef.current, {
      scrollWheelZoom: false, // avoid hijacking page scroll
      worldCopyJump: true,
    });
    // Two selectable basemaps; the greyscale CARTO Light is the default so the
    // coloured event markers and blue region outline carry the visual emphasis
    const cartoLight = new TileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 12,
      subdomains: 'abcd',
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    });
    const osm = new TileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    cartoLight.addTo(map);
    new Control.Layers(
      { 'CartoDB Light': cartoLight, 'OpenStreetMap': osm },
      undefined,
      { position: 'topright' }
    ).addTo(map);
    const layer = new LayerGroup();
    layer.addTo(map);
    layerRef.current = layer;
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // (Re)draw region, events, and epicentre whenever the inputs change
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const centerLat = region.latitude;
    const centerLon = region.longitude;
    // Display longitude nearest to the region centre (dateline-safe)
    const displayLon = (lon: number) => centerLon + deltaLonDeg(lon, centerLon);

    // Evaluation region outline
    const regionStyle = { color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.06 };
    if (region.type === 'circle') {
      new Circle([centerLat, centerLon], { radius: region.radiusKm * 1000, ...regionStyle }).addTo(layer);
    } else {
      const halfKm = squareHalfWidthKm(region.radiusKm);
      const dLat = halfKm / KM_PER_DEG_LAT;
      const dLon = halfKm / (KM_PER_DEG_LAT * Math.max(0.1, Math.cos((centerLat * Math.PI) / 180)));
      new Rectangle(
        [[centerLat - dLat, centerLon - dLon], [centerLat + dLat, centerLon + dLon]],
        regionStyle
      ).addTo(layer);
    }

    // Observed events: coloured by magnitude bin inside the region,
    // gray for bounding-box events excluded by the precise region test.
    // Hover shows a summary tooltip; click opens the full popup.
    for (const e of events) {
      if (e.publicId === mainshock.quakeId) continue;
      const inside = isInRegion(region, e.latitude, e.longitude);
      const bin = binFor(e.magnitude, thresholds);
      if (!bin) continue;
      const distanceKm = haversineKm(mainshock.latitude, mainshock.longitude, e.latitude, e.longitude);
      const detailHtml =
        `<b>M${e.magnitude.toFixed(1)}</b>${inside ? '' : ' <i>(outside region, excluded)</i>'}<br/>` +
        `${formatUtc(e.timeMs)}<br/>` +
        `${distanceKm.toFixed(0)} km from epicentre` +
        `${e.depthKm !== null ? ` · depth ${e.depthKm.toFixed(0)} km` : ''}<br/>` +
        `ID: ${e.publicId}`;
      new CircleMarker([e.latitude, displayLon(e.longitude)], {
        radius: markerRadius(e.magnitude, thresholds),
        color: inside ? BIN_COLORS[bin] : OUTSIDE_COLOR,
        weight: 1,
        fillColor: inside ? BIN_COLORS[bin] : OUTSIDE_COLOR,
        fillOpacity: inside ? 0.7 : 0.35,
      })
        .bindTooltip(detailHtml, { direction: 'top', opacity: 0.95 })
        .bindPopup(detailHtml)
        .addTo(layer);
    }

    // Mainshock epicentre
    new Marker([mainshock.latitude, displayLon(mainshock.longitude)], {
      icon: new DivIcon({
        className: '',
        html: '<div style="font-size:22px;line-height:22px;color:#111;text-shadow:0 0 3px #fff, 0 0 3px #fff">★</div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    })
      .bindTooltip(`Mainshock M${mainshock.magnitude.toFixed(1)}`, { direction: 'top', opacity: 0.9 })
      .bindPopup(`<b>Mainshock</b> M${mainshock.magnitude.toFixed(1)}<br/>ID: ${mainshock.quakeId}`)
      .addTo(layer);

    // Fit to the region with a small margin
    const dLatFit = (region.radiusKm * 1.3) / KM_PER_DEG_LAT;
    const dLonFit = (region.radiusKm * 1.3) / (KM_PER_DEG_LAT * Math.max(0.1, Math.cos((centerLat * Math.PI) / 180)));
    map.fitBounds([
      [centerLat - dLatFit, centerLon - dLonFit],
      [centerLat + dLatFit, centerLon + dLonFit],
    ]);
  }, [region, events, mainshock, thresholds]);

  return (
    <div>
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 z-0"
        style={{ height: 420 }}
        role="img"
        aria-label="Map of the evaluation region and observed earthquakes"
      />
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400 items-center">
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none">★</span> Mainshock
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: BIN_COLORS.m1 }} /> M{thresholds.m1}+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: BIN_COLORS.m2 }} /> M{thresholds.m2}–{thresholds.m1}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: BIN_COLORS.m3 }} /> M{thresholds.m3}–{thresholds.m2}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-full opacity-50" style={{ backgroundColor: OUTSIDE_COLOR }} /> Outside region (excluded)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 border-2 rounded-sm" style={{ borderColor: '#2563eb', backgroundColor: '#2563eb18' }} /> Evaluation region
        </span>
      </div>
    </div>
  );
}
