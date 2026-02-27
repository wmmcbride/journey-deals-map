# Deploying the Deal Context API

The "View Details" feature requires a backend API to fetch HubSpot data and generate AI summaries. This API is designed to be deployed to Vercel (free tier works).

## Quick Deploy to Vercel (5 minutes)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy
```bash
cd journey-map-enhanced
vercel
```

Follow the prompts:
- Set up and deploy: **Y**
- Which scope: **your-account**
- Link to existing project: **N**
- Project name: **journey-deals-api**
- Directory: **.** (current directory)
- Override settings: **N**

### 3. Add Environment Variables

After deployment, add your API keys:

```bash
vercel env add HUBSPOT_API_KEY
# Paste your HubSpot API key

vercel env add ANTHROPIC_API_KEY
# Paste your Anthropic API key (for Claude)
```

Or add them via the Vercel dashboard:
1. Go to https://vercel.com/dashboard
2. Select your project → Settings → Environment Variables
3. Add:
   - `HUBSPOT_API_KEY` = your HubSpot API key
   - `ANTHROPIC_API_KEY` = your Anthropic API key

### 4. Redeploy
```bash
vercel --prod
```

### 5. Update Frontend

Your API URL will be: `https://journey-deals-api.vercel.app`

Update `app.js` line ~XXX:
```javascript
const apiUrl = `https://YOUR-PROJECT.vercel.app/api/deal-context/${dealId}`;
```

### 6. Commit and Push
```bash
git add app.js
git commit -m "Update API URL to deployed Vercel endpoint"
git push
```

Done! The "View Details" button will now work on your live map.

## Alternative: Deploy to Netlify

1. Install Netlify CLI: `npm install -g netlify-cli`
2. Run: `netlify deploy`
3. Add environment variables in Netlify dashboard
4. Update API URL in `app.js`

## API Endpoints

### GET /api/deal-context/[dealId]

Fetches complete deal context from HubSpot and generates an AI summary.

**Response:**
```json
{
  "deal": {
    "name": "Deal Name",
    "stage": "Contracting",
    "description": "...",
    "nextStep": "...",
    "lastModified": "2026-02-27T..."
  },
  "notes": [
    {
      "date": "2026-02-27T...",
      "content": "Note text..."
    }
  ],
  "timeline": [
    {
      "type": "EMAIL",
      "date": "2026-02-27T...",
      "content": "Email subject..."
    }
  ],
  "summary": "AI-generated summary of deal status and next steps..."
}
```

## Cost

- **Vercel:** Free tier includes 100 GB-hours/month (plenty for this use case)
- **HubSpot API:** No additional cost (uses your existing API key)
- **Claude API:** ~$0.01-0.05 per summary (Opus 4)

Estimated monthly cost with 1000 "View Details" clicks: **~$10-50** (mostly Claude API)

## Security

- API keys are stored securely in Vercel environment variables
- Not exposed in frontend code
- CORS enabled only for your map domain (optional: restrict further)

## Monitoring

Check API logs:
```bash
vercel logs
```

Or via dashboard: https://vercel.com/dashboard → Your Project → Logs

## Troubleshooting

**"API error: 500"**
- Check Vercel logs for errors
- Verify environment variables are set
- Check HubSpot API key has correct permissions

**"Unable to Load Deal Context"**
- API not deployed yet (follow steps above)
- Wrong API URL in app.js
- CORS issue (check browser console)

**Slow responses**
- First request after idle may take 3-5 seconds (cold start)
- Subsequent requests are fast (<1 second)
- Consider upgrading Vercel plan for faster cold starts
