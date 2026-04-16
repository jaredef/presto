// Island: Leaflet Interactive Map
// Server provides coordinates. The island renders the interactive map.

import React from "react";
import { createRoot } from "react-dom/client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { defineIsland } from "../../src/islands/define";

interface MapPoint {
  lat: number;
  lng: number;
  label: string;
}

function InteractiveMap({ center, zoom, markers }: { center: [number, number]; zoom: number; markers: MapPoint[] }) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <MapContainer center={center} zoom={zoom} style={{ height: "400px", borderRadius: "8px" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markers.map((m, i) => (
          <Marker key={i} position={[m.lat, m.lng]}>
            <Popup>{m.label}</Popup>
          </Marker>
        ))}
      </MapContainer>
      <div style={{ fontSize: "0.7rem", color: "#aaa", marginTop: "0.5rem" }}>
        Leaflet + react-leaflet. Interactive map in a bounded PRESTO island. {markers.length} markers from server data.
      </div>
    </div>
  );
}

defineIsland({
  name: "leaflet-map",
  mount(el, props) {
    const data = (props.data || {}) as any;
    const center: [number, number] = data.center || [51.505, -0.09];
    const zoom = data.zoom || 13;
    const markers: MapPoint[] = data.markers || [];
    createRoot(el).render(<InteractiveMap center={center} zoom={zoom} markers={markers} />);
  },
});
