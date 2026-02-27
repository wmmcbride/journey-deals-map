// Journey Alliance Deals Map - Main Application

// Map initialization
let map, markers, drawnItems, currentBasemap;
let allMarkers = [];
let currentRegion = 'all';
let drawControl = null;

// Basemap configurations
const basemaps = {
    light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CartoDB',
        maxZoom: 19
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CartoDB',
        maxZoom: 19
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 19
    }),
    minimal: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap, © CartoDB',
        maxZoom: 19
    })
};

// Region boundaries
const regions = {
    'north-america': {
        bounds: [[24, -125], [50, -66]],
        zoom: 4
    },
    'europe': {
        bounds: [[36, -10], [71, 40]],
        zoom: 4
    },
    'asia': {
        bounds: [[-10, 60], [55, 150]],
        zoom: 3
    },
    'latin-america': {
        bounds: [[-56, -82], [32, -34]],
        zoom: 3
    },
    'africa': {
        bounds: [[-35, -18], [37, 52]],
        zoom: 3
    }
};

// Initialize map
function initMap() {
    map = L.map('map').setView([30, 0], 2);
    
    // Add default basemap
    currentBasemap = basemaps.light;
    currentBasemap.addTo(map);
    
    // Initialize marker cluster group
    markers = L.markerClusterGroup({
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            let size = 'small';
            if (count > 10) size = 'medium';
            if (count > 25) size = 'large';
            
            return L.divIcon({
                html: `<div class="cluster-icon cluster-${size}">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: L.point(40, 40)
            });
        }
    });
    
    // Initialize drawn items layer
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    
    // Add draw controls
    drawControl = new L.Control.Draw({
        draw: {
            polyline: false,
            rectangle: false,
            circlemarker: false,
            marker: false
        },
        edit: {
            featureGroup: drawnItems,
            remove: false
        }
    });
    
    // Create markers
    createMarkers();
    
    // Add markers to map
    map.addLayer(markers);
    
    // Handle zoom changes for dynamic marker sizing
    map.on('zoomend', updateMarkerSizes);
    
    // Handle drawing events
    map.on(L.Draw.Event.CREATED, function(e) {
        drawnItems.clearLayers();
        drawnItems.addLayer(e.layer);
        filterByDrawnRegion();
    });
    
    // Initial filter
    applyFilters();
}

// Create markers from deal data
function createMarkers() {
    dealsData.forEach(deal => {
        const radius = getMarkerRadius(map.getZoom());
        
        const marker = L.circleMarker([deal.lat, deal.lng], {
            radius: radius,
            fillColor: deal.color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85,
            className: 'custom-deal-marker'
        });
        
        // Enhanced popup
        marker.bindPopup(`
            <div class="popup-title">${deal.name}</div>
            <div class="popup-detail"><strong>Owner:</strong> ${deal.owner}</div>
            <div class="popup-detail"><strong>GBV:</strong> $${(deal.gbv / 1000000).toFixed(2)}M</div>
            <div class="popup-detail"><strong>Properties:</strong> ${deal.properties || 0} | <strong>Keys:</strong> ${deal.keys || 0}</div>
            <div class="popup-detail"><strong>Location:</strong> ${deal.city}${deal.state ? ', ' + deal.state : ''}, ${deal.country}</div>
            ${deal.closeDate ? `<div class="popup-detail"><strong>Close Date:</strong> ${new Date(deal.closeDate).toLocaleDateString()}</div>` : ''}
            <div class="popup-stage" style="background-color: ${deal.color};">${deal.stage}</div>
        `, {
            maxWidth: 300,
            className: 'custom-popup'
        });
        
        marker.dealData = deal;
        allMarkers.push(marker);
    });
}

// Get marker radius based on zoom level
function getMarkerRadius(zoom) {
    if (zoom < 4) return 6;
    if (zoom < 6) return 8;
    if (zoom < 8) return 10;
    if (zoom < 10) return 12;
    return 14;
}

// Update marker sizes on zoom
function updateMarkerSizes() {
    const zoom = map.getZoom();
    const radius = getMarkerRadius(zoom);
    
    allMarkers.forEach(marker => {
        marker.setRadius(radius);
        
        // Add glow effect at higher zoom levels
        if (zoom > 10) {
            marker.setStyle({
                weight: 3,
                fillOpacity: 0.9
            });
        } else {
            marker.setStyle({
                weight: 2,
                fillOpacity: 0.85
            });
        }
    });
}

// Apply all filters
function applyFilters() {
    markers.clearLayers();
    
    const selectedStages = Array.from(document.querySelectorAll('.stage-filter:checked')).map(cb => cb.value);
    const selectedOwner = document.getElementById('ownerFilter').value;
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    
    let visibleGBV = 0;
    let visibleCount = 0;
    let visibleProperties = 0;
    let visibleKeys = 0;
    
    allMarkers.forEach(marker => {
        const deal = marker.dealData;
        
        // Stage filter
        const matchesStage = selectedStages.includes(deal.stage);
        
        // Owner filter
        const matchesOwner = selectedOwner === 'all' || deal.owner === selectedOwner;
        
        // Search filter
        const matchesSearch = searchTerm === '' || 
            deal.name.toLowerCase().includes(searchTerm) ||
            deal.city.toLowerCase().includes(searchTerm) ||
            deal.owner.toLowerCase().includes(searchTerm);
        
        // Region filter
        let matchesRegion = true;
        if (currentRegion !== 'all') {
            matchesRegion = isInRegion(deal, currentRegion);
        }
        
        // Drawn region filter
        let matchesDrawn = true;
        if (drawnItems.getLayers().length > 0) {
            const drawnLayer = drawnItems.getLayers()[0];
            const latlng = L.latLng(deal.lat, deal.lng);
            matchesDrawn = drawnLayer.getBounds ? 
                drawnLayer.getBounds().contains(latlng) : 
                (drawnLayer.getLatLng().distanceTo(latlng) <= drawnLayer.getRadius());
        }
        
        if (matchesStage && matchesOwner && matchesSearch && matchesRegion && matchesDrawn) {
            markers.addLayer(marker);
            visibleGBV += deal.gbv;
            visibleCount++;
            visibleProperties += deal.properties || 0;
            visibleKeys += deal.keys || 0;
        }
    });
    
    // Update stats
    document.getElementById('statGBV').textContent = '$' + (visibleGBV / 1000000).toFixed(1) + 'M';
    document.getElementById('statCount').textContent = visibleCount;
    document.getElementById('statProperties').textContent = visibleProperties.toLocaleString();
    document.getElementById('statKeys').textContent = visibleKeys.toLocaleString();
    
    // Update subtitle
    document.getElementById('subtitle').textContent = `${visibleCount} Deals • $${(visibleGBV / 1000000).toFixed(1)}M GBV`;
}

// Check if deal is in region
function isInRegion(deal, region) {
    const bounds = regions[region].bounds;
    return deal.lat >= bounds[0][0] && deal.lat <= bounds[1][0] &&
           deal.lng >= bounds[0][1] && deal.lng <= bounds[1][1];
}

// Filter by drawn region
function filterByDrawnRegion() {
    applyFilters();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // Stage filters
    document.querySelectorAll('.stage-filter').forEach(cb => {
        cb.addEventListener('change', applyFilters);
    });
    
    // Owner filter
    document.getElementById('ownerFilter').addEventListener('change', applyFilters);
    
    // Search
    document.getElementById('searchBox').addEventListener('input', applyFilters);
    
    // Region buttons
    document.querySelectorAll('.region-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const region = this.dataset.region;
            currentRegion = region;
            
            if (region === 'all') {
                map.setView([30, 0], 2);
            } else {
                map.fitBounds(regions[region].bounds);
            }
            
            applyFilters();
        });
    });
    
    // Draw tools
    document.getElementById('drawCircle').addEventListener('click', function() {
        new L.Draw.Circle(map, drawControl.options.draw.circle).enable();
        this.classList.add('active');
        setTimeout(() => this.classList.remove('active'), 300);
    });
    
    document.getElementById('drawPolygon').addEventListener('click', function() {
        new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
        this.classList.add('active');
        setTimeout(() => this.classList.remove('active'), 300);
    });
    
    document.getElementById('clearDrawing').addEventListener('click', function() {
        drawnItems.clearLayers();
        applyFilters();
    });
    
    // Basemap selector
    document.getElementById('basemapSelector').addEventListener('change', function() {
        map.removeLayer(currentBasemap);
        currentBasemap = basemaps[this.value];
        currentBasemap.addTo(map);
        map.invalidateSize();
    });
    
    // Dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');
        this.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    });
    
    // Load dark mode preference
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').textContent = '☀️';
    }
    
    // Reset view
    document.getElementById('resetView').addEventListener('click', function() {
        map.setView([30, 0], 2);
        drawnItems.clearLayers();
        currentRegion = 'all';
        document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.region-btn[data-region="all"]').classList.add('active');
        applyFilters();
    });
    
    // Sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', function() {
        document.getElementById('sidebar').classList.toggle('collapsed');
    });
});

// Add custom cluster icon styles
const style = document.createElement('style');
style.innerHTML = `
    .custom-cluster-icon {
        background: rgba(25, 118, 210, 0.6);
        border-radius: 50%;
        text-align: center;
        font-weight: 600;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 3px solid rgba(255, 255, 255, 0.8);
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
    }
    
    .cluster-medium {
        background: rgba(25, 118, 210, 0.7);
        font-size: 14px;
    }
    
    .cluster-large {
        background: rgba(25, 118, 210, 0.8);
        font-size: 16px;
    }
    
    .custom-deal-marker {
        transition: all 0.2s ease;
    }
    
    .custom-deal-marker:hover {
        transform: scale(1.2);
        filter: drop-shadow(0 0 8px currentColor);
    }
`;
document.head.appendChild(style);
