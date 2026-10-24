import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

// Fix default leaflet marker icon asset path issues with Vite bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
});

export default function VenueMapPicker({ lat, lng, radius, onLocationChange, height = '350px' }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialLat = parseFloat(lat) || 12.983020;
    const initialLng = parseFloat(lng) || 77.759970;
    const initialRadius = parseInt(radius, 10) || 100;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
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
    const circle = L.circle([initialLat, initialLng], {
      radius: initialRadius,
      color: '#f09650',
      weight: 2,
      fillColor: '#f09650',
      fillOpacity: 0.2
    }).addTo(map);
    circleRef.current = circle;

    // Draggable Center Marker
    const marker = L.marker([initialLat, initialLng], {
      draggable: true
    }).addTo(map);
    markerRef.current = marker;

    // Click on map to reposition center
    map.on('click', (e) => {
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

    // Drag marker to reposition
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

    // Invalidate size in case of flex/modal layout
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map when lat, lng, or radius prop changes
  useEffect(() => {
    const validLat = parseFloat(lat);
    const validLng = parseFloat(lng);
    const validRadius = parseInt(radius, 10) || 100;

    if (isNaN(validLat) || isNaN(validLng)) return;

    if (mapRef.current && markerRef.current && circleRef.current) {
      markerRef.current.setLatLng([validLat, validLng]);
      circleRef.current.setLatLng([validLat, validLng]);
      circleRef.current.setRadius(validRadius);
      mapRef.current.panTo([validLat, validLng]);
    }
  }, [lat, lng, radius]);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-[rgba(255,235,215,0.12)] shadow-xl">
      <div ref={mapContainerRef} style={{ height, width: '100%', zIndex: 10 }} />
      <div className="absolute bottom-2 left-2 z-20 rounded-lg bg-[#080605]/80 px-2.5 py-1 text-[11px] text-[#a39b94] backdrop-blur-md border border-[rgba(255,235,215,0.1)]">
        📍 Click map or drag pin to adjust auditorium geofence center
      </div>
    </div>
  );
}
