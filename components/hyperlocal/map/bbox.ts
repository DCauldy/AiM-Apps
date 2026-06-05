/**
 * Compute bounding box [minX, minY, maxX, maxY] for a GeoJSON FeatureCollection.
 * Returns null if the collection contains no usable geometry.
 *
 * Small standalone helper so we don't pull in the entire @turf/bbox just
 * for this one calculation.
 */
export default function bbox(
  collection: GeoJSON.FeatureCollection
): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of collection.features) {
    walkCoords(feature.geometry, (x, y) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    });
  }

  if (!isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

function walkCoords(
  geom: GeoJSON.Geometry | null,
  cb: (x: number, y: number) => void
): void {
  if (!geom) return;
  switch (geom.type) {
    case "Point":
      cb(geom.coordinates[0], geom.coordinates[1]);
      return;
    case "MultiPoint":
    case "LineString":
      for (const c of geom.coordinates) cb(c[0], c[1]);
      return;
    case "MultiLineString":
    case "Polygon":
      for (const ring of geom.coordinates)
        for (const c of ring) cb(c[0], c[1]);
      return;
    case "MultiPolygon":
      for (const poly of geom.coordinates)
        for (const ring of poly) for (const c of ring) cb(c[0], c[1]);
      return;
    case "GeometryCollection":
      for (const g of geom.geometries) walkCoords(g, cb);
      return;
  }
}
