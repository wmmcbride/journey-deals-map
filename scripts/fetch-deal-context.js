#!/usr/bin/env node
/**
 * Fetch deal context from HubSpot for modal display
 * Called on-demand when user clicks "View Details"
 */

const https = require('https');

const API_KEY = process.env.HUBSPOT_API_KEY;

async function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function getDealDetails(dealId) {
  const url = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,closedate,notes_last_contacted,notes_last_updated,notes_next_activity_date,hs_lastmodifieddate,description,hs_next_step`;
  return await fetchJSON(url);
}

async function getDealNotes(dealId) {
  const url = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/notes?limit=10`;
  try {
    const assoc = await fetchJSON(url);
    const noteIds = assoc.results.map(r => r.toObjectId);
    
    if (noteIds.length === 0) return [];
    
    const notes = [];
    for (const noteId of noteIds.slice(0, 10)) {
      const noteUrl = `https://api.hubapi.com/crm/v3/objects/notes/${noteId}?properties=hs_note_body,hs_timestamp,hubspot_owner_id`;
      const note = await fetchJSON(noteUrl);
      notes.push(note);
    }
    return notes;
  } catch(e) {
    return [];
  }
}

async function getDealEngagements(dealId) {
  // Get emails, calls, meetings, tasks
  const types = ['emails', 'calls', 'meetings', 'tasks'];
  const allEngagements = [];
  
  for (const type of types) {
    try {
      const url = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/${type}?limit=20`;
      const assoc = await fetchJSON(url);
      
      for (const item of assoc.results.slice(0, 20)) {
        const detailUrl = `https://api.hubapi.com/crm/v3/objects/${type}/${item.toObjectId}`;
        const detail = await fetchJSON(detailUrl);
        allEngagements.push({
          type: type.slice(0, -1), // Remove trailing 's'
          ...detail
        });
      }
    } catch(e) {
      // Skip if no engagements of this type
    }
  }
  
  return allEngagements;
}

async function summarizeWithClaude(dealData, notes, engagements) {
  // This will be called from the frontend via an API endpoint
  // For now, return structured data
  return {
    dealData,
    notes,
    engagements
  };
}

async function main() {
  const dealId = process.argv[2];
  
  if (!dealId) {
    console.error('Usage: node fetch-deal-context.js <dealId>');
    process.exit(1);
  }
  
  console.log(`Fetching context for deal ${dealId}...`);
  
  const [dealData, notes, engagements] = await Promise.all([
    getDealDetails(dealId),
    getDealNotes(dealId),
    getDealEngagements(dealId)
  ]);
  
  const result = {
    deal: dealData,
    notes: notes,
    engagements: engagements,
    summary: await summarizeWithClaude(dealData, notes, engagements)
  };
  
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { getDealDetails, getDealNotes, getDealEngagements };
