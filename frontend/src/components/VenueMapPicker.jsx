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
 * VenueMapPicker — Interactive Leaflet map supporting both Circle and Polygon geofences.
 *
 * Circle mode:
 *  - Displays center marker and circular boundary radius
 *  - Click map or drag center marker to move center
 *  - Radius slider controlled externally
 *
 * Polygon mode:
 *  - Zero circles or circular radius displays
 *  - Click map to place vertex 1, 2, ..., N (up to targetEdges)
 *  - Shows numbered badge for each vertex (1, 2, ...)
 *  - Polyline connects points as drawn; closes into shaded polygon upon reaching targetEdges
 *  - All vertex markers are draggable to fine-tune boundary
 */
export default function VenueMapPicker({
  lat,
  lng,
  radius,
  initialLat = 12.985300,
  initialLng = 77.762465,
  initialRadius = 100,
  mode = 'circle',
  targetEdges = 4,
  corners = [],
  readOnly = false,
  onLocationChange,
  onRadiusChange,
  onCornersChange,
  height = '340px'
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  // Layer references for clean lifecycle
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const polygonRef = useRef(null);
  const polylineRef = useRef(null);
  const vertexMarkersRef = useRef([]);

  // Active state refs for event listeners
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cornersRef = useRef(corners);
  cornersRef.current = Array.isArray(corners) ? corners : [];
  const targetEdgesRef = useRef(targetEdges);
  targetEdgesRef.current = targetEdges;
  const onCornersChangeRef = useRef(onCornersChange);
  onCornersChangeRef.current = onCornersChange;
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const effectiveLat = lat !== undefined ? lat : initialLat;
  const effectiveLng = lng !== undefined ? lng : initialLng;
  const effectiveRadius = radius !== undefined ? radius : initialRadius;

  // ── 1. Initialize Map on Mount ───────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const startLat = parseFloat(effectiveLat) || 12.985300;
    const startLng = parseFloat(effectiveLng) || 77.762465;

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: 17,
      scrollWheelZoom: !readOnly,
      dragging: !readOnly,
      zoomControl: !readOnly,
      doubleClickZoom: false,
      touchZoom: !readOnly
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Dynamic map click listener
    map.on('click', (e) => {
      if (readOnlyRef.current) return;

      const clickLat = parseFloat(e.latlng.lat.toFixed(6));
      const clickLng = parseFloat(e.latlng.lng.toFixed(6));

      if (modeRef.current === 'circle') {
        if (markerRef.current) markerRef.current.setLatLng([clickLat, clickLng]);
        if (circleRef.current) circleRef.current.setLatLng([clickLat, clickLng]);
        if (onLocationChangeRef.current) {
          onLocationChangeRef.current({ lat: clickLat, lng: clickLng });
        }
      } else if (modeRef.current === 'polygon') {
        const curCorners = cornersRef.current || [];
        const maxPts = targetEdgesRef.current || 4;

        if (curCorners.length < maxPts) {
          const updated = [...curCorners, { lat: clickLat, lng: clickLng }];
          if (onCornersChangeRef.current) {
            onCornersChangeRef.current(updated);
          }
        }
      }
    });

    setTimeout(() => map.invalidateSize(), 250);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Sync Map Layers on State Changes ──────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const curLat = parseFloat(effectiveLat) || 12.985300;
    const curLng = parseFloat(effectiveLng) || 77.762465;
    const curRad = parseInt(effectiveRadius, 10) || 100;

    // Helper: remove circle layers
    const removeCircleLayers = () => {
      if (circleRef.current && map.hasLayer(circleRef.current)) {
        map.removeLayer(circleRef.current);
        circleRef.current = null;
      }
      if (markerRef.current && map.hasLayer(markerRef.current)) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    };

    // Helper: remove polygon layers
    const removePolygonLayers = () => {
      if (polygonRef.current && map.hasLayer(polygonRef.current)) {
        map.removeLayer(polygonRef.current);
        polygonRef.current = null;
      }
      if (polylineRef.current && map.hasLayer(polylineRef.current)) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
      vertexMarkersRef.current.forEach((m) => {
        if (map.hasLayer(m)) map.removeLayer(m);
      });
      vertexMarkersRef.current = [];
    };

    if (mode === 'circle') {
      // Clean up any polygon layers
      removePolygonLayers();

      // Ensure circle layer exists
      if (!circleRef.current) {
        circleRef.current = L.circle([curLat, curLng], {
          radius: curRad,
          color: '#f97316',
          weight: 2.5,
          fillColor: '#f97316',
          fillOpacity: 0.18
        }).addTo(map);
      } else {
        circleRef.current.setLatLng([curLat, curLng]);
        circleRef.current.setRadius(curRad);
      }

      // Ensure center marker exists
      if (!markerRef.current) {
        markerRef.current = L.marker([curLat, curLng], { draggable: !readOnly }).addTo(map);
        if (!readOnly) {
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current.getLatLng();
            const newLat = parseFloat(pos.lat.toFixed(6));
            const newLng = parseFloat(pos.lng.toFixed(6));
            if (circleRef.current) circleRef.current.setLatLng([newLat, newLng]);
            if (onLocationChange) onLocationChange({ lat: newLat, lng: newLng });
          });
        }
      } else {
        markerRef.current.setLatLng([curLat, curLng]);
      }

      // Center map on circle center
      map.panTo([curLat, curLng]);

    } else if (mode === 'polygon') {
      // Clean up any circle layers — STRICT SEPARATION!
      removeCircleLayers();
      removePolygonLayers();

      let pts = corners;
      if (typeof pts === 'string') {
        try { pts = JSON.parse(pts); } catch { pts = []; }
      }
      if (!Array.isArray(pts)) pts = [];

      const latLngs = pts.map((p) => [parseFloat(p.lat), parseFloat(p.lng)]);

      // Draw numbered vertex markers for all placed points
      latLngs.forEach(([pLat, pLng], i) => {
        const badgeHtml = `
          <div style="
            background: #f97316;
            color: #ffffff;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            font-family: monospace;
            border: 2px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0,0,0,0.55);
            cursor: ${readOnly ? 'default' : 'grab'};
          ">${i + 1}</div>
        `;
        const icon = L.divIcon({
          className: '',
          html: badgeHtml,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const vm = L.marker([pLat, pLng], { draggable: !readOnly, icon }).addTo(map);

        if (!readOnly) {
          vm.on('drag', () => {
            // Live update line or polygon during drag
            const pos = vm.getLatLng();
            const updated = [...pts];
            updated[i] = { lat: parseFloat(pos.lat.toFixed(6)), lng: parseFloat(pos.lng.toFixed(6)) };
            const updatedLatLngs = updated.map((p) => [parseFloat(p.lat), parseFloat(p.lng)]);
            if (polygonRef.current) polygonRef.current.setLatLngs(updatedLatLngs);
            if (polylineRef.current) polylineRef.current.setLatLngs(updatedLatLngs);
          });

          vm.on('dragend', () => {
            const pos = vm.getLatLng();
            const updated = [...pts];
            updated[i] = { lat: parseFloat(pos.lat.toFixed(6)), lng: parseFloat(pos.lng.toFixed(6)) };
            if (onCornersChange) onCornersChange(updated);
          });
        }

        vertexMarkersRef.current.push(vm);
      });

      if (latLngs.length >= targetEdges) {
        // Complete closed polygon
        const poly = L.polygon(latLngs, {
          color: '#f97316',
          weight: 3,
          fillColor: '#f97316',
          fillOpacity: 0.22,
          lineJoin: 'round'
        }).addTo(map);
        polygonRef.current = poly;

        try {
          map.fitBounds(poly.getBounds(), { padding: [28, 28], maxZoom: 18 });
        } catch {}
      } else if (latLngs.length > 1) {
        // Partial open polyline connecting points placed so far
        const line = L.polyline(latLngs, {
          color: '#f97316',
          weight: 2.5,
          dashArray: '6, 6',
          opacity: 0.9
        }).addTo(map);
        polylineRef.current = line;
      } else if (latLngs.length === 1) {
        map.panTo(latLngs[0]);
      } else {
        // Zero points placed: pan to center coordinate as initial canvas
        map.panTo([curLat, curLng]);
      }
    }
  }, [mode, effectiveLat, effectiveLng, effectiveRadius, corners, targetEdges, readOnly]);

  const ptsCount = Array.isArray(corners) ? corners.length : 0;
  let hint = '👁 Preview only';
  if (!readOnly) {
    if (mode === 'circle') {
      hint = '📍 Click or drag pin to position circular geofence';
    } else {
      if (ptsCount < targetEdges) {
        hint = `📐 Click map to place vertex ${ptsCount + 1} of ${targetEdges}`;
      } else {
        hint = `✓ All ${targetEdges} vertices placed — drag markers to adjust`;
      }
    }
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-[rgba(255,235,215,0.12)] shadow-xl">
      <div ref={mapContainerRef} style={{ height, width: '100%', zIndex: 10 }} />
      <div className="absolute bottom-2 left-2 z-20 rounded-lg bg-[#080605]/90 px-3 py-1.5 text-[11px] text-[#f5f0ea] backdrop-blur-md border border-[rgba(255,235,215,0.12)] flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span>{hint}</span>
      </div>
    </div>
  );
}
