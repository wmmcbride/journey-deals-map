/**
 * Vercel Serverless Function: Fetch Deal Context from HubSpot
 * Endpoint: /api/deal-context/[dealId]
 * 
 * This proxies HubSpot API calls and uses Claude to summarize the data
 */

const https = require('https');

// Environment variables (set in Vercel dashboard)
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function fetchJSON(url, headers = {}) {
  const parsedUrl = new URL(url);
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: headers
  };
  
  return new Promise((resolve, reject) => {
    https.get(options, (res) => {
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

function postJSON(url, body, headers = {}) {
  const parsedUrl = new URL(url);
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function getDealDetails(dealId) {
  const url = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,closedate,description,hs_next_step,hs_lastmodifieddate,notes_last_contacted,notes_next_activity_date`;
  return await fetchJSON(url, {
    'Authorization': `Bearer ${HUBSPOT_API_KEY}`
  });
}

async function getDealNotes(dealId) {
  try {
    // Get notes directly on deal
    const dealNotesUrl = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/notes?limit=10`;
    const dealNotesAssoc = await fetchJSON(dealNotesUrl, {
      'Authorization': `Bearer ${HUBSPOT_API_KEY}`
    });
    
    const notes = [];
    
    // Fetch deal notes
    for (const item of dealNotesAssoc.results.slice(0, 10)) {
      const noteUrl = `https://api.hubapi.com/crm/v3/objects/notes/${item.toObjectId}?properties=hs_note_body,hs_timestamp`;
      const note = await fetchJSON(noteUrl, {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`
      });
      notes.push({
        date: note.properties.hs_timestamp,
        content: note.properties.hs_note_body || '',
        source: 'deal'
      });
    }
    
    // Get contacts associated with deal (for Granola transcripts)
    const contactsUrl = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts?limit=5`;
    const contactsAssoc = await fetchJSON(contactsUrl, {
      'Authorization': `Bearer ${HUBSPOT_API_KEY}`
    });
    
    // Fetch notes from associated contacts (Granola transcripts)
    for (const contact of contactsAssoc.results.slice(0, 5)) {
      const contactId = contact.toObjectId || contact.id; // Handle both formats
      const contactNotesUrl = `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/notes?limit=5`;
      const contactNotes = await fetchJSON(contactNotesUrl, {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`
      });
      
      for (const noteItem of contactNotes.results.slice(0, 5)) {
        const noteId = noteItem.toObjectId || noteItem.id; // Handle both formats
        const noteUrl = `https://api.hubapi.com/crm/v3/objects/notes/${noteId}?properties=hs_note_body,hs_timestamp`;
        const note = await fetchJSON(noteUrl, {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`
        });
        notes.push({
          date: note.properties.hs_timestamp,
          content: note.properties.hs_note_body || '',
          source: 'contact'
        });
      }
    }
    
    // Sort by date descending
    notes.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return notes.slice(0, 15); // Return top 15 most recent
  } catch(e) {
    console.error('Error fetching notes:', e);
    return [];
  }
}

async function getDealEngagements(dealId) {
  const types = ['emails', 'calls', 'meetings', 'tasks'];
  const timeline = [];
  
  for (const type of types) {
    try {
      const assocUrl = `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/${type}?limit=20`;
      const assoc = await fetchJSON(assocUrl, {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`
      });
      
      for (const item of assoc.results.slice(0, 10)) {
        const detailUrl = `https://api.hubapi.com/crm/v3/objects/${type}/${item.toObjectId}`;
        const detail = await fetchJSON(detailUrl, {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`
        });
        
        let content = '';
        let date = null;
        
        if (type === 'emails') {
          content = detail.properties.hs_email_subject || 'Email';
          date = detail.properties.hs_timestamp;
        } else if (type === 'calls') {
          content = detail.properties.hs_call_title || 'Call';
          date = detail.properties.hs_timestamp;
        } else if (type === 'meetings') {
          content = detail.properties.hs_meeting_title || 'Meeting';
          date = detail.properties.hs_timestamp;
        } else if (type === 'tasks') {
          content = detail.properties.hs_task_subject || 'Task';
          date = detail.properties.hs_timestamp;
        }
        
        if (date) {
          timeline.push({
            type: type.slice(0, -1).toUpperCase(),
            date: date,
            content: content
          });
        }
      }
    } catch(e) {
      // Skip if no engagements of this type
    }
  }
  
  // Sort by date descending
  timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  return timeline;
}

async function summarizeWithClaude(dealData, notes, timeline) {
  if (!ANTHROPIC_API_KEY) {
    return "AI summary unavailable (no Anthropic API key configured)";
  }
  
  const contextText = `
Deal: ${dealData.properties.dealname}
Stage: ${dealData.properties.dealstage}
Description: ${dealData.properties.description || 'None'}
Next Step: ${dealData.properties.hs_next_step || 'None'}
Last Modified: ${dealData.properties.hs_lastmodifieddate || 'Unknown'}

Recent Notes (${notes.length}):
${notes.slice(0, 5).map(n => `- ${new Date(n.date).toLocaleDateString()}: ${n.content.substring(0, 200)}`).join('\n')}

Recent Activity (${timeline.length}):
${timeline.slice(0, 10).map(t => `- ${new Date(t.date).toLocaleDateString()} ${t.type}: ${t.content}`).join('\n')}
  `.trim();
  
  const prompt = `You are analyzing a deal from HubSpot CRM. Based on the following deal data, provide a concise 2-3 paragraph summary that answers: What's the current status? What's happening? What are the next steps? Focus on recent activity and actionable insights.

${contextText}

Provide a clear, executive-level summary:`;
  
  try {
    const response = await postJSON('https://api.anthropic.com/v1/messages', {
      model: 'claude-opus-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }, {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    });
    
    return response.content[0].text;
  } catch(e) {
    console.error('Claude API error:', e);
    return `Summary unavailable. Recent activity: ${timeline.length} engagements, ${notes.length} notes. Last modified: ${new Date(dealData.properties.hs_lastmodifieddate).toLocaleDateString()}`;
  }
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  const { dealId } = req.query;
  
  if (!dealId) {
    res.status(400).json({ error: 'dealId is required' });
    return;
  }
  
  if (!HUBSPOT_API_KEY) {
    res.status(500).json({ error: 'HUBSPOT_API_KEY not configured' });
    return;
  }
  
  try {
    console.log(`Fetching context for deal ${dealId}...`);
    
    // Fetch all data in parallel
    const [dealData, notes, timeline] = await Promise.all([
      getDealDetails(dealId),
      getDealNotes(dealId),
      getDealEngagements(dealId)
    ]);
    
    // Generate AI summary
    const summary = await summarizeWithClaude(dealData, notes, timeline);
    
    // Return structured response
    res.status(200).json({
      deal: {
        name: dealData.properties.dealname,
        stage: dealData.properties.dealstage,
        description: dealData.properties.description,
        nextStep: dealData.properties.hs_next_step,
        lastModified: dealData.properties.hs_lastmodifieddate
      },
      notes: notes,
      timeline: timeline,
      summary: summary
    });
    
  } catch(error) {
    console.error('Error fetching deal context:', error);
    res.status(500).json({ 
      error: 'Failed to fetch deal context',
      message: error.message 
    });
  }
}
