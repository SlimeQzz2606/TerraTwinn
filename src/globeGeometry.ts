type PolygonGeometry = { type?: string; coordinates: number[][][] }

/** globe.gl's spherical polygon renderer expects clockwise outer rings.
 * Keep the catalog's original GeoJSON/KML untouched: a counterclockwise small
 * ROI is otherwise rendered as its complement, covering almost the whole Earth.
 */
export function globePolygonGeometry(geometry: PolygonGeometry) {
  return {
    ...geometry,
    type: 'Polygon' as const,
    coordinates: geometry.coordinates.map((ring, index) => {
      let twiceArea = 0
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i]!, b = ring[i + 1]!
        twiceArea += a[0]! * b[1]! - b[0]! * a[1]!
      }
      const shouldReverse = index === 0 ? twiceArea > 0 : twiceArea < 0
      return shouldReverse ? [...ring].reverse() : ring
    })
  }
}
