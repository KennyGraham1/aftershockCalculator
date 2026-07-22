// Minimal type declarations for leaflet@2.0.0-alpha.1.
//
// Leaflet 2 (the modern ESM rewrite) does not ship TypeScript types yet, and
// @types/leaflet only describes the 1.x global-`L` API. These declarations
// cover exactly the surface this app uses; extend them as usage grows, and
// delete this file once Leaflet publishes official v2 types.

declare module 'leaflet' {
  export type LatLngTuple = [number, number];
  export type BoundsTuple = [LatLngTuple, LatLngTuple];

  export interface PathStyle {
    color?: string;
    weight?: number;
    fillColor?: string;
    fillOpacity?: number;
    /** Circle: metres; CircleMarker: pixels */
    radius?: number;
  }

  export interface TooltipOptions {
    direction?: 'top' | 'bottom' | 'left' | 'right' | 'center' | 'auto';
    sticky?: boolean;
    opacity?: number;
  }

  export class Layer {
    addTo(target: Map | LayerGroup): this;
    bindPopup(content: string): this;
    bindTooltip(content: string, options?: TooltipOptions): this;
    remove(): this;
  }

  export class LayerGroup extends Layer {
    clearLayers(): this;
  }

  export class Map {
    constructor(element: HTMLElement, options?: { scrollWheelZoom?: boolean; worldCopyJump?: boolean });
    fitBounds(bounds: BoundsTuple): this;
    remove(): this;
  }

  export class TileLayer extends Layer {
    constructor(
      urlTemplate: string,
      options?: { maxZoom?: number; attribution?: string; subdomains?: string }
    );
  }

  export class Circle extends Layer {
    constructor(latlng: LatLngTuple, options?: PathStyle);
  }

  export class CircleMarker extends Layer {
    constructor(latlng: LatLngTuple, options?: PathStyle);
  }

  export class Rectangle extends Layer {
    constructor(bounds: BoundsTuple, options?: PathStyle);
  }

  export class DivIcon {
    constructor(options?: {
      className?: string;
      html?: string;
      iconSize?: [number, number];
      iconAnchor?: [number, number];
    });
  }

  export class Marker extends Layer {
    constructor(latlng: LatLngTuple, options?: { icon?: DivIcon });
  }

  export class Control {
    addTo(map: Map): this;
  }

  export namespace Control {
    class Layers extends Control {
      constructor(
        baseLayers?: Record<string, Layer>,
        overlays?: Record<string, Layer>,
        options?: { position?: string; collapsed?: boolean }
      );
    }
  }
}
