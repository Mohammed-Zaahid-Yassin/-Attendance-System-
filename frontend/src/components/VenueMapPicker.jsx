import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix Leaflet marker icon asset resolution with Vite bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});

/**
 * VenueMapPicker — Leaflet-based interactive geofence editor.
 *
 * Props:
 *  lat / lng        — current center coordinates (controlled)
 *  radius           — current radius in meters (controlled, circle mode)
 *  mode             — 'circle' | 'polygon'
 *  corners          — polygon corner array [{ lat, lng }] (polygon mode)
 *  readOnly         — if true, disable all interactions (preview mode)
 *  onLocationChange — callback({ lat, lng }) when center moves
 *  onRadiusChange   — callback(radius: number) when radius changes
 *  onCornersChange  — callback(corners: [{lat,lng}]) in polygon mode
 *  height           — CSS height string
 */
export default function VenueMapPicker({
  lat,
  lng,
  radius,
  initialLat = 12.985300,
  initialLng = 77.762465,
  initialRadius = 100,
  mode = 'circle',
  corners = null,
  readOnly = false,
  onLocationChange,
  onRadiusChange,
  onCornersChange,
  height = '320px'
}) {
  const effectiveLat = lat !== undefined ? lat : initialLat;
  const effectiveLng = lng !== undefined ? lng : initialLng;
  const effectiveRadius = radius !== undefined ? radius : initialRadius;

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const polygonRef = useRef(null);
  const cornerMarkersRef = useRef([]);

  // ── Initialize map once ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const startLat = parseFloat(effectiveLat) || 12.985300;
    const startLng = parseFloat(effectiveLng) || 77.762465;
    const startRadius = parseInt(effectiveRadius, 10) || 100;

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: 17,
      scrollWheelZoom: !readOnly,
      dragging: !readOnly,
      zoomControl: !readOnly,
      doubleClickZoom: !readOnly,
      touchZoom: !readOnly
    });
    mapRef.current = map;

    // Tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Circle geofence boundary
    const circle = L.circle([startLat, startLng], {
      radius: startRadius,
      color: '#f09650',
      weight: 2,
      fillColor: '#f09650',
      fillOpacity: 0.18
    });
    circleRef.current = circle;

    // Center marker
    const marker = L.marker([startLat, startLng], { draggable: !readOnly });
    markerRef.current = marker;

    if (mode === 'circle') {
      circle.addTo(map);
      marker.addTo(map);
    }

    if (!readOnly) {
      // Click map to reposition center
      map.on('click', (e) => {
        if (mode !== 'circle') return;
        const { lat: newLat, lng: newLng } = e.latlng;
        marker.setLatLng([newLat, newLng]);
        circle.setLatLng([newLat, newLng]);
        if (onLocationChange) {
          onLocationChange({
            lat: parseFloat(newLat.toFixed(6)),
            lng: parseFloat(newLng.toFixed(6))
          });
        }
      });

      // Drag marker
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        circle.setLatLng(pos);
        if (onLocationChange) {
          onLocationChange({
            lat: parseFloat(pos.lat.toFixed(6)),
            lng: parseFloat(pos.lng.toFixed(6))
          });
        }
      });
    }

    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync lat/lng/radius/mode changes ─────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const validLat = parseFloat(effectiveLat) || 12.985300;
    const validLng = parseFloat(effectiveLng) || 77.762465;
    const validRadius = parseInt(effectiveRadius, 10) || 100;

    // Clear previous polygon layers
    if (polygonRef.current) { map.removeLayer(polygonRef.current); polygonRef.current = null; }
    cornerMarkersRef.current.forEach((m) => map.removeLayer(m));
    cornerMarkersRef.current = [];

    if (mode === 'circle') {
      // Show circle + marker
      if (circleRef.current && !map.hasLayer(circleRef.current)) circleRef.current.addTo(map);
      if (markerRef.current && !map.hasLayer(markerRef.current)) markerRef.current.addTo(map);

      markerRef.current?.setLatLng([validLat, validLng]);
      circleRef.current?.setLatLng([validLat, validLng]);
      circleRef.current?.setRadius(validRadius);
      map.panTo([validLat, validLng]);
    } else {
      // Polygon mode — hide circle
      if (circleRef.current && map.hasLayer(circleRef.current)) map.removeLayer(circleRef.current);
      if (markerRef.current && map.hasLayer(markerRef.current)) map.removeLayer(markerRef.current);

      let polyCorners = corners;
      if (typeof polyCorners === 'string') {
        try { polyCorners = JSON.parse(polyCorners); } catch {}
      }

      if (Array.isArray(polyCorners) && polyCorners.length >= 3) {
        const latLngs = polyCorners.map((c) => [parseFloat(c.lat), parseFloat(c.lng)]);
        const poly = L.polygon(latLngs, {
          color: '#f09650',
          weight: 2,
          fillColor: '#f09650',
          fillOpacity: 0.22
        }).addTo(map);
        polygonRef.current = poly;
        map.fitBounds(poly.getBounds(), { padding: [24, 24] });

        // Numbered vertex markers
        if (!readOnly) {
          latLngs.forEach(([cLat, cLng], i) => {
            const icon = L.divIcon({
              className: '',
              html: `<div style="background:#f59e0b;color:#080605;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${i + 1}</div>`,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            });
            const cm = L.marker([cLat, cLng], { draggable: true, icon }).addTo(map);
            cm.on('dragend', () => {
              const pos = cm.getLatLng();
              const newCorners = [...polyCorners];
              newCorners[i] = { lat: parseFloat(pos.lat.toFixed(6)), lng: parseFloat(pos.lng.toFixed(6)) };
              // Rebuild polygon
              const newLatLngs = newCorners.map((c) => [parseFloat(c.lat), parseFloat(c.lng)]);
              poly.setLatLngs(newLatLngs);
              if (onCornersChange) onCornersChange(newCorners);
            });
            cornerMarkersRef.current.push(cm);
          });
        }
      } else {
        // No polygon yet — pan to center coordinates
        map.panTo([validLat, validLng]);
      }
    }
  }, [mode, effectiveLat, effectiveLng, effectiveRadius, corners]);

  const hint = readOnly
    ? '👁 Preview only'
    : mode === 'circle'
    ? '📍 Click or drag pin to set center'
    : '📐 Polygon geofence — drag vertices to reshape';

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-[rgba(255,235,215,0.12)] shadow-xl">
      <div ref={mapContainerRef} style={{ height, width: '100%', zIndex: 10 }} />
      <div className="absolute bottom-2 left-2 z-20 rounded-lg bg-[#080605]/85 px-2.5 py-1 text-[11px] text-[#a39b94] backdrop-blur-md border border-[rgba(255,235,215,0.1)]">
        {hint}
      </div>
    </div>
  );
}
