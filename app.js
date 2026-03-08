// Journey Deals Map V3 - Main Application
// 2026 SaaS Standards: Glassmorphism, Dark Mode, Marker Scaling, localStorage
// Data source abstraction (API-ready per Tom's guidance)

(function() {
    'use strict';

    // ============================================
    // STATE MANAGEMENT (Tom's guidance: centralized)
    // ============================================
    const AppState = {
        currentView: 'property', // 'property' or 'hq'
        darkMode: false,
        filters: {
            stages: ['Closed Won', 'Evaluation Accepted', 'Discovery & Stakeholders', 'Contracting', 'Solution & Business Alignment', 'Decision & Approval'],
            owner: 'all',
            search: ''
        },
        map: null,
        markerClusterGroup: null,
        filteredDeals: [],
        allMarkers: [],
        rawData: null, // Data source abstraction
        panelSwipeStartY: null,
        panelSwipeDeltaY: 0,
        modalSwipeStartY: null,
        modalSwipeDeltaY: 0
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        loadSavedPreferences();
        initDarkMode();
        initMap();
        initVisualStates();
        setupEventListeners();
        setupMobileInteractions();
        loadData();
    }

    // ============================================
    // DARK MODE (localStorage persistence)
    // ============================================
    function loadSavedPreferences() {
        // Load dark mode preference
        const savedTheme = localStorage.getItem('theme');
        AppState.darkMode = savedTheme === 'dark';
        
        // Load view preference
        const savedView = localStorage.getItem('view');
        if (savedView) AppState.currentView = savedView;
        
        // Load filter preferences
        const savedFilters = localStorage.getItem('filters');
        if (savedFilters) {
            try {
                AppState.filters = JSON.parse(savedFilters);
            } catch (e) {
                console.warn('Failed to parse saved filters:', e);
            }
        }
    }

    function initDarkMode() {
        const toggle = document.getElementById('dark-mode-toggle');
        
        // Apply saved preference
        if (AppState.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            toggle.checked = true;
        }
        
        // Listen for changes
        toggle.addEventListener('change', toggleDarkMode);
    }

    function toggleDarkMode() {
        AppState.darkMode = !AppState.darkMode;
        
        if (AppState.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
    }

    // ============================================
    // MAP INITIALIZATION
    // ============================================
    function initMap() {
        AppState.map = L.map('map', {
            center: [39.8283, -98.5795], // Center of USA
            zoom: 4,
            zoomControl: true,
            attributionControl: true
        });

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(AppState.map);

        // Initialize marker cluster group (Tom's guidance: Leaflet.markercluster, density-based)
        AppState.markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            chunkedLoading: true // Performance optimization
        });

        AppState.map.addLayer(AppState.markerClusterGroup);
    }

    function initVisualStates() {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

        if (!document.getElementById('map-loading')) {
            const loading = document.createElement('div');
            loading.id = 'map-loading';
            loading.className = 'map-loading';
            loading.innerHTML = '<span class="loading-dot" aria-hidden="true"></span><span>Loading deals</span>';
            mapContainer.appendChild(loading);
        }

        if (!document.getElementById('map-empty-state')) {
            const emptyState = document.createElement('div');
            emptyState.id = 'map-empty-state';
            emptyState.className = 'map-empty-state hidden';
            emptyState.innerHTML = `
                <h3>No deals match these filters</h3>
                <p>Try broadening stage, owner, or search criteria to see results on the map.</p>
            `;
            mapContainer.appendChild(emptyState);
        }
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function setupEventListeners() {
        // View toggle
        document.getElementById('view-property').addEventListener('click', () => switchView('property'));
        document.getElementById('view-hq').addEventListener('click', () => switchView('hq'));

        // Stage filters
        document.querySelectorAll('#stage-filters input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', applyFilters);
        });

        // Owner filter
        document.getElementById('owner-select').addEventListener('change', applyFilters);

        // Search filter (debounced 300ms per Tom)
        let searchTimeout;
        document.getElementById('search-input').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                AppState.filters.search = e.target.value;
                applyFilters();
            }, 300);
        });

        // Reset filters button (Tom's guidance: include reset)
        document.getElementById('reset-filters').addEventListener('click', resetFilters);

        // Toggle filter panel (mobile)
        document.getElementById('toggle-filters').addEventListener('click', toggleFilterPanel);

        // Unmapped deals link
        document.getElementById('unmapped-link').addEventListener('click', showUnmappedModal);

        // Modal tabs
        document.querySelectorAll('.modal-tab').forEach(tab => {
            tab.addEventListener('click', (e) => switchModalTab(e.target.dataset.tab));
        });

        // Modal close
        document.getElementById('modal-close').addEventListener('click', closeModal);
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') closeModal();
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModal();
                closeFilterPanel();
            }
        });
    }

    function setupMobileInteractions() {
        const backdrop = document.getElementById('mobile-panel-backdrop');
        const panel = document.getElementById('filter-panel');
        const modalOverlay = document.getElementById('modal-overlay');
        const unmappedOverlay = document.getElementById('unmapped-modal');

        if (backdrop) {
            backdrop.addEventListener('click', closeFilterPanel);
        }

        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('orientationchange', handleViewportChange);
        handleViewportChange();

        if (panel) {
            panel.addEventListener('touchstart', (e) => {
                if (!isMobileViewport()) return;
                AppState.panelSwipeStartY = e.touches[0].clientY;
                AppState.panelSwipeDeltaY = 0;
            }, { passive: true });

            panel.addEventListener('touchmove', (e) => {
                if (!isMobileViewport() || AppState.panelSwipeStartY == null) return;
                AppState.panelSwipeDeltaY = e.touches[0].clientY - AppState.panelSwipeStartY;
            }, { passive: true });

            panel.addEventListener('touchend', () => {
                if (!isMobileViewport()) return;
                if (AppState.panelSwipeDeltaY > 90) closeFilterPanel();
                AppState.panelSwipeStartY = null;
                AppState.panelSwipeDeltaY = 0;
            }, { passive: true });
        }

        [modalOverlay, unmappedOverlay].forEach((overlay) => {
            if (!overlay) return;
            const content = overlay.querySelector('.modal-content');
            if (!content) return;

            content.addEventListener('touchstart', (e) => {
                if (!isMobileViewport()) return;
                if (content.scrollTop > 0) return;
                AppState.modalSwipeStartY = e.touches[0].clientY;
                AppState.modalSwipeDeltaY = 0;
            }, { passive: true });

            content.addEventListener('touchmove', (e) => {
                if (!isMobileViewport() || AppState.modalSwipeStartY == null) return;
                if (content.scrollTop > 0) return;
                AppState.modalSwipeDeltaY = e.touches[0].clientY - AppState.modalSwipeStartY;
            }, { passive: true });

            content.addEventListener('touchend', () => {
                if (!isMobileViewport()) return;
                if (AppState.modalSwipeDeltaY > 90) closeModal();
                AppState.modalSwipeStartY = null;
                AppState.modalSwipeDeltaY = 0;
            }, { passive: true });
        });
    }

    // ============================================
    // DATA LOADING (Tom's guidance: data source abstraction)
    // ============================================
    function loadData() {
        // Data source abstraction: Currently static JS file, but designed for easy API swap
        // To switch to API: replace this function with fetch() call to backend endpoint
        // All downstream code works the same (consumes AppState.rawData)
        
        if (typeof dualViewData === 'undefined') {
            console.error('Data not loaded. Ensure deals-data.js is included.');
            setMapLoading(false);
            return;
        }
        
        AppState.rawData = dualViewData;
        
        // Populate owner dropdown
        populateOwnerDropdown();
        
        // Apply saved filter state
        restoreFilterState();
        
        // Initial render
        applyFilters();
        setMapLoading(false);
    }

    function populateOwnerDropdown() {
        const ownerSelect = document.getElementById('owner-select');
        const allDeals = [...AppState.rawData.propertyView, ...AppState.rawData.hqView];
        
        // Get unique owners
        const owners = [...new Set(allDeals.map(d => d.owner))].filter(Boolean).sort();
        
        // Clear existing options (except "All Owners")
        ownerSelect.innerHTML = '<option value="all">All Owners</option>';
        
        // Add owner options
        owners.forEach(owner => {
            const option = document.createElement('option');
            option.value = owner;
            option.textContent = owner;
            ownerSelect.appendChild(option);
        });
    }

    function restoreFilterState() {
        // Restore stage checkboxes
        document.querySelectorAll('#stage-filters input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = AppState.filters.stages.includes(checkbox.value);
        });
        
        // Restore owner select
        document.getElementById('owner-select').value = AppState.filters.owner;
        
        // Restore search
        document.getElementById('search-input').value = AppState.filters.search;
        
        // Restore view buttons
        document.getElementById('view-property').classList.toggle('active', AppState.currentView === 'property');
        document.getElementById('view-hq').classList.toggle('active', AppState.currentView === 'hq');
    }

    // ============================================
    // VIEW SWITCHING
    // ============================================
    function switchView(view) {
        AppState.currentView = view;
        localStorage.setItem('view', view);
        
        // Update button states
        document.getElementById('view-property').classList.toggle('active', view === 'property');
        document.getElementById('view-hq').classList.toggle('active', view === 'hq');
        
        applyFilters();
    }

    // ============================================
    // FILTERING
    // ============================================
    function applyFilters() {
        // Update filter state from UI
        AppState.filters.stages = Array.from(
            document.querySelectorAll('#stage-filters input[type="checkbox"]:checked')
        ).map(cb => cb.value);
        
        AppState.filters.owner = document.getElementById('owner-select').value;
        // search is updated via debounced event listener
        
        // Save to localStorage (Tom's guidance: persist filters)
        localStorage.setItem('filters', JSON.stringify(AppState.filters));
        
        // Get data for current view
        const viewData = AppState.currentView === 'property' 
            ? AppState.rawData.propertyView 
            : AppState.rawData.hqView;
        
        // Apply filters
        AppState.filteredDeals = viewData.filter(deal => {
            // Stage filter
            if (!AppState.filters.stages.includes(deal.stage)) return false;
            
            // Owner filter
            if (AppState.filters.owner !== 'all' && deal.owner !== AppState.filters.owner) return false;
            
            // Search filter
            if (AppState.filters.search) {
                const searchText = `${deal.name} ${deal.companyName || ''} ${deal.city || ''} ${deal.state || ''}`.toLowerCase();
                if (!searchText.includes(AppState.filters.search.toLowerCase())) return false;
            }
            
            return true;
        });
        
        updateMap();
        updateStats();
    }

    function resetFilters() {
        // Reset to defaults
        AppState.filters = {
            stages: ['Closed Won', 'Evaluation Accepted', 'Discovery & Stakeholders', 'Contracting', 'Solution & Business Alignment', 'Decision & Approval'],
            owner: 'all',
            search: ''
        };
        
        // Clear localStorage
        localStorage.removeItem('filters');
        
        // Update UI
        restoreFilterState();
        
        // Reapply
        applyFilters();
    }

    function toggleFilterPanel() {
        const panel = document.getElementById('filter-panel');
        const toggleButton = document.getElementById('toggle-filters');
        if (!panel) return;

        const willOpen = !panel.classList.contains('open');
        panel.classList.toggle('open', willOpen);
        document.body.classList.toggle('mobile-panel-open', willOpen && isMobileViewport());
        if (toggleButton) toggleButton.setAttribute('aria-expanded', String(willOpen));

        const backdrop = document.getElementById('mobile-panel-backdrop');
        if (backdrop) {
            backdrop.classList.toggle('hidden', !willOpen || !isMobileViewport());
        }

        queueMapResize();
    }

    function closeFilterPanel() {
        const panel = document.getElementById('filter-panel');
        const toggleButton = document.getElementById('toggle-filters');
        if (!panel) return;
        panel.classList.remove('open');
        document.body.classList.remove('mobile-panel-open');
        if (toggleButton) toggleButton.setAttribute('aria-expanded', 'false');

        const backdrop = document.getElementById('mobile-panel-backdrop');
        if (backdrop) backdrop.classList.add('hidden');
        queueMapResize();
    }

    // ============================================
    // MAP RENDERING
    // ============================================
    function updateMap() {
        // Clear existing markers
        AppState.markerClusterGroup.clearLayers();
        AppState.allMarkers = [];
        
        // Add filtered markers
        AppState.filteredDeals.forEach(deal => {
            const lat = deal.lat != null ? deal.lat : deal.latitude;
            const lng = deal.lng != null ? deal.lng : deal.longitude;
            if (lat != null && lng != null) {
                const marker = createMarker(deal);
                AppState.allMarkers.push(marker);
                AppState.markerClusterGroup.addLayer(marker);
            }
        });
        
        // Fit bounds if markers exist
        if (AppState.allMarkers.length > 0) {
            const bounds = AppState.markerClusterGroup.getBounds();
            AppState.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        }

        toggleEmptyState();
    }

    function setMapLoading(isLoading) {
        const loading = document.getElementById('map-loading');
        if (loading) {
            loading.classList.toggle('hidden', !isLoading);
        }
    }

    function toggleEmptyState() {
        const emptyState = document.getElementById('map-empty-state');
        if (!emptyState) return;

        emptyState.classList.toggle('hidden', AppState.filteredDeals.length > 0);
    }

    // ============================================
    // MARKER CREATION (Scaled by GBV + Pulse Animation)
    // ============================================
    function createMarker(deal) {
        const gbv = deal.gbv || 0;
        
        // Marker size scaling by GBV (V3 feature)
        let markerSize, iconSize, className;
        
        if (gbv < 1000000) {
            // Small: < $1M
            markerSize = 12;
            iconSize = [20, 20];
            className = 'marker-small';
        } else if (gbv < 10000000) {
            // Medium: $1M - $10M
            markerSize = 16;
            iconSize = [24, 24];
            className = 'marker-medium';
        } else if (gbv < 50000000) {
            // Large: $10M - $50M
            markerSize = 24;
            iconSize = [32, 32];
            className = 'marker-large';
        } else {
            // Mega: > $50M (with pulse animation)
            markerSize = 32;
            iconSize = [40, 40];
            className = 'marker-mega marker-pulse';
        }
        
        // Stage color
        const stageColors = {
            'Closed Won': '#00C853',
            'Evaluation Accepted': '#2962FF',
            'Discovery & Stakeholders': '#2962FF',
            'Contracting': '#FFD600',
            'Solution & Business Alignment': '#2962FF',
            'Decision & Approval': '#FFD600',
            'Closed Lost': '#D50000'
        };
        
        const color = stageColors[deal.stage] || '#64748B';
        
        // Custom marker icon
        const icon = L.divIcon({
            className: `custom-marker ${className}`,
            html: `<div style="
                width: ${markerSize}px;
                height: ${markerSize}px;
                background: ${color};
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: iconSize,
            iconAnchor: [markerSize / 2, markerSize / 2]
        });
        
        // Create marker
        const marker = L.marker([deal.lat || deal.latitude, deal.lng || deal.longitude], { icon });
        
        // Popup
        const popupContent = createPopupContent(deal);
        marker.bindPopup(popupContent, {
            maxWidth: 300,
            className: 'deal-popup'
        });
        
        // Click to open enhanced modal
        marker.on('click', () => openDealModal(deal));
        
        return marker;
    }

    function createPopupContent(deal) {
        const gbvFormatted = formatCurrency(deal.gbv || 0);
        
        return `
            <div style="padding: 4px;">
                <strong style="font-size: 14px;">${deal.name}</strong><br>
                <span style="color: #64748B; font-size: 12px;">${deal.stage}</span><br>
                <span style="font-weight: 600; font-size: 14px;">${gbvFormatted}</span><br>
                <span style="font-size: 12px;">${deal.owner || 'Unassigned'}</span><br>
                <span style="font-size: 11px; color: #94A3B8;">${deal.city || ''}, ${deal.state || ''}</span>
            </div>
        `;
    }

    // ============================================
    // ENHANCED MODAL (Full-Screen with Tabs)
    // ============================================
    function openDealModal(deal) {
        const modal = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const contentEl = document.getElementById('modal-body-content');
        
        // Set title
        titleEl.textContent = deal.name;
        
        // Set overview content
        const gbvFormatted = formatCurrency(deal.gbv || 0);
        const propertiesCount = deal.propertyCount || 1;
        const keysCount = deal.keyCount || 0;
        
        contentEl.innerHTML = `
            <div class="modal-overview-grid">
                <div class="modal-overview-card">
                    <div class="modal-overview-key">Company</div>
                    <div class="modal-overview-value">${deal.companyName || deal.name}</div>
                </div>
                
                <div class="modal-overview-card">
                    <div class="modal-overview-key">GBV</div>
                    <div class="modal-overview-value metric">${gbvFormatted}</div>
                </div>
                
                <div class="modal-overview-split">
                    <div class="modal-overview-card">
                        <div class="modal-overview-key">Stage</div>
                        <div class="modal-overview-value">${deal.stage}</div>
                    </div>
                    <div class="modal-overview-card">
                        <div class="modal-overview-key">Owner</div>
                        <div class="modal-overview-value">${deal.owner || 'Unassigned'}</div>
                    </div>
                </div>
                
                <div class="modal-overview-split">
                    <div class="modal-overview-card">
                        <div class="modal-overview-key">Properties</div>
                        <div class="modal-overview-value">${propertiesCount}</div>
                    </div>
                    <div class="modal-overview-card">
                        <div class="modal-overview-key">Total Keys</div>
                        <div class="modal-overview-value">${keysCount.toLocaleString()}</div>
                    </div>
                </div>
                
                <div class="modal-overview-card">
                    <div class="modal-overview-key">Location</div>
                    <div class="modal-overview-value">${deal.city || ''}, ${deal.state || ''}</div>
                </div>
            </div>
        `;
        
        // Show modal
        modal.classList.remove('hidden');
        
        // Reset to overview tab
        switchModalTab('overview');
    }

    function switchModalTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.modal-tab').forEach(tab => {
            const isActive = tab.dataset.tab === tabName;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive);
        });
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });
    }

    function closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('unmapped-modal').classList.add('hidden');
    }

    function handleViewportChange() {
        if (!isMobileViewport()) {
            closeFilterPanel();
        }
        queueMapResize();
    }

    function queueMapResize() {
        if (!AppState.map) return;
        requestAnimationFrame(() => {
            AppState.map.invalidateSize();
        });
    }

    function isMobileViewport() {
        return window.matchMedia('(max-width: 768px)').matches;
    }

    // ============================================
    // STATS CALCULATION
    // ============================================
    function updateStats() {
        const allData = AppState.currentView === 'property' 
            ? AppState.rawData.propertyView 
            : AppState.rawData.hqView;
        
        // Closed Won
        const closedWon = allData
            .filter(d => d.stage === 'Closed Won')
            .reduce((sum, d) => sum + (d.gbv || 0), 0);
        
        // Active Pipeline (non-closed stages)
        const pipeline = allData
            .filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
            .reduce((sum, d) => sum + (d.gbv || 0), 0);
        
        // Total GBV
        const total = allData.reduce((sum, d) => sum + (d.gbv || 0), 0);
        
        // Win Rate
        const wonDeals = allData.filter(d => d.stage === 'Closed Won').length;
        const lostDeals = allData.filter(d => d.stage === 'Closed Lost').length;
        const totalClosed = wonDeals + lostDeals;
        const winRate = totalClosed > 0 ? ((wonDeals / totalClosed) * 100).toFixed(1) : 0;
        
        // Unmapped
        const unmapped = allData.filter(d => (!d.lat && !d.latitude) || (!d.lng && !d.longitude)).length;
        
        // Update DOM
        document.getElementById('stat-closed-won').textContent = formatCurrency(closedWon);
        document.getElementById('stat-pipeline').textContent = formatCurrency(pipeline);
        document.getElementById('stat-total').textContent = formatCurrency(total);
        document.getElementById('stat-win-rate').textContent = `${winRate}%`;
        document.getElementById('stat-unmapped').textContent = unmapped;
    }

    // ============================================
    // UNMAPPED DEALS MODAL
    // ============================================
    function showUnmappedModal() {
        const allData = AppState.currentView === 'property' 
            ? AppState.rawData.propertyView 
            : AppState.rawData.hqView;
        
        const unmapped = allData.filter(d => (!d.lat && !d.latitude) || (!d.lng && !d.longitude));
        
        const listEl = document.getElementById('unmapped-list');
        listEl.innerHTML = unmapped.length === 0 
            ? '<p class="text-muted">All deals have valid coordinates! 🎉</p>'
            : unmapped.map(d => `
                <div style="padding: 8px; border-bottom: 1px solid var(--border-color);">
                    <strong>${d.name}</strong><br>
                    <span style="font-size: 12px; color: var(--text-secondary);">${d.owner || 'Unassigned'} • ${formatCurrency(d.gbv || 0)}</span>
                </div>
            `).join('');
        
        document.getElementById('unmapped-modal').classList.remove('hidden');
        
        // Export button
        document.getElementById('export-unmapped').onclick = () => exportUnmappedCSV(unmapped);
    }

    function exportUnmappedCSV(unmapped) {
        const headers = ['Deal Name', 'Owner', 'Stage', 'GBV', 'City', 'State'];
        const rows = unmapped.map(d => [
            d.name,
            d.owner || '',
            d.stage,
            d.gbv || 0,
            d.city || '',
            d.state || ''
        ]);
        
        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'journey-unmapped-deals.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ============================================
    // UTILITIES
    // ============================================
    function formatCurrency(value) {
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
        if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
        return `$${value.toFixed(0)}`;
    }

    // Add CSS for pulse animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes marker-pulse {
            0% { box-shadow: 0 0 0 0 currentColor; }
            70% { box-shadow: 0 0 0 10px transparent; }
            100% { box-shadow: 0 0 0 0 transparent; }
        }
        .marker-pulse > div {
            animation: marker-pulse 2s infinite;
        }
    `;
    document.head.appendChild(style);

    // Legacy inline handler in index.html
    window.closeUnmappedModal = closeModal;

})();
