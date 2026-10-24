// Haversine formula to calculate great-circle distance in meters between two lat/lng points
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const toRad = (x) => (x * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Ray-casting algorithm to test whether a coordinate is inside a polygon
function isPointInPolygon(latitude, longitude, corners) {
  if (!Array.isArray(corners) || corners.length < 3) return false;
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const xi = parseFloat(corners[i].lat), yi = parseFloat(corners[i].lng);
    const xj = parseFloat(corners[j].lat), yj = parseFloat(corners[j].lng);

    if (isNaN(xi) || isNaN(yi) || isNaN(xj) || isNaN(yj)) continue;

    const intersect = ((yi > longitude) !== (yj > longitude)) &&
      (latitude < ((xj - xi) * (longitude - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function checkGeoFence(session, studentLat, studentLng) {
  // If geofencing is not enabled for this session, allow by default
  if (!session.geo_fence_enabled) {
    return { allowed: true, reason: 'Geo-fencing disabled for this session' };
  }

  // If enabled, student MUST provide coordinates
  if (studentLat === undefined || studentLat === null || studentLng === undefined || studentLng === null) {
    return {
      allowed: false,
      reason: 'Location access is required by auditorium geofence. Please enable GPS on your mobile device.'
    };
  }

  const sLat = parseFloat(studentLat);
  const sLng = parseFloat(studentLng);

  if (isNaN(sLat) || isNaN(sLng)) {
    return {
      allowed: false,
      reason: 'Invalid GPS coordinates received from device.'
    };
  }

  // 1. Check if 4-corner polygon coordinates are set
  if (session.geo_corners) {
    try {
      const corners = typeof session.geo_corners === 'string'
        ? JSON.parse(session.geo_corners)
        : session.geo_corners;

      if (Array.isArray(corners) && corners.length >= 3) {
        const isInside = isPointInPolygon(sLat, sLng, corners);
        if (isInside) {
          return {
            allowed: true,
            reason: 'Verified inside designated auditorium boundaries'
          };
        } else {
          // Calculate distance to nearest corner for friendly error info
          let minDistance = Infinity;
          for (const pt of corners) {
            const d = haversineDistance(parseFloat(pt.lat), parseFloat(pt.lng), sLat, sLng);
            if (d < minDistance) minDistance = d;
          }
          return {
            allowed: false,
            distance: Math.round(minDistance),
            reason: `Outside auditorium boundary (~${Math.round(minDistance)}m from boundary corner)`
          };
        }
      }
    } catch (e) {
      console.warn('[GeoCheck] Error parsing geo_corners JSON:', e);
    }
  }

  // 2. Fallback to center point + radius
  let cLat = parseFloat(session.geo_lat);
  let cLng = parseFloat(session.geo_lng);
  let radius = parseFloat(session.geo_radius_m) || 100;

  if (isNaN(cLat) || isNaN(cLng)) {
    try {
      const db = require('../db');
      const defaultVenue = db.prepare('SELECT * FROM venue_configs ORDER BY id DESC LIMIT 1').get();
      if (defaultVenue) {
        cLat = defaultVenue.geo_lat;
        cLng = defaultVenue.geo_lng;
        radius = defaultVenue.geo_radius_m || 100;
      }
    } catch {}
  }

  if (isNaN(cLat) || isNaN(cLng)) {
    return { allowed: true, reason: 'Auditorium coordinates not configured properly' };
  }

  const distance = haversineDistance(cLat, cLng, sLat, sLng);

  if (distance <= radius) {
    return {
      allowed: true,
      distance: Math.round(distance),
      reason: `Within boundary (${Math.round(distance)}m / ${radius}m allowed)`
    };
  } else {
    return {
      allowed: false,
      distance: Math.round(distance),
      reason: `Outside auditorium radius (${Math.round(distance)}m away, max allowed is ${radius}m)`
    };
  }
}

module.exports = {
  haversineDistance,
  isPointInPolygon,
  checkGeoFence
};
