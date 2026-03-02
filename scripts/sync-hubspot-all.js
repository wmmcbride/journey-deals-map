#!/usr/bin/env node
/**
 * HubSpot Sync Script for Journey Deals Map (ALL DEALS VERSION)
 * Pulls ALL deals (mapped + unmapped) from HubSpot API
 * Generates deals-data-dual.js with full deal list
 */

const https = require('https');
const fs = require('fs');

const API_KEY = process.env.HUBSPOT_API_KEY;

if (!API_KEY) {
  console.error('❌ HUBSPOT_API_KEY environment variable not set');
  process.exit(1);
}

// Stage colors mapping
const STAGE_COLORS = {
  'Closed Won': '#2e7d32',
  'Contracting': '#1565c0',
  'Decision & Approval': '#1976d2',
  'Solution & Business Alignment': '#42a5f5',
  'Discovery & Stakeholders': '#64b5f6',
  'Evaluation Accepted': '#90caf9',
  'Closed Lost': '#d32f2f'
};

// Alliance New Business pipeline
const ALLIANCE_PIPELINE_ID = '139603853';
const STAGE_IDS = {
  'closedWon': '239842175',
  'contracting': '1294734116',
  'decision': '1294734115',
  'solution': '1294734113',
  'discovery': '1294734112',
  'evaluation': '1294734111',
  'closedLost': '239842176'
};

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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllDeals() {
  console.log('📥 Fetching ALL deals from HubSpot...');
  
  let allDeals = [];
  let after = undefined;
  
  while (true) {
    const afterParam = after ? `&after=${after}` : '';
    const url = `https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,pipeline,hubspot_owner_id,closedate,amount,gbv,gbv__rollup_,properties,keys${afterParam}`;
    
    const data = await fetchJSON(url);
    allDeals = allDeals.concat(data.results);
    
    if (!data.paging || !data.paging.next) break;
    after = data.paging.next.after;
    
    await sleep(100); // Rate limit protection
  }
  
  // Filter to Alliance New Business pipeline
  const allianceDeals = allDeals.filter(d => d.properties.pipeline === ALLIANCE_PIPELINE_ID);
  
  // Include ALL stages (active + closed won + closed lost)
  const allStageIds = Object.values(STAGE_IDS);
  const filteredDeals = allianceDeals.filter(d => allStageIds.includes(d.properties.dealstage));
  
  console.log(`  ✓ Found ${filteredDeals.length} Alliance deals`);
  return filteredDeals;
}

async function getOwnerName(ownerId) {
  if (!ownerId) return 'Unassigned';
  
  try {
    const url = `https://api.hubapi.com/crm/v3/owners/${ownerId}`;
    const data = await fetchJSON(url);
    return `${data.firstName} ${data.lastName}`;
  } catch(e) {
    return `Owner ${ownerId}`;
  }
}

async function getDealCompanies(dealId) {
  const url = `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/companies`;
  try {
    const data = await fetchJSON(url);
    return data.results || [];
  } catch(e) {
    return [];
  }
}

async function getCompanyDetails(companyId) {
  const url = `https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=name,address,city,state,zip,country`;
  try {
    return await fetchJSON(url);
  } catch(e) {
    return null;
  }
}

async function geocodeAddress(address, city, state, country) {
  const parts = [];
  if (address) parts.push(address);
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (country) parts.push(country);
  
  if (parts.length === 0) return null;
  
  const query = encodeURIComponent(parts.join(', '));
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Journey-Deals-Map/1.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results.length > 0) {
            resolve({
              lat: parseFloat(results[0].lat),
              lng: parseFloat(results[0].lon)
            });
          } else {
            resolve(null);
          }
        } catch(e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function getStageName(stageId) {
  const names = {
    [STAGE_IDS.closedWon]: 'Closed Won',
    [STAGE_IDS.contracting]: 'Contracting',
    [STAGE_IDS.decision]: 'Decision & Approval',
    [STAGE_IDS.solution]: 'Solution & Business Alignment',
    [STAGE_IDS.discovery]: 'Discovery & Stakeholders',
    [STAGE_IDS.evaluation]: 'Evaluation Accepted',
    [STAGE_IDS.closedLost]: 'Closed Lost'
  };
  return names[stageId] || 'Unknown';
}

async function main() {
  console.log('🚀 Journey HubSpot Sync (ALL DEALS) Starting...\n');
  
  // 1. Get all deals
  const deals = await getAllDeals();
  
  // 2. Get owner names cache
  console.log('👥 Fetching owner names...');
  const ownerCache = {};
  const uniqueOwnerIds = [...new Set(deals.map(d => d.properties.hubspot_owner_id).filter(Boolean))];
  
  for (const ownerId of uniqueOwnerIds) {
    ownerCache[ownerId] = await getOwnerName(ownerId);
    await sleep(100);
  }
  console.log(`  ✓ ${uniqueOwnerIds.length} owners cached`);
  
  // 3. Process each deal
  console.log('\n🏨 Processing deals...');
  const propertyView = [];
  const allDealsData = [];
  let dealsWithCoords = 0;
  let dealsWithoutCoords = 0;
  
  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    const props = deal.properties;
    
    console.log(`[${i+1}/${deals.length}] ${props.dealname}`);
    
    // Get deal details
    const stageName = getStageName(props.dealstage);
    const color = STAGE_COLORS[stageName] || '#999';
    const ownerName = ownerCache[props.hubspot_owner_id] || 'Unassigned';
    const gbv = parseFloat(props.gbv__rollup_ || props.gbv || props.amount || 0);
    
    // Build base deal object (for allDealsData)
    const baseDealData = {
      hs_object_id: deal.id,
      dealname: props.dealname,
      dealstage: props.dealstage,
      stageName: stageName,
      hubspot_owner_id: props.hubspot_owner_id,
      owner: ownerName,
      gbv__rollup_: gbv,
      closedate: props.closedate || null,
      hasLocation: false,
      companyName: null
    };
    
    // Get associated companies
    const companies = await getDealCompanies(deal.id);
    await sleep(100);
    
    if (companies.length === 0) {
      console.log('  ⚠️  No companies - adding as unmapped');
      allDealsData.push(baseDealData);
      dealsWithoutCoords++;
      continue;
    }
    
    // Get primary company
    const primaryAssoc = companies.find(c => 
      c.associationTypes.some(t => t.label === 'Primary')
    );
    const primaryCompanyId = primaryAssoc ? primaryAssoc.toObjectId : companies[0].toObjectId;
    
    // Get company details
    const companyDetails = [];
    for (const companyAssoc of companies.slice(0, 10)) {
      const details = await getCompanyDetails(companyAssoc.toObjectId);
      if (details) companyDetails.push(details);
      await sleep(100);
    }
    
    const primaryCompany = companyDetails.find(c => c.id === primaryCompanyId.toString()) || companyDetails[0];
    
    if (!primaryCompany) {
      console.log('  ⚠️  No company details - adding as unmapped');
      allDealsData.push(baseDealData);
      dealsWithoutCoords++;
      continue;
    }
    
    baseDealData.companyName = primaryCompany.properties.name;
    
    // Geocode HQ
    const hqCity = primaryCompany.properties.city || 'Unknown';
    const hqState = primaryCompany.properties.state || '';
    const hqCountry = primaryCompany.properties.country || 'USA';
    const hqAddress = primaryCompany.properties.address || '';
    
    let coords = null;
    
    if (hqCity !== 'Unknown') {
      coords = await geocodeAddress(hqAddress, hqCity, hqState, hqCountry);
      await sleep(1000); // Nominatim rate limit
    }
    
    if (!coords) {
      console.log('  ⚠️  Could not geocode - adding as unmapped');
      allDealsData.push(baseDealData);
      dealsWithoutCoords++;
      continue;
    }
    
    // Has location!
    dealsWithCoords++;
    baseDealData.hasLocation = true;
    allDealsData.push(baseDealData);
    
    // Add to property view (for map)
    propertyView.push({
      dealId: deal.id,
      name: props.dealname,
      company: primaryCompany.properties.name,
      lat: coords.lat,
      lon: coords.lng,
      city: hqCity,
      state: hqState,
      country: hqCountry,
      gbv: gbv,
      stage: stageName,
      color: color,
      owner: ownerName,
      closeDate: props.closedate || null
    });
    
    console.log(`  ✓ Added to map`);
  }
  
  // 4. Write output file
  console.log('\n💾 Writing deals-data-dual.js...');
  
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const coverage = ((dealsWithCoords / deals.length) * 100).toFixed(1);
  
  const jsContent = `// Journey Deals Map - Dual View Data
// Generated: ${timestamp}
// Total deals: ${deals.length}
// Coverage: ${coverage}%

// Property View Data (individual deal locations)
const dealsDataProperty = ${JSON.stringify(propertyView, null, 2)};

// ALL Deals Data (including unmapped)
const allDealsData = ${JSON.stringify(allDealsData, null, 2)};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dealsDataProperty, allDealsData };
}
`;
  
  fs.writeFileSync('deals-data-dual.js', jsContent);
  
  console.log('\n✅ Sync Complete!');
  console.log(`   Total deals: ${deals.length}`);
  console.log(`   With coordinates (mapped): ${dealsWithCoords}`);
  console.log(`   Without coordinates (unmapped): ${dealsWithoutCoords}`);
  console.log(`   Coverage: ${coverage}%`);
}

main().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
