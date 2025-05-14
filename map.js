import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoibmFuZGFwYXl5YXBwaWxseSIsImEiOiJjbWFpcTU4ZjkwazV1MmtvY3I1MW00dDVjIn0.GMln_W6gOM67aQ_hkTdTew';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/nandapayyappilly/cmaixjs0r00xz01si7gakftm7',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

map.on('load', async () => {
  const svg = d3.select('#map')
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .style('position', 'absolute')
    .style('top', '0')
    .style('left', '0')
    .style('pointer-events', 'none');

  // Add Boston bike lane layer
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 5,
      'line-opacity': 0.6
    },
  });

  // Add Cambridge bike lane layer
  map.addSource('cambridge_routes', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_routes',
    paint: {
      'line-color': '#FFA500',
      'line-width': 4,
      'line-opacity': 0.6,
    },
  });

  try {
    const jsonData = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
    let trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
      }
    );

    const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
    const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

    let stations = computeStationTraffic(jsonData.data.stations, trips);

    stations = stations.map((station) => {
      const id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);
    
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    const circles = svg
      .selectAll('circle')
      .data(stations, (d) => d.short_name)
      .enter()
      .append('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .attr('opacity', 0.8)
      .style('--departure-ratio', (d) =>
        stationFlow(d.departures / d.totalTraffic),
      );
      

    // Position circles on the map
    function updatePositions() {
      circles
        .attr('cx', (d) => getCoords(d).cx)
        .attr('cy', (d) => getCoords(d).cy);
    }

    updatePositions();

    // Add tooltips after positions are calculated
    circles.append('title')
      .text((d) => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);

    // Update circle positions on map interaction
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    function updateTimeDisplay() {
      let timeFilter = Number(timeSlider.value);

      if (timeFilter === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
      } else {
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.style.display = 'none';
      }

      updateScatterPlot(timeFilter);
    }

    function updateScatterPlot(timeFilter) {
      const filteredTrips = filterTripsbyTime(trips, timeFilter);
      const filteredStations = computeStationTraffic(stations, filteredTrips);

      circles
        .data(filteredStations, (d) => d.short_name)
        .join('circle')
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .style('--departure-ratio', (d) =>
            stationFlow(d.departures / d.totalTraffic),
        );
        
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();

  } catch (error) {
    console.error('Error loading data:', error);
  }
});

// Utility: Convert lat/lon to pixel coords
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

// Utility: Compute traffic per station
function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(trips, (v) => v.length, (d) => d.start_station_id);
  const arrivals = d3.rollup(trips, (v) => v.length, (d) => d.end_station_id);

  return stations.map((station) => {
    const id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

// Utility: Convert datetime to minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Utility: Filter trips near a time
function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips
    : trips.filter((trip) => {
        const started = minutesSinceMidnight(trip.started_at);
        const ended = minutesSinceMidnight(trip.ended_at);
        return (
          Math.abs(started - timeFilter) <= 60 ||
          Math.abs(ended - timeFilter) <= 60
        );
      });
}

// Utility: Format minutes as HH:MM AM/PM
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}
