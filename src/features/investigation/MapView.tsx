import { useEffect, useRef, useState } from 'react'
import { Map as LibreMap, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent, type Map as LibreMapInstance, type StyleSpecification } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Facility, Observation } from '../../lib/api'

setWorkerUrl(maplibreWorkerUrl)

const styles = {
  streets: {
    version: 8,
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
    layers: [{ id: 'osm-raster', type: 'raster', source: 'osm' }],
  },
  satellite: {
    version: 8,
    sources: { esri: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' } },
    layers: [{ id: 'esri-imagery', type: 'raster', source: 'esri' }],
  },
} satisfies Record<'streets' | 'satellite', StyleSpecification>

type Props = {
  layer: 'streets' | 'satellite'
  observations: Observation[]
  facilities: Facility[]
  selectedId: string | null
  showObservations: boolean
  showFacilities: boolean
  onSelect: (observation: Observation | null) => void
  onFacilitySelect: (facility: Facility | null) => void
}

export function MapView({ layer, observations, facilities, selectedId, showObservations, showFacilities, onSelect, onFacilitySelect }: Props) {  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LibreMapInstance | null>(null)
  const observationsRef = useRef(observations)
  const selectRef = useRef(onSelect)
  const facilitySelectRef = useRef(onFacilitySelect)
  const facilitiesRef = useRef(facilities)
  const [mapError, setMapError] = useState(false)
  const [mapErrorMessage, setMapErrorMessage] = useState('')
  const styleReady = useRef(false)
  const activeLayer = useRef(layer)
  const [zoom, setZoom] = useState(8)
  const selectedRef = useRef(selectedId)
  const showObservationsRef = useRef(showObservations)
  const showFacilitiesRef = useRef(showFacilities)
  useEffect(() => {
  observationsRef.current = observations
  selectRef.current = onSelect
  facilitySelectRef.current = onFacilitySelect
  facilitiesRef.current = facilities
  selectedRef.current = selectedId
  showObservationsRef.current = showObservations
  showFacilitiesRef.current = showFacilities
}, [observations, onSelect, onFacilitySelect, facilities, selectedId, showObservations, showFacilities])


  useEffect(() => {
    const updateMapData = () => {
      const instance = map.current
      if (!instance?.isStyleLoaded()) return

      const observationSource = instance.getSource(
        'wildsignal-observations',
      ) as GeoJSONSource | undefined

      const facilitySource = instance.getSource(
        'wildsignal-facilities',
      ) as GeoJSONSource | undefined

      if (!observationSource || !facilitySource) return

      observationSource.setData({
        type: 'FeatureCollection',
        features: observations.map((observation) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [observation.longitude, observation.latitude],
          },
          properties: {
            id: observation.id,
            acquired_at: observation.acquired_at,
          },
        })),
      })

      facilitySource.setData({
        type: 'FeatureCollection',
        features: facilities.map((facility) => ({
          type: 'Feature',
          geometry: facility.geometry,
          properties: {
            id: facility.id,
            name: facility.name,
            osm_type: facility.osm_type,
            osm_id: facility.osm_id,
          },
        })),
      })

      for (const id of [
        'observation-clusters',
        'observation-cluster-label',
        'observation-points',
        'observation-selected',
      ]) {
        if (instance.getLayer(id)) {
          instance.setLayoutProperty(
            id,
            'visibility',
            showObservations ? 'visible' : 'none',
          )
        }
      }

      for (const id of [
        'facility-polygons',
        'facility-lines',
        'facility-points',
      ]) {
        if (instance.getLayer(id)) {
          instance.setLayoutProperty(
            id,
            'visibility',
            showFacilities ? 'visible' : 'none',
          )
        }
      }

      if (instance.getLayer('observation-selected')) {
        instance.setFilter('observation-selected', [
          'all',
          ['!', ['has', 'point_count']],
          ['==', ['get', 'id'], selectedId || ''],
        ])
      }
    }

    updateMapData()

    const instance = map.current
    if (!instance) return

    instance.on('style.load', updateMapData)

    return () => {
      instance.off('style.load', updateMapData)
    }
  }, [
    observations,
    facilities,
    selectedId,
    showObservations,
    showFacilities,
    layer,
  ])

  useEffect(() => {
    if (!container.current || map.current) return
    const instance = new LibreMap({ container: container.current, style: styles.streets,
      center: [80.22, 13.2], zoom: 9, minZoom: 6, maxZoom: 18,
      attributionControl: false, cooperativeGestures: true })
    map.current = instance
    instance.addControl(new ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left')
    const addDataLayers = () => {
  if (!instance.isStyleLoaded()) {
    instance.once('idle', addDataLayers)
    return
  }
      if (!instance.getSource('wildsignal-observations')) {
        instance.addSource('wildsignal-observations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 42, clusterMaxZoom: 14 })
        instance.addLayer({ id: 'observation-clusters', type: 'circle', source: 'wildsignal-observations', filter: ['has', 'point_count'], paint: { 'circle-color': '#e95a2a', 'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 30, 24], 'circle-stroke-width': 2, 'circle-stroke-color': '#ffd47c' } })
        instance.addLayer({ id: 'observation-cluster-label', type: 'symbol', source: 'wildsignal-observations', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Open Sans Semibold'], 'text-size': 10 }, paint: { 'text-color': '#fffaf0' } })
        instance.addLayer({ id: 'observation-points', type: 'circle', source: 'wildsignal-observations', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#f05a28', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 13, 8, 18, 11], 'circle-stroke-color': '#ffc15a', 'circle-stroke-width': 2, 'circle-opacity': 0.95 } })
        instance.addLayer({ id: 'observation-selected', type: 'circle', source: 'wildsignal-observations', filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], '']], paint: { 'circle-color': 'rgba(84,217,244,.19)', 'circle-radius': 18, 'circle-stroke-color': '#54D9F4', 'circle-stroke-width': 2.5, 'circle-blur': 0.18 } })
      }
      if (!instance.getSource('wildsignal-facilities')) {
        instance.addSource('wildsignal-facilities', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        instance.addLayer({ id: 'facility-polygons', type: 'fill', source: 'wildsignal-facilities', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#54D9F4', 'fill-opacity': 0.12, 'fill-outline-color': '#8BAEFF' } })
        instance.addLayer({ id: 'facility-lines', type: 'line', source: 'wildsignal-facilities', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#74CDE2', 'line-width': 1.5, 'line-opacity': 0.78 } })
        instance.addLayer({ id: 'facility-points', type: 'circle', source: 'wildsignal-facilities', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#243F56', 'circle-radius': 4, 'circle-stroke-color': '#A9DDF0', 'circle-stroke-width': 1.5, 'circle-opacity': 0.9 } })
      }
      const obsSource = instance.getSource('wildsignal-observations') as GeoJSONSource | undefined
      const facilitySource = instance.getSource('wildsignal-facilities') as GeoJSONSource | undefined
      
      obsSource?.setData({ type: 'FeatureCollection', features: observationsRef.current.map((observation) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [observation.longitude, observation.latitude] }, properties: { id: observation.id, acquired_at: observation.acquired_at } })) })
      facilitySource?.setData({ type: 'FeatureCollection', features: facilitiesRef.current.map((facility) => ({ type: 'Feature', geometry: facility.geometry, properties: { id: facility.id, name: facility.name, osm_type: facility.osm_type, osm_id: facility.osm_id } })) })
      for (const id of ['observation-clusters', 'observation-cluster-label', 'observation-points', 'observation-selected']) instance.setLayoutProperty(id, 'visibility', showObservationsRef.current ? 'visible' : 'none')
      for (const id of ['facility-polygons', 'facility-lines', 'facility-points']) instance.setLayoutProperty(id, 'visibility', showFacilitiesRef.current ? 'visible' : 'none')
      instance.setFilter('observation-selected', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedRef.current || '']])
    }
   
instance.on('style.load', () => {
  styleReady.current = true
  setMapError(false)
  setMapErrorMessage('')

  addDataLayers()

  const obsSource = instance.getSource(
    'wildsignal-observations',
  ) as GeoJSONSource | undefined

  const facilitySource = instance.getSource(
    'wildsignal-facilities',
  ) as GeoJSONSource | undefined

  obsSource?.setData({
    type: 'FeatureCollection',
    features: observationsRef.current.map((observation) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [observation.longitude, observation.latitude],
      },
      properties: {
        id: observation.id,
        acquired_at: observation.acquired_at,
      },
    })),
  })

  facilitySource?.setData({
    type: 'FeatureCollection',
    features: facilitiesRef.current.map((facility) => ({
      type: 'Feature',
      geometry: facility.geometry,
      properties: {
        id: facility.id,
        name: facility.name,
        osm_type: facility.osm_type,
        osm_id: facility.osm_id,
      },
    })),
  })
})

    instance.on('error', (event) => {
      setMapError(true)
      setMapErrorMessage(event.error.message)
    })
    instance.on('zoom', () => setZoom(Math.round(instance.getZoom())))
    instance.on('click', 'observation-points', (event) => {

  const id = event.features?.[0]?.properties?.id as string | undefined
const selected = observationsRef.current.find((item) => item.id === id) || null
selectRef.current(selected)})
const openFacility = (event: MapLayerMouseEvent) => {
      // an observation marker drawn on top of a facility keeps priority
      const hitLayers = ['observation-points', 'observation-clusters'].filter((id) => instance.getLayer(id))
      if (hitLayers.length && instance.queryRenderedFeatures(event.point, { layers: hitLayers }).length) return
      const feature = event.features?.[0]
      if (!feature) return
      const properties = (feature.properties ?? {}) as Record<string, unknown>
      const facilityId = String(properties.id ?? properties.facility_id ?? '')
      const clicked = feature.geometry.type === 'Point' ? (feature.geometry.coordinates as [number, number]) : [event.lngLat.lng, event.lngLat.lat]
      const facility = facilitiesRef.current.find((item) => item.id === facilityId || String(item.osm_id) === facilityId)
        || facilitiesRef.current.find((item) => Math.abs(item.longitude - clicked[0]) < 0.00001 && Math.abs(item.latitude - clicked[1]) < 0.00001)
      if (!facility) return
      facilitySelectRef.current(facility)
      instance.easeTo({ center: [facility.longitude, facility.latitude], zoom: Math.max(instance.getZoom(), 12) })
    }
    // OpenStreetMap ways are stored as polygons or lines, so all three facility layers open the same details.
    for (const id of ['facility-points', 'facility-lines', 'facility-polygons']) instance.on('click', id, openFacility)
    instance.on('click', 'observation-clusters', (event) => {
      const feature = instance.queryRenderedFeatures(event.point, { layers: ['observation-clusters'] })[0]
      const clusterId = feature?.properties?.cluster_id as number | undefined
      const source = instance.getSource('wildsignal-observations') as GeoJSONSource | undefined
      if (clusterId !== undefined) void source?.getClusterExpansionZoom(clusterId).then((nextZoom) => {
        if (feature?.geometry.type === 'Point') instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: nextZoom })
      }).catch(() => undefined)
    })
    instance.on('click', (event) => {
  const clickedFeatures = instance.queryRenderedFeatures(event.point, {
    layers: [
      'observation-points',
      'observation-clusters',
      'facility-points',
      'facility-lines',
      'facility-polygons',
    ],
  })

  if (!clickedFeatures.length) {
    selectRef.current(null)
  }
})
    for (const id of ['observation-points', 'observation-clusters', 'facility-points', 'facility-lines', 'facility-polygons']) {
      instance.on('mouseenter', id, () => { instance.getCanvas().style.cursor = 'pointer' })
      instance.on('mouseleave', id, () => { instance.getCanvas().style.cursor = '' })
    }
    const recenter = () => instance.flyTo({ center: [80.22, 13.2], zoom: 9, essential: true, duration: 750 })
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(container.current)
    window.addEventListener('wildsignal:recenter', recenter)
    return () => { resize.disconnect(); window.removeEventListener('wildsignal:recenter', recenter); instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    if (!map.current || activeLayer.current === layer) return
    activeLayer.current = layer
    styleReady.current = false
    setMapError(false)
    setMapErrorMessage('')
    map.current.setStyle(styles[layer])
  }, [layer])
  
  const zoomBy = (amount: number) => map.current?.zoomTo(map.current.getZoom() + amount, { duration: 250 })
  return <div className="map-canvas-wrap"><div ref={container} className="map-canvas" aria-label="Map of the Manali–Ennore investigation region" />
    <div className="map-controls"><button title="Zoom in" aria-label="Zoom in" onClick={() => zoomBy(1)}>+</button><button title="Zoom out" aria-label="Zoom out" onClick={() => zoomBy(-1)}>−</button><span>{zoom}<small>ZOOM</small></span></div>
    <div className="map-layer-label">{layer === 'streets' ? 'STREET BASEMAP · OSM' : 'SATELLITE IMAGERY'}</div>
    {mapError && <div className="map-error" role="status"><span className="map-error-icon">!</span><div><b>Basemap tile issue</b><small>{mapErrorMessage || 'Check the tile service connection. The investigation panel remains available.'}</small></div><button onClick={() => { setMapError(false); setMapErrorMessage(''); styleReady.current = false; map.current?.setStyle(styles[layer]) }}>Retry</button></div>}
  </div>
}
