// Journey Deals Map - Main Application
// Pure JavaScript implementation

(function() {
    'use strict';

    // State
    let map = null;
    let markerClusterGroup = null;
    let currentView = 'property'; // 'property' or 'hq'
    let filteredDeals = [];
    let allMarkers = [];

    // Initialize on page load
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        initMap();
        setupEventListeners();
        loadData();
    }

    function initMap() {
        // Initialize Leaflet map
        map = L.map('map', {
            center: [39.8283, -98.5795], // Center of USA
            zoom: 4,
            zoomControl: true
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(map);

        // Initialize marker cluster group
        markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true
        });

        map.addLayer(markerClusterGroup);
    }

    function setupEventListeners() {
        // View toggle
        document.getElementById('view-property').addEventListener('click', () => switchView('property'));
        document.getElementById('view-hq').addEventListener('click', () => switchView('hq'));

        // Filters
        document.querySelectorAll('.stage-filter').forEach(checkbox => {
            checkbox.addEventListener('change', applyFilters);
        });

        document.getElementById('owner-filter').addEventListener('change', applyFilters);
        document.getElementById('search-filter').addEventListener('input', applyFilters);
        document.getElementById('reset-filters').addEventListener('click', resetFilters);

        // Toggle panel
        document.getElementById('toggle-panel').addEventListener('click', togglePanel);

        // Modal
        document.getElementById('show-unmapped').addEventListener('click', (e) => {
            e.preventDefault();
            showUnmappedModal();
        });

        document.getElementById('close-modal').addEventListener('click', closeModal);
        document.getElementById('unmapped-modal').addEventListener('click', (e) => {
            if (e.target.id === 'unmapped-modal') closeModal();
        });

        document.getElementById('export-csv').addEventListener('click', exportUnmappedCSV);
    }

    function loadData() {
        // Data is loaded from external JS files (dualViewData, allDeals)
        if (typeof dualViewData === 'undefined') {
            console.error('dualViewData not loaded');
            return;
        }

        // Initial load
        applyFilters();
    }

    function switchView(view) {
        currentView = view;

        // Update button states
        document.getElementById('view-property').classList.toggle('active', view === 'property');
        document.getElementById('view-hq').classList.toggle('active', view === 'hq');

        // Reload data
        applyFilters();
    }

    function applyFilters() {
        // Get filter values
        const selectedStages = Array.from(document.querySelectorAll('.stage-filter:checked'))
            .map(cb => cb.value);
        
        const selectedOwner = document.getElementById('owner-filter').value;
        const searchQuery = document.getElementById('search-filter').value.toLowerCase();

        // Get data for current view
        const viewData = currentView === 'property' 
            ? dualViewData.propertyView 
            : dualViewData.hqView;

        // Filter deals
        filteredDeals = viewData.filter(deal => {
            // Stage filter
            if (!selectedStages.includes(deal.stage)) return false;

            // Owner filter
            if (selectedOwner !== 'all' && deal.owner !== selectedOwner) return false;

            // Search filter
            if (searchQuery) {
                const searchText = `${deal.name} ${deal.companyName} ${deal.city} ${deal.state}`.toLowerCase();
                if (!searchText.includes(searchQuery)) return false;
            }

            return true;
        });

        // Update map
        updateMap();

        // Update stats
        updateStats();
    }

    function updateMap() {
        // Clear existing markers
        markerClusterGroup.clearLayers();
        allMarkers = [];

        // Add filtered markers
        filteredDeals.forEach(deal => {
            const marker = createMarker(deal);
            allMarkers.push(marker);
            markerClusterGroup.addLayer(marker);
        });

        // Fit bounds if markers exist
        if (allMarkers.length > 0) {
            const bounds = markerClusterGroup.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }

    function createMarker(deal) {
        // Create custom icon based on stage
        const iconClass = getMarkerClass(deal.stage);
        const icon = L.divIcon({
            className: iconClass,
            iconSize: [16, 16]
        });

        // Create marker
        const marker = L.marker([deal.lat, deal.lng], { icon });

        // Create popup content
        const popupContent = createPopupContent(deal);
        marker.bindPopup(popupContent);

        return marker;
    }

    function getMarkerClass(stage) {
        if (stage === 'Closed Won') return 'marker-won';
        if (stage === 'Closed Lost') return 'marker-lost';
        return 'marker-pipeline';
    }

    function createPopupContent(deal) {
        const gbvFormatted = formatCurrency(deal.gbv);
        const location = `${deal.city}, ${deal.state}`;
        
        return `
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${deal.name}</h3>
                <div style="font-size: 13px; color: #666; line-height: 1.6;">
                    <div><strong>Owner:</strong> ${deal.owner}</div>
                    <div><strong>GBV:</strong> ${gbvFormatted}</div>
                    <div><strong>Stage:</strong> ${deal.stage}</div>
                    <div><strong>Location:</strong> ${location}</div>
                    ${currentView === 'property' ? 
                        `<div><strong>Properties:</strong> ${deal.properties || 0} | <strong>Keys:</strong> ${deal.keys || 0}</div>` 
                        : ''}
                </div>
            </div>
        `;
    }

    function updateStats() {
        // Calculate total GBV for visible deals
        const totalGBV = filteredDeals.reduce((sum, deal) => sum + (deal.gbv || 0), 0);

        // Update mini stats in filter panel
        document.getElementById('visible-count').textContent = filteredDeals.length;
        document.getElementById('visible-gbv').textContent = formatCurrency(totalGBV);
    }

    function resetFilters() {
        // Check all stage filters
        document.querySelectorAll('.stage-filter').forEach(cb => cb.checked = true);

        // Reset owner dropdown
        document.getElementById('owner-filter').value = 'all';

        // Clear search
        document.getElementById('search-filter').value = '';

        // Reapply
        applyFilters();
    }

    function togglePanel() {
        const panel = document.getElementById('filter-panel');
        const button = document.getElementById('toggle-panel');
        
        panel.classList.toggle('collapsed');
        button.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
    }

    function showUnmappedModal() {
        // Get unmapped deals
        const unmappedDeals = typeof allDeals !== 'undefined' 
            ? allDeals.filter(deal => !deal.lat || !deal.lng)
            : [];

        // Populate table
        const tbody = document.getElementById('unmapped-table-body');
        tbody.innerHTML = '';

        unmappedDeals.forEach(deal => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${deal.name}</td>
                <td>${deal.owner || 'Unattributed'}</td>
                <td>${deal.stage}</td>
                <td>${formatCurrency(deal.gbv || 0)}</td>
            `;
            tbody.appendChild(row);
        });

        // Show modal
        document.getElementById('unmapped-modal').classList.add('show');
    }

    function closeModal() {
        document.getElementById('unmapped-modal').classList.remove('show');
    }

    function exportUnmappedCSV() {
        const unmappedDeals = typeof allDeals !== 'undefined' 
            ? allDeals.filter(deal => !deal.lat || !deal.lng)
            : [];

        // Create CSV content
        const headers = ['Deal Name', 'Owner', 'Stage', 'GBV', 'Company'];
        const rows = unmappedDeals.map(deal => [
            deal.name,
            deal.owner || 'Unattributed',
            deal.stage,
            deal.gbv || 0,
            deal.companyName || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'unmapped-deals.csv';
        link.click();
        URL.revokeObjectURL(url);
    }

    function formatCurrency(value) {
        if (value >= 1000000) {
            return '$' + (value / 1000000).toFixed(1) + 'M';
        }
        if (value >= 1000) {
            return '$' + (value / 1000).toFixed(0) + 'K';
        }
        return '$' + value.toFixed(0);
    }
})();
