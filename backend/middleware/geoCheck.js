// Haversine formula to calculate great-circle distance in meters
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (x) => (x * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Ray-casting algorithm — point-in-polygon test
function isPointInPolygon(latitude, longitude, corners) {
  if (!Array.isArray(corners) || corners.length < 3) return false;
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const xi = parseFloat(corners[i].lat);
    const yi = parseFloat(corners[i].lng);
    const xj = parseFloat(corners[j].lat);
    const yj = parseFloat(corners[j].lng);
    if (isNaN(xi) || isNaN(yi) || isNaN(xj) || isNaN(yj)) continue;
    const intersect =
      yi > longitude !== yj > longitude &&
      latitude < ((xj - xi) * (longitude - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Validate that polygon corners are well-formed
function validatePolygonCorners(corners) {
  if (!Array.isArray(corners)) return { valid: false, reason: 'Corners must be an array' };
  if (corners.length < 3) return { valid: false, reason: `At least 3 corners required, got ${corners.length}` };
  for (let i = 0; i < corners.length; i++) {
    const lat = parseFloat(corners[i].lat);
    const lng = parseFloat(corners[i].lng);
    if (isNaN(lat) || isNaN(lng)) {
      return { valid: false, reason: `Corner ${i + 1} has invalid coordinates` };
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { valid: false, reason: `Corner ${i + 1} coordinates out of range` };
    }
  }
  return { valid: true };
}

/**
 * Main geofence check function.
 * Returns an object with:
 *   allowed:   boolean
 *   code:      string  — machine-readable failure code for frontend mapping
 *   reason:    string  — human-readable explanation
 *   distance:  number? — meters from boundary (when calculable)
 *
 * Failure codes:
 *   GEOFENCE_DISABLED       — geofencing is off for this session
 *   LOCATION_MISSING        — student did not send lat/lng coordinates
 *   INVALID_COORDINATES     — unparseable coordinate values
 *   OUTSIDE_BOUNDARY        — location confirmed, but outside geofence
 *   VENUE_NOT_CONFIGURED    — admin has not set up venue coordinates
 *   POLYGON_INVALID         — stored polygon corners are malformed
 */
function checkGeoFence(session, studentLat, studentLng) {
  // ── 1. Geofencing disabled for this session ──────────────────────────────
  if (!session.geo_fence_enabled) {
    return {
      allowed: true,
      code: 'GEOFENCE_DISABLED',
      reason: 'Geo-fencing disabled for this session'
    };
  }

  // ── 2. Student provided no coordinates ───────────────────────────────────
  if (studentLat === undefined || studentLat === null ||
      studentLng === undefined || studentLng === null) {
    return {
      allowed: false,
      code: 'LOCATION_MISSING',
      reason: 'Your location could not be obtained. Please enable GPS and location permission for this website, then retry.'
    };
  }

  const sLat = parseFloat(studentLat);
  const sLng = parseFloat(studentLng);

  if (isNaN(sLat) || isNaN(sLng)) {
    return {
      allowed: false,
      code: 'INVALID_COORDINATES',
      reason: 'Invalid GPS coordinates received from your device. Please refresh and try again.'
    };
  }

  // ── 3. Determine geofence mode from session ───────────────────────────────
  // Prefer explicit geo_type field; fall back to presence of geo_corners
  const geoType = session.geo_type || (session.geo_corners ? 'polygon' : 'circle');

  // ── 4. Polygon mode ───────────────────────────────────────────────────────
  if (geoType === 'polygon' && session.geo_corners) {
    let corners;
    try {
      corners = typeof session.geo_corners === 'string'
        ? JSON.parse(session.geo_corners)
        : session.geo_corners;
    } catch {
      console.warn('[GeoCheck] geo_corners JSON parse failed for session', session.id);
      // Malformed polygon — fall through to circle check rather than blocking all students
    }

    if (corners) {
      const validation = validatePolygonCorners(corners);
      if (!validation.valid) {
        console.warn(`[GeoCheck] Invalid polygon for session ${session.id}: ${validation.reason}`);
        return {
          allowed: false,
          code: 'POLYGON_INVALID',
          reason: `Venue polygon configuration error: ${validation.reason}. Please contact the administrator.`
        };
      }

      const isInside = isPointInPolygon(sLat, sLng, corners);
      if (isInside) {
        return {
          allowed: true,
          code: 'INSIDE_POLYGON',
          reason: 'Verified inside designated venue boundary'
        };
      }

      // Calculate nearest distance from any polygon edge corner for diagnostics
      let minDistance = Infinity;
      for (const pt of corners) {
        const d = haversineDistance(parseFloat(pt.lat), parseFloat(pt.lng), sLat, sLng);
        if (d < minDistance) minDistance = d;
      }
      return {
        allowed: false,
        code: 'OUTSIDE_BOUNDARY',
        distance: Math.round(minDistance),
        reason: `Your location is outside the designated attendance area (approximately ${Math.round(minDistance)}m from the venue boundary). Make sure you are physically present in the correct classroom or auditorium.`
      };
    }
  }

  // ── 5. Circle mode (default) ──────────────────────────────────────────────
  let cLat = parseFloat(session.geo_lat);
  let cLng = parseFloat(session.geo_lng);
  let radius = parseFloat(session.geo_radius_m) || 100;

  // If session has no coordinates, fall back to the default venue config
  if (isNaN(cLat) || isNaN(cLng)) {
    try {
      const db = require('../db');
      const defaultVenue = db
        .prepare('SELECT geo_lat, geo_lng, geo_radius_m FROM venue_configs ORDER BY id DESC LIMIT 1')
        .get();
      if (defaultVenue) {
        cLat = defaultVenue.geo_lat;
        cLng = defaultVenue.geo_lng;
        radius = defaultVenue.geo_radius_m || 100;
        console.warn(`[GeoCheck] Session ${session.id} has no venue coords — using default venue config`);
      }
    } catch (e) {
      console.error('[GeoCheck] Failed to load default venue config:', e.message);
    }
  }

  if (isNaN(cLat) || isNaN(cLng)) {
    console.error(`[GeoCheck] No venue coordinates found for session ${session.id}`);
    return {
      allowed: false,
      code: 'VENUE_NOT_CONFIGURED',
      reason: 'The venue location has not been configured. Please contact the administrator to set up the geofence.'
    };
  }

  const distance = haversineDistance(cLat, cLng, sLat, sLng);

  if (distance <= radius) {
    return {
      allowed: true,
      code: 'INSIDE_CIRCLE',
      distance: Math.round(distance),
      reason: `Within boundary (${Math.round(distance)}m / ${radius}m allowed)`
    };
  }

  return {
    allowed: false,
    code: 'OUTSIDE_BOUNDARY',
    distance: Math.round(distance),
    reason: `Your location is outside the allowed attendance area — you are approximately ${Math.round(distance)}m away (maximum allowed: ${radius}m). Please ensure you are physically present in the correct venue.`
  };
}

module.exports = {
  haversineDistance,
  isPointInPolygon,
  validatePolygonCorners,
  checkGeoFence
};
