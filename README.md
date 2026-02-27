# Journey Alliance Deals Map

Interactive web map showing all Journey Alliance deals (closed + pipeline) with **automatic HubSpot syncing**, advanced filtering, region selection, and custom drawing tools.

## 🔄 Auto-Sync from HubSpot

The map automatically stays up-to-date with your HubSpot data:

### **Deal Data Sync**
- **Daily sync:** Runs every day at 12 AM CST (6 AM UTC)
- **Manual trigger:** Click "Actions" → "Sync HubSpot Data" → "Run workflow" in GitHub
- **What it syncs:**
  - All Alliance New Business deals
  - Company associations & addresses
  - Deal stages, owners, GBV, properties, keys
  - Property View (individual properties) + HQ View (headquarters rollup)

Data is pulled fresh from HubSpot API, geocoded, and the site rebuilds automatically within 2-3 minutes.

### **Contact-Deal Association (Granola Integration)**
- **Daily sync:** Runs every day at 1 AM CST (7 AM UTC)
- **Manual trigger:** Click "Actions" → "Associate Contacts with Deals" → "Run workflow" in GitHub
- **What it does:**
  - Finds contacts with notes (Granola meeting transcripts)
  - Associates them with their company's active deals
  - Enables Granola transcripts to appear in deal "View Details" modal

**Why this matters:** Granola creates meeting notes on Contact records, not Deals. This script automatically bridges that gap so you see meeting transcripts when viewing deal context.

### Setup (One-Time)

The HubSpot API key is stored securely in GitHub Secrets:

1. Go to: https://github.com/wmmcbride/journey-deals-map/settings/secrets/actions
2. Click "New repository secret"
3. Name: `HUBSPOT_API_KEY`
4. Value: Your HubSpot API key
5. Click "Add secret"

**The sync is already configured and ready to run!**

## Features

✅ **103 deals plotted** with verified locations  
✅ **Color-coded by stage** (green = closed, blue gradient = pipeline)  
✅ **Region quick filters** (North America, Europe, Asia, Latin America, Africa)  
✅ **Custom region drawing** (draw circles or polygons to isolate deals)  
✅ **Smart search** (by deal name, city, owner)  
✅ **Stage & owner filters** (checkbox + dropdown)  
✅ **4 basemap styles** (Light, Dark, Satellite, Minimal)  
✅ **Dynamic marker sizing** (larger + glowing when zoomed in)  
✅ **Dark mode** (toggle + saves preference)  
✅ **Live stats** (GBV, deal count, properties, keys update in real-time)  
✅ **Mobile-friendly** responsive design  
✅ **Modern UI** with smooth animations

## GitHub Pages Deployment

### Option 1: Quick Deploy (Recommended)

1. Create a new GitHub repository (e.g., `journey-deals-map`)
2. Initialize and push this directory:

```bash
cd journey-map-enhanced
git init
git add .
git commit -m "Initial commit: Journey Alliance Deals Map"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/journey-deals-map.git
git push -u origin main
```

3. Enable GitHub Pages:
   - Go to your repo → Settings → Pages
   - Source: Deploy from branch
   - Branch: `main` / root
   - Click Save

4. Your site will be live at: `https://YOUR_USERNAME.github.io/journey-deals-map/`

### Option 2: GitHub Desktop

1. Open GitHub Desktop
2. File → Add Local Repository → Select `journey-map-enhanced` folder
3. Create repository on GitHub
4. Publish repository
5. Enable Pages in repo settings (see step 3 above)

### Option 3: GitHub Web Interface

1. Go to github.com → New Repository
2. Name it `journey-deals-map`
3. Upload files:
   - index.html
   - styles.css
   - app.js
   - deals-data.js
   - README.md
4. Enable Pages in Settings

## Updating Deal Data

To update the map with new deals:

1. Edit `deals-data.js` with new deal objects
2. Commit and push changes:

```bash
git add deals-data.js
git commit -m "Update deal data"
git push
```

3. GitHub Pages will auto-rebuild (takes 1-2 minutes)

## Deal Data Format

Each deal in `deals-data.js` requires:

```javascript
{
  "id": "unique-id",
  "name": "Deal Name",
  "owner": "Owner Name",
  "stage": "Stage Name",
  "color": "#hexcolor",
  "gbv": 1000000,
  "properties": 5,
  "keys": 100,
  "city": "City",
  "state": "ST",
  "country": "Country",
  "lat": 40.7128,
  "lng": -74.0060
}
```

## Local Development

To test locally before pushing:

```bash
# Option 1: Python
python3 -m http.server 8000

# Option 2: Node.js
npx http-server

# Option 3: VS Code Live Server extension
```

Then open `http://localhost:8000` in your browser.

## Browser Support

- Chrome/Edge 90+
- Safari 14+
- Firefox 88+
- Mobile browsers (iOS Safari, Chrome)

## Technologies

- **Leaflet.js** - Interactive maps
- **Leaflet.markercluster** - Marker clustering
- **Leaflet.draw** - Drawing tools
- **CartoDB** - Clean basemaps
- **Inter font** - Modern typography

## Customization

### Change colors

Edit stage colors in `deals-data.js` (color field) and `styles.css` (legend/checkmarks).

### Add new regions

Edit `regions` object in `app.js`:

```javascript
const regions = {
  'my-region': {
    bounds: [[south, west], [north, east]],
    zoom: 4
  }
};
```

Then add button in `index.html`.

### Modify basemaps

Add new basemap in `app.js`:

```javascript
const basemaps = {
  mymap: L.tileLayer('https://...', {
    attribution: '...',
    maxZoom: 19
  })
};
```

## Support

For issues or questions:
- Check browser console for errors
- Verify `deals-data.js` syntax (must be valid JSON)
- Test locally before deploying

---

**Built for Journey by Atlas** | Last Updated: February 2026
