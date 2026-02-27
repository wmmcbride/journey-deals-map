#!/usr/bin/env node
/**
 * Auto-Associate Contacts with Deals
 * 
 * Purpose: Associate contacts who have notes (Granola transcripts) with their company's active deals
 * This makes Granola meeting transcripts visible in the deal context modal
 * 
 * Logic:
 * 1. Find all contacts with recent notes (last 30 days)
 * 2. Get each contact's associated company
 * 3. Find active deals for that company
 * 4. Create contact-deal associations
 * 
 * Run: node associate-contacts-deals.js
 * Schedule: Daily via GitHub Actions
 */

const https = require('https');

const API_KEY = process.env.HUBSPOT_API_KEY;

if (!API_KEY) {
  console.error('❌ HUBSPOT_API_KEY environment variable not set');
  process.exit(1);
}

async function fetchJSON(url) {
  const parsedUrl = new URL(url);
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${API_KEY}` }
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

async function putJSON(url, body) {
  const parsedUrl = new URL(url);
  const bodyStr = JSON.stringify(body);
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data || '{}'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getContactsWithRecentNotes() {
  console.log('📥 Finding contacts with recent notes...');
  
  const daysBack = 180; // Look back 6 months
  const lookbackDate = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
  
  // Get recent notes
  const notesUrl = `https://api.hubapi.com/crm/v3/objects/notes?limit=100&properties=hs_timestamp`;
  const notesData = await fetchJSON(notesUrl);
  
  const recentNotes = notesData.results.filter(note => {
    const timestamp = new Date(note.properties.hs_timestamp).getTime();
    return timestamp > lookbackDate;
  });
  
  console.log(`  Found ${recentNotes.length} recent notes`);
  
  // Get contacts for these notes
  const contactIds = new Set();
  
  for (const note of recentNotes) {
    const assocUrl = `https://api.hubapi.com/crm/v3/objects/notes/${note.id}/associations/contacts`;
    try {
      const assoc = await fetchJSON(assocUrl);
      for (const contact of assoc.results) {
        contactIds.add(contact.id);
      }
    } catch(e) {
      // Skip if no contact association
    }
    await sleep(50); // Rate limit
  }
  
  console.log(`  ✓ ${contactIds.size} unique contacts with notes`);
  return Array.from(contactIds);
}

async function getContactCompanies(contactId) {
  const url = `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/companies`;
  try {
    const data = await fetchJSON(url);
    return data.results.map(r => r.id);
  } catch(e) {
    return [];
  }
}

async function getCompanyDeals(companyId) {
  const url = `https://api.hubapi.com/crm/v3/objects/companies/${companyId}/associations/deals`;
  try {
    const data = await fetchJSON(url);
    return data.results.map(r => r.id);
  } catch(e) {
    return [];
  }
}

async function getContactDeals(contactId) {
  const url = `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`;
  try {
    const data = await fetchJSON(url);
    return data.results.map(r => r.id);
  } catch(e) {
    return [];
  }
}

async function associateContactWithDeal(contactId, dealId) {
  const url = `https://api.hubapi.com/crm/v4/objects/contacts/${contactId}/associations/deals/${dealId}`;
  
  const body = [{
    associationCategory: "HUBSPOT_DEFINED",
    associationTypeId: 3 // Contact to Deal association type
  }];
  
  try {
    await putJSON(url, body);
    return true;
  } catch(e) {
    console.error(`    ⚠️  Failed to associate contact ${contactId} with deal ${dealId}: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Contact-Deal Association Script Starting...\n');
  
  const startTime = Date.now();
  
  // 1. Get contacts with recent notes
  const contactIds = await getContactsWithRecentNotes();
  
  if (contactIds.length === 0) {
    console.log('\n✓ No contacts with recent notes found. Nothing to do.');
    return;
  }
  
  // 2. Process each contact
  console.log('\n🔗 Creating associations...');
  
  let processed = 0;
  let skipped = 0;
  let associated = 0;
  let errors = 0;
  
  for (const contactId of contactIds) {
    processed++;
    console.log(`[${processed}/${contactIds.length}] Contact ${contactId}`);
    
    // Get contact's companies
    const companyIds = await getContactCompanies(contactId);
    await sleep(100);
    
    if (companyIds.length === 0) {
      console.log('  ⚠️  No company association - skipping');
      skipped++;
      continue;
    }
    
    console.log(`  Found ${companyIds.length} companies`);
    
    // Get deals for each company
    let dealIds = [];
    for (const companyId of companyIds) {
      const companyDeals = await getCompanyDeals(companyId);
      dealIds = dealIds.concat(companyDeals);
      await sleep(100);
    }
    
    dealIds = [...new Set(dealIds)]; // Dedupe
    
    if (dealIds.length === 0) {
      console.log('  ⚠️  No deals found for companies - skipping');
      skipped++;
      continue;
    }
    
    console.log(`  Found ${dealIds.length} deals`);
    
    // Get existing contact-deal associations
    const existingDeals = await getContactDeals(contactId);
    await sleep(100);
    
    // Associate with new deals
    const newDeals = dealIds.filter(id => !existingDeals.includes(id));
    
    if (newDeals.length === 0) {
      console.log('  ✓ Already associated with all deals');
      continue;
    }
    
    console.log(`  Creating ${newDeals.length} new associations...`);
    
    for (const dealId of newDeals) {
      const success = await associateContactWithDeal(contactId, dealId);
      if (success) {
        associated++;
        console.log(`    ✓ Associated with deal ${dealId}`);
      } else {
        errors++;
      }
      await sleep(150); // Rate limit
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n✅ Association Script Complete!');
  console.log(`   Duration: ${duration}s`);
  console.log(`   Processed: ${processed} contacts`);
  console.log(`   Skipped: ${skipped} (no company or deals)`);
  console.log(`   New associations: ${associated}`);
  console.log(`   Errors: ${errors}`);
  
  if (associated > 0) {
    console.log('\n💡 Granola transcripts will now appear in deal "View Details" modals!');
  }
}

main().catch(err => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
