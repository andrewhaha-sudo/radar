import { useEffect, useState } from 'react';
import { LayersControl, GeoJSON } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import { api } from '@/lib/api';
import type { Row } from './tools';
export function OfficialLayerOverlay() {
  const [layers, setLayers] = useState<Row[]>([]);
  useEffect(() => {
    api
      .get<{ layers: Row[] }>('/api/advanced/layers')
      .then((result) =>
        setLayers(result.layers.filter((row) => row.verified && row.freshness !== 'expired')),
      )
      .catch(() => {});
  }, []);
  return layers.length ? (
    <LayersControl position="bottomleft">
      {layers.map((row) => (
        <LayersControl.Overlay
          key={row.id}
          name={`${row.agency}: ${row.title} (${row.publishedAt.slice(0, 10)})`}
        >
          <GeoJSON
            data={row.geojson as GeoJsonObject}
            style={{ color: '#ffa83d', weight: 3, fillOpacity: 0.12 }}
            onEachFeature={(feature, layer) => {
              const node = document.createElement('span');
              node.textContent = `${feature.properties?.name ?? row.title} · ${row.agency} · published ${row.publishedAt}. Source attributes: ${Object.entries(
                feature.properties ?? {},
              )
                .map(([key, value]) => `${key}: ${value}`)
                .join('; ')}`;
              layer.bindPopup(node);
            }}
          />
        </LayersControl.Overlay>
      ))}
    </LayersControl>
  ) : null;
}
