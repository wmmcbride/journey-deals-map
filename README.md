# Journey Alliance Deals Map

Interactive web map showing all Journey Alliance deals (closed + pipeline) with advanced filtering, region selection, and custom drawing tools.

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
