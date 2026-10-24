import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix default leaflet marker icon asset path issues with Vite bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});

export default function VenueMapPicker({ 
  lat, 
  lng, 
  radius, 
  initialLat = 12.985300,
  initialLng = 77.762465,
  initialRadius = 100,
  mode = 'circle', // 'circle' | 'polygon'
  corners = null,
  onLocationChange,
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

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const startLat = parseFloat(effectiveLat) || 12.985300;
    const startLng = parseFloat(effectiveLng) || 77.762465;
    const startRadius = parseInt(effectiveRadius, 10) || 100;

    const map = L.map(mapContainerRef.current, {
      center: [startLat, startLng],
      zoom: 17,
      scrollWheelZoom: true
    });
    mapRef.current = map;

    // OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Amber Circle for Geofence
    const circle = L.circle([startLat, startLng], {
      radius: startRadius,
      color: '#f09650',
      weight: 2,
      fillColor: '#f09650',
      fillOpacity: 0.2
    });
    circleRef.current = circle;

    // Draggable Center Marker
    const marker = L.marker([startLat, startLng], {
      draggable: true
    });
    markerRef.current = marker;

    if (mode === 'circle') {
      circle.addTo(map);
      marker.addTo(map);
    }

    // Click on map to reposition center in circle mode
    map.on('click', (e) => {
      const { lat: newLat, lng: newLng } = e.latlng;
      if (mode === 'circle') {
        marker.setLatLng([newLat, newLng]);
        circle.setLatLng([newLat, newLng]);
        if (onLocationChange) {
          onLocationChange({
            lat: parseFloat(newLat.toFixed(6)),
            lng: parseFloat(newLng.toFixed(6)),
            radius: parseInt(radius, 10) || 100
          });
        }
      }
    });

    // Drag marker to reposition
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      circle.setLatLng(pos);
      if (onLocationChange) {
        onLocationChange({
          lat: parseFloat(pos.lat.toFixed(6)),
          lng: parseFloat(pos.lng.toFixed(6)),
          radius: parseInt(radius, 10) || 100
        });
      }
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update mode, circle or polygon
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear previous polygon
    if (polygonRef.current) {
      map.removeLayer(polygonRef.current);
      polygonRef.current = null;
    }
    cornerMarkersRef.current.forEach((m) => map.removeLayer(m));
    cornerMarkersRef.current = [];

    if (mode === 'circle') {
      if (circleRef.current && !map.hasLayer(circleRef.current)) circleRef.current.addTo(map);
      if (markerRef.current && !map.hasLayer(markerRef.current)) markerRef.current.addTo(map);

      const validLat = parseFloat(effectiveLat) || 12.985300;
      const validLng = parseFloat(effectiveLng) || 77.762465;
      const validRadius = parseInt(effectiveRadius, 10) || 100;

      markerRef.current?.setLatLng([validLat, validLng]);
      circleRef.current?.setLatLng([validLat, validLng]);
      circleRef.current?.setRadius(validRadius);
      map.panTo([validLat, validLng]);
    } else {
      // Polygon mode
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
          fillOpacity: 0.25
        }).addTo(map);
        polygonRef.current = poly;

        // Fit map bounds to polygon
        map.fitBounds(poly.getBounds(), { padding: [20, 20] });
      }
    }
  }, [mode, effectiveLat, effectiveLng, effectiveRadius, corners]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-[rgba(255,235,215,0.12)] shadow-xl">
      <div ref={mapContainerRef} style={{ height, width: '100%', zIndex: 10 }} />
      <div className="absolute bottom-2 left-2 z-20 rounded-lg bg-[#080605]/85 px-2.5 py-1 text-[11px] text-[#a39b94] backdrop-blur-md border border-[rgba(255,235,215,0.1)]">
        {mode === 'circle' 
          ? '📍 Click or drag pin to adjust center & boundary circle' 
          : '📐 Polygon geofence boundary active'}
      </div>
    </div>
  );
}
