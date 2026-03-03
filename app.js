// Journey Alliance Deals Map - Dual View Application

// Map initialization
let map, markers, drawnItems, currentBasemap;
let allMarkers = [];
let currentRegion = 'all';
let drawControl = null;
let currentView = 'property'; // 'property' or 'hq'
let currentSortColumn = 'gbv';
let currentSortDirection = 'desc';

// Get current dataset based on view
function getCurrentDeals() {
    return currentView === 'property' ? dualViewData.propertyView : dualViewData.hqView;
}

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
    
    // Create markers for initial view
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

// Create markers from current view data
function createMarkers() {
    allMarkers = [];
    const deals = getCurrentDeals();
    
    deals.forEach(deal => {
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
        
        // Enhanced popup based on view
        let popupContent = `
            <div class="popup-title">${deal.name}</div>
        `;
        
        // Show parent company in Property View
        if (currentView === 'property' && deal.companyName && deal.companyName !== deal.name) {
            popupContent += `<div class="popup-detail"><strong>Property:</strong> ${deal.companyName}</div>`;
        }
        
        popupContent += `
            <div class="popup-detail"><strong>Owner:</strong> ${deal.owner}</div>
            <div class="popup-detail"><strong>GBV:</strong> $${(deal.gbv / 1000000).toFixed(2)}M</div>
        `;
        
        if (currentView === 'hq' && deal.totalCompanies > 1) {
            popupContent += `<div class="popup-detail"><strong>Portfolio:</strong> ${deal.totalCompanies} properties, ${deal.totalProperties} total units</div>`;
        } else {
            popupContent += `<div class="popup-detail"><strong>Properties:</strong> ${deal.properties || 0} | <strong>Keys:</strong> ${deal.keys || 0}</div>`;
        }
        
        popupContent += `
            <div class="popup-detail"><strong>Location:</strong> ${deal.city}${deal.state ? ', ' + deal.state : ''}, ${deal.country}</div>
            <div class="popup-stage" style="background-color: ${deal.color};">${deal.stage}</div>
            <button class="view-details-btn" onclick="showDealContext('${deal.id}', '${deal.name.replace(/'/g, "\\'")}')">📋 View Details</button>
        `;
        
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'custom-popup'
        });
        
        marker.dealData = deal;
        allMarkers.push(marker);
    });
}

// Switch between views
function switchView(newView) {
    if (newView === currentView) return;
    
    currentView = newView;
    
    // Update button states
    document.querySelectorAll('.view-toggle-btn').forEach(btn => btn.classList.remove('active'));
    if (newView === 'property') {
        document.getElementById('propertyViewBtn').classList.add('active');
    } else {
        document.getElementById('hqViewBtn').classList.add('active');
    }
    
    // Clear existing markers
    markers.clearLayers();
    
    // Recreate markers from new view
    createMarkers();
    
    // Reapply filters
    applyFilters();
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
    let visibleDeals = [];
    
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
            deal.owner.toLowerCase().includes(searchTerm) ||
            (deal.companyName && deal.companyName.toLowerCase().includes(searchTerm));
        
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
            visibleProperties += deal.properties || deal.totalProperties || 0;
            visibleKeys += deal.keys || 0;
            visibleDeals.push(deal);
        }
    });
    
    // Update stats
    document.getElementById('statGBV').textContent = '$' + (visibleGBV / 1000000).toFixed(1) + 'M';
    document.getElementById('statCount').textContent = visibleCount;
    document.getElementById('statProperties').textContent = visibleProperties.toLocaleString();
    document.getElementById('statKeys').textContent = visibleKeys.toLocaleString();
    
    // Update subtitle
    const viewLabel = currentView === 'property' ? 'Property View' : 'HQ View';
    document.getElementById('subtitle').textContent = `${visibleCount} ${viewLabel} • $${(visibleGBV / 1000000).toFixed(1)}M GBV`;
    
    // Update deal list
    updateDealList(visibleDeals);
}

// Update deal list panel
function updateDealList(deals) {
    const sortedDeals = sortDeals(deals, `${currentSortColumn}-${currentSortDirection}`);
    
    const content = document.getElementById('dealListContent');
    
    if (sortedDeals.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div>No deals match your current filters</div>
            </div>
        `;
        return;
    }
    
    content.innerHTML = `
        <table class="deal-table">
            <thead>
                <tr>
                    <th class="sortable ${currentSortColumn === 'name' ? 'sorted-' + currentSortDirection : ''}" onclick="sortColumn('name')">Deal Name</th>
                    ${currentView === 'property' ? '<th>Company</th>' : ''}
                    <th class="sortable ${currentSortColumn === 'gbv' ? 'sorted-' + currentSortDirection : ''}" onclick="sortColumn('gbv')">GBV</th>
                    <th class="sortable ${currentSortColumn === 'stage' ? 'sorted-' + currentSortDirection : ''}" onclick="sortColumn('stage')">Stage</th>
                    <th class="sortable ${currentSortColumn === 'owner' ? 'sorted-' + currentSortDirection : ''}" onclick="sortColumn('owner')">Owner</th>
                    <th class="sortable ${currentSortColumn === 'properties' ? 'sorted-' + currentSortDirection : ''}" onclick="sortColumn('properties')">Props</th>
                    <th class="sortable ${currentSortColumn === 'keys' ? 'sorted-' + currentSortDirection : ''}" onclick="sortColumn('keys')">Keys</th>
                    <th class="sortable ${currentSortColumn === 'location' ? 'sorted-' + currentSortDirection : ''}" onclick="sortColumn('location')">Location</th>
                </tr>
            </thead>
            <tbody>
                ${sortedDeals.map(deal => `
                    <tr onclick="zoomToDeal('${deal.name.replace(/'/g, "\\'")}', '${deal.companyName ? deal.companyName.replace(/'/g, "\\'") : ''}')">
                        <td class="deal-name">${deal.name}</td>
                        ${currentView === 'property' ? `<td class="deal-company">${deal.companyName || ''}</td>` : ''}
                        <td class="deal-gbv">$${(deal.gbv / 1000000).toFixed(2)}M</td>
                        <td><span class="deal-stage-badge" style="background-color: ${deal.color};">${deal.stage}</span></td>
                        <td>${deal.owner}</td>
                        <td class="deal-metrics">${((currentView === 'hq' && deal.totalProperties) ? deal.totalProperties : (deal.properties || 0)).toLocaleString()}</td>
                        <td class="deal-metrics">${(deal.keys || 0).toLocaleString()}</td>
                        <td class="deal-location">${deal.city}${deal.state ? ', ' + deal.state : ''}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Sort column (exposed globally for onclick)
window.sortColumn = function(column) {
    if (currentSortColumn === column) {
        // Toggle direction
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New column, default to desc for numbers, asc for text
        currentSortColumn = column;
        currentSortDirection = ['gbv', 'properties', 'keys'].includes(column) ? 'desc' : 'asc';
    }
    
    // Re-apply filters to update display
    applyFilters();
}

// Sort deals
function sortDeals(deals, sortBy) {
    const sorted = [...deals];
    
    switch(sortBy) {
        case 'gbv-desc':
            return sorted.sort((a, b) => b.gbv - a.gbv);
        case 'gbv-asc':
            return sorted.sort((a, b) => a.gbv - b.gbv);
        case 'name-asc':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'name-desc':
            return sorted.sort((a, b) => b.name.localeCompare(a.name));
        case 'stage-asc':
            return sorted.sort((a, b) => a.stage.localeCompare(b.stage));
        case 'stage-desc':
            return sorted.sort((a, b) => b.stage.localeCompare(a.stage));
        case 'owner-asc':
            return sorted.sort((a, b) => a.owner.localeCompare(b.owner));
        case 'owner-desc':
            return sorted.sort((a, b) => b.owner.localeCompare(a.owner));
        case 'properties-desc':
            return sorted.sort((a, b) => {
                const propsA = (currentView === 'hq' && a.totalProperties) ? a.totalProperties : (a.properties || 0);
                const propsB = (currentView === 'hq' && b.totalProperties) ? b.totalProperties : (b.properties || 0);
                return propsB - propsA;
            });
        case 'properties-asc':
            return sorted.sort((a, b) => {
                const propsA = (currentView === 'hq' && a.totalProperties) ? a.totalProperties : (a.properties || 0);
                const propsB = (currentView === 'hq' && b.totalProperties) ? b.totalProperties : (b.properties || 0);
                return propsA - propsB;
            });
        case 'keys-desc':
            return sorted.sort((a, b) => (b.keys || 0) - (a.keys || 0));
        case 'keys-asc':
            return sorted.sort((a, b) => (a.keys || 0) - (b.keys || 0));
        case 'location-asc':
            return sorted.sort((a, b) => {
                const locA = `${a.city}, ${a.state || ''}, ${a.country}`;
                const locB = `${b.city}, ${b.state || ''}, ${b.country}`;
                return locA.localeCompare(locB);
            });
        case 'location-desc':
            return sorted.sort((a, b) => {
                const locA = `${a.city}, ${a.state || ''}, ${a.country}`;
                const locB = `${b.city}, ${b.state || ''}, ${b.country}`;
                return locB.localeCompare(locA);
            });
        default:
            return sorted;
    }
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

// Zoom to deal on map (exposed globally for onclick)
window.zoomToDeal = function(dealName, companyName) {
    let marker;
    if (companyName) {
        marker = allMarkers.find(m => m.dealData.name === dealName && m.dealData.companyName === companyName);
    } else {
        marker = allMarkers.find(m => m.dealData.name === dealName);
    }
    
    if (marker) {
        map.setView(marker.getLatLng(), 12);
        marker.openPopup();
        // Close deal list
        document.getElementById('dealListPanel').classList.remove('open');
    }
}

// Toggle unmapped deals section
function toggleUnmappedSection() {
    const content = document.getElementById('unmapped-content');
    const toggle = document.getElementById('unmapped-toggle');
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        toggle.classList.remove('collapsed');
        toggle.textContent = '▼';
    } else {
        content.classList.add('collapsed');
        toggle.classList.add('collapsed');
        toggle.textContent = '▶';
    }
}

// Export to CSV
function exportToCSV() {
    const selectedStages = Array.from(document.querySelectorAll('.stage-filter:checked')).map(cb => cb.value);
    const selectedOwner = document.getElementById('ownerFilter').value;
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();
    
    // Get visible deals (same logic as applyFilters)
    const visibleDeals = allMarkers
        .map(m => m.dealData)
        .filter(deal => {
            const matchesStage = selectedStages.includes(deal.stage);
            const matchesOwner = selectedOwner === 'all' || deal.owner === selectedOwner;
            const matchesSearch = searchTerm === '' || 
                deal.name.toLowerCase().includes(searchTerm) ||
                deal.city.toLowerCase().includes(searchTerm) ||
                deal.owner.toLowerCase().includes(searchTerm) ||
                (deal.companyName && deal.companyName.toLowerCase().includes(searchTerm));
            
            let matchesRegion = true;
            if (currentRegion !== 'all') {
                matchesRegion = isInRegion(deal, currentRegion);
            }
            
            let matchesDrawn = true;
            if (drawnItems.getLayers().length > 0) {
                const drawnLayer = drawnItems.getLayers()[0];
                const latlng = L.latLng(deal.lat, deal.lng);
                matchesDrawn = drawnLayer.getBounds ? 
                    drawnLayer.getBounds().contains(latlng) : 
                    (drawnLayer.getLatLng().distanceTo(latlng) <= drawnLayer.getRadius());
            }
            
            return matchesStage && matchesOwner && matchesSearch && matchesRegion && matchesDrawn;
        });
    
    // Sort using current sort state
    const sortedDeals = sortDeals(visibleDeals, `${currentSortColumn}-${currentSortDirection}`);
    
    // Create CSV
    const headers = currentView === 'property' 
        ? ['Deal Name', 'Company', 'Owner', 'Stage', 'GBV (USD)', 'Properties', 'Keys', 'City', 'State', 'Country', 'Latitude', 'Longitude']
        : ['Deal Name', 'Owner', 'Stage', 'GBV (USD)', 'Total Properties', 'Keys', 'City', 'State', 'Country', 'Latitude', 'Longitude'];
    
    const rows = sortedDeals.map(deal => {
        if (currentView === 'property') {
            return [
                deal.name,
                deal.companyName || '',
                deal.owner,
                deal.stage,
                deal.gbv,
                deal.properties || 0,
                deal.keys || 0,
                deal.city,
                deal.state || '',
                deal.country,
                deal.lat,
                deal.lng
            ];
        } else {
            return [
                deal.name,
                deal.owner,
                deal.stage,
                deal.gbv,
                deal.totalProperties || 0,
                deal.keys || 0,
                deal.city,
                deal.state || '',
                deal.country,
                deal.lat,
                deal.lng
            ];
        }
    });
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journey-deals-${currentView}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // View toggle buttons
    document.getElementById('propertyViewBtn').addEventListener('click', function() {
        switchView('property');
    });
    
    document.getElementById('hqViewBtn').addEventListener('click', function() {
        switchView('hq');
    });
    
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
            const region = this.dataset.region;
            const wasActive = this.classList.contains('active');
            
            // If clicking an already active button (and it's not "all"), reset to "all"
            if (wasActive && region !== 'all') {
                document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.region-btn[data-region="all"]').classList.add('active');
                currentRegion = 'all';
                map.setView([30, 0], 2);
            } else {
                // Normal behavior - activate clicked button
                document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentRegion = region;
                
                if (region === 'all') {
                    map.setView([30, 0], 2);
                } else {
                    map.fitBounds(regions[region].bounds);
                }
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
    
    // Deal list toggle
    document.getElementById('dealListToggle').addEventListener('click', function() {
        document.getElementById('dealListPanel').classList.add('open');
    });
    
    // Close deal list
    document.getElementById('closeDealList').addEventListener('click', function() {
        document.getElementById('dealListPanel').classList.remove('open');
    });
    
    // Export CSV
    document.getElementById('exportCSV').addEventListener('click', function() {
        exportToCSV();
    });
    
    // Initialize unmapped section as collapsed
    const unmappedContent = document.getElementById('unmapped-content');
    const unmappedToggle = document.getElementById('unmapped-toggle');
    if (unmappedContent && unmappedToggle) {
        unmappedContent.classList.add('collapsed');
        unmappedToggle.classList.add('collapsed');
        unmappedToggle.textContent = '▶';
    }
});

// Show deal context modal
window.showDealContext = async function(dealId, dealName) {
    const modal = document.getElementById('dealContextModal');
    const modalTitle = document.getElementById('modalDealName');
    const modalBody = document.getElementById('modalBody');
    
    // Show modal with loading state
    modalTitle.textContent = dealName;
    modalBody.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Fetching deal context from HubSpot...</p>
        </div>
    `;
    modal.classList.add('open');
    
    try {
        // Call backend API to fetch deal context
        const apiUrl = `https://journey-map-enhanced.vercel.app/api/deal-context/${dealId}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Render the context
        renderDealContext(data, modalBody);
        
    } catch(error) {
        console.error('Error fetching deal context:', error);
        modalBody.innerHTML = `
            <div class="context-section">
                <h3>⚠️ Unable to Load Deal Context</h3>
                <p style="color: var(--text-secondary); font-size: 14px; line-height: 1.6;">
                    The backend API is not yet deployed. To enable this feature:
                    <br><br>
                    <strong>Option 1: Deploy the API</strong><br>
                    Deploy the backend API from <code>api/</code> folder to Vercel/Netlify<br>
                    Update the API URL in app.js<br><br>
                    <strong>Option 2: Use OpenClaw</strong><br>
                    Ask Atlas: "Show me context for deal ${dealId}"<br><br>
                    <strong>Deal ID:</strong> ${dealId}
                </p>
            </div>
        `;
    }
}

// Close deal context modal
window.closeDealContext = function() {
    document.getElementById('dealContextModal').classList.remove('open');
}

// Render deal context in modal
function renderDealContext(data, container) {
    let html = '';
    
    // AI Summary at top
    if (data.summary) {
        html += `
            <div class="ai-summary">
                <div class="ai-summary-header">
                    🤖 AI Summary
                </div>
                <div>${data.summary}</div>
            </div>
        `;
    }
    
    // Deal Details
    if (data.deal) {
        html += `
            <div class="context-section">
                <h3>📋 Deal Information</h3>
                <div style="font-size: 14px; line-height: 1.8;">
                    ${data.deal.description ? `<p><strong>Description:</strong> ${data.deal.description}</p>` : ''}
                    ${data.deal.nextStep ? `<p><strong>Next Step:</strong> ${data.deal.nextStep}</p>` : ''}
                    ${data.deal.lastModified ? `<p><strong>Last Modified:</strong> ${new Date(data.deal.lastModified).toLocaleDateString()}</p>` : ''}
                </div>
            </div>
        `;
    }
    
    // Recent Activity Timeline
    if (data.timeline && data.timeline.length > 0) {
        html += `
            <div class="context-section">
                <h3>📅 Recent Activity</h3>
        `;
        
        data.timeline.forEach((item, index) => {
            const isRecent = index < 3;
            html += `
                <div class="timeline-item ${isRecent ? 'recent' : ''}">
                    <div class="timeline-header">
                        <span class="timeline-type">${item.type}</span>
                        <span class="timeline-date">${new Date(item.date).toLocaleDateString()}</span>
                    </div>
                    <div class="timeline-content">${item.content}</div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    // Notes
    if (data.notes && data.notes.length > 0) {
        html += `
            <div class="context-section">
                <h3>📝 Notes</h3>
        `;
        
        data.notes.slice(0, 5).forEach(note => {
            html += `
                <div class="timeline-item">
                    <div class="timeline-header">
                        <span class="timeline-type">Note</span>
                        <span class="timeline-date">${new Date(note.date).toLocaleDateString()}</span>
                    </div>
                    <div class="timeline-content">${note.content}</div>
                </div>
            `;
        });
        
        html += `</div>`;
    }
    
    container.innerHTML = html;
}

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
    
    /* Fix hover jitter by using box-shadow instead of transform */
    .leaflet-interactive:hover {
        filter: brightness(1.2);
        box-shadow: 0 0 12px 3px currentColor !important;
        transition: filter 0.2s ease, box-shadow 0.2s ease;
    }
    
    .deal-company {
        font-size: 12px;
        color: var(--text-secondary);
    }
`;
document.head.appendChild(style);
