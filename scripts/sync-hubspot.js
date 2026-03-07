#!/usr/bin/env node
/**
 * HubSpot Sync Script for Journey Deals Map
 * Pulls deals, companies, and locations from HubSpot API
 * Generates deals-data-dual.js for the live map
 */

const https = require('https');
const fs = require('fs');

const API_KEY = process.env.HUBSPOT_API_KEY;

if (!API_KEY) {
  console.error('❌ HUBSPOT_API_KEY environment variable not set');
  process.exit(1);
}

// Load fallback location database for deals that can't be geocoded
let fallbackLocations = {};
try {
  const fallbackData = fs.readFileSync('./fallback-locations.json', 'utf8');
  fallbackLocations = JSON.parse(fallbackData);
  console.log(`📍 Loaded ${Object.keys(fallbackLocations).length} fallback locations`);
} catch (e) {
  console.log('ℹ️  No fallback locations file found (optional)');
}

// Stage colors mapping
const STAGE_COLORS = {
  'Closed Won': '#2e7d32',
  'Contracting': '#1565c0',
  'Decision & Approval': '#1976d2',
  'Solution & Business Alignment': '#42a5f5',
  'Discovery & Stakeholders': '#64b5f6',
  'Evaluation Accepted': '#90caf9'
};

// Alliance New Business pipeline
const ALLIANCE_PIPELINE_ID = '139603853';
const STAGE_IDS = {
  'closedWon': '239842175',
  'contracting': '1294734116',
  'decision': '1294734115',
  'solution': '1294734113',
  'discovery': '1294734112',
  'evaluation': '1294734111'
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
  console.log('📥 Fetching deals from HubSpot...');
  
  let allDeals = [];
  let after = undefined;
  
  while (true) {
    // Use Search API - it returns gbv__rollup_ correctly (pagination endpoint doesn't)
    const searchPayload = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'pipeline',
              operator: 'EQ',
              value: ALLIANCE_PIPELINE_ID
            }
          ]
        }
      ],
      properties: ['dealname', 'dealstage', 'pipeline', 'hubspot_owner_id', 'closedate', 'amount', 'gbv', 'gbv__rollup_', 'properties', 'keys'],
      limit: 100
    };
    
    if (after) {
      searchPayload.after = after;
    }
    
    const data = await new Promise((resolve, reject) => {
      const postData = JSON.stringify(searchPayload);
      const options = {
        hostname: 'api.hubapi.com',
        path: '/crm/v3/objects/deals/search',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
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
      req.write(postData);
      req.end();
    });
    
    allDeals = allDeals.concat(data.results);
    
    if (!data.paging || !data.paging.next) break;
    after = data.paging.next.after;
    
    await sleep(100); // Rate limit protection
  }
  
  // Filter to Alliance New Business pipeline
  const allianceDeals = allDeals.filter(d => d.properties.pipeline === ALLIANCE_PIPELINE_ID);
  
  // Filter to active + closed won stages
  const relevantStages = Object.values(STAGE_IDS);
  const filteredDeals = allianceDeals.filter(d => relevantStages.includes(d.properties.dealstage));
  
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
    return 'Unknown';
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
    [STAGE_IDS.evaluation]: 'Evaluation Accepted'
  };
  return names[stageId] || 'Unknown';
}

async function main() {
  console.log('🚀 Journey HubSpot Sync Starting...\n');
  
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
  const hqView = [];
  let dealsWithCoords = 0;
  let multiPropertyDeals = 0;
  
  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    const props = deal.properties;
    
    console.log(`[${i+1}/${deals.length}] ${props.dealname}`);
    
    // DEBUG: Log first deal's properties to see what we get from HubSpot
    if (i === 0) {
      console.log('  DEBUG - First deal properties:', JSON.stringify({
        gbv__rollup_: props.gbv__rollup_,
        gbv: props.gbv,
        amount: props.amount
      }, null, 2));
    }
    
    // Get deal details
    const stageName = getStageName(props.dealstage);
    const color = STAGE_COLORS[stageName] || '#999';
    const ownerName = ownerCache[props.hubspot_owner_id] || 'Unassigned';
    const gbv__rollup_num = parseFloat(props.gbv__rollup_);
    const gbv_num = parseFloat(props.gbv);
    const amount_num = parseFloat(props.amount);

    const gbv = (isNaN(gbv__rollup_num) ? 0 : gbv__rollup_num) || (isNaN(gbv_num) ? 0 : gbv_num) || (isNaN(amount_num) ? 0 : amount_num) || 0;
    const properties = parseInt(props.properties || 0);
    const keys = parseInt(props.keys || 0);
    
    // Get associated companies
    const companies = await getDealCompanies(deal.id);
    await sleep(100);
    
    if (companies.length === 0) {
      console.log('  ⚠️  No companies - skipping');
      continue;
    }
    
    // Get primary company
    const primaryAssoc = companies.find(c => 
      c.associationTypes.some(t => t.label === 'Primary')
    );
    const primaryCompanyId = primaryAssoc ? primaryAssoc.toObjectId : companies[0].toObjectId;
    
    // Get company details
    const companyDetails = [];
    for (const companyAssoc of companies.slice(0, 10)) { // Limit to 10 companies max
      const details = await getCompanyDetails(companyAssoc.toObjectId);
      if (details) companyDetails.push(details);
      await sleep(100);
    }
    
    const primaryCompany = companyDetails.find(c => c.id === primaryCompanyId.toString()) || companyDetails[0];
    
    if (!primaryCompany) {
      console.log('  ⚠️  No company details - skipping');
      continue;
    }
    
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
      // Try fallback location database
      const fallback = fallbackLocations[deal.id];
      if (fallback) {
        coords = { lat: fallback.lat, lng: fallback.lng };
        console.log(`  📍 Using fallback location: ${fallback.city}, ${fallback.state}`);
      } else {
        console.log('  ⚠️  Could not geocode (no fallback available)');
        continue;
      }
    }
    
    dealsWithCoords++;
    
    // Build base deal object
    const baseDeal = {
      id: deal.id,
      name: props.dealname,
      stage: stageName,
      color: color,
      owner: ownerName,
      gbv: gbv,
      properties: properties,
      keys: keys,
      closeDate: props.closedate || null
    };
    
    // HQ View
    hqView.push({
      ...baseDeal,
      viewType: 'hq',
      companyName: primaryCompany.properties.name,
      lat: coords.lat,
      lng: coords.lng,
      city: hqCity,
      state: hqState,
      country: hqCountry,
      totalProperties: properties || companyDetails.length,
      totalCompanies: companyDetails.length
    });
    
    // Property View
    if (companyDetails.length > 1) {
      multiPropertyDeals++;
      console.log(`  🏨 ${companyDetails.length} properties`);
      
      // Create dots for each company (with slight offset to avoid overlap)
      for (let j = 0; j < companyDetails.length; j++) {
        const company = companyDetails[j];
        const latOffset = (Math.random() - 0.5) * 0.02;
        const lngOffset = (Math.random() - 0.5) * 0.02;
        
        propertyView.push({
          ...baseDeal,
          viewType: 'property',
          companyId: company.id,
          companyName: company.properties.name,
          lat: coords.lat + latOffset,
          lng: coords.lng + lngOffset,
          city: company.properties.city || hqCity,
          state: company.properties.state || hqState,
          country: company.properties.country || hqCountry,
          isPrimary: company.id === primaryCompany.id,
          // Keep full metrics on primary company only (don't divide - GBV is per-deal, not per-company)
          gbv: company.id === primaryCompany.id ? gbv : 0,
          properties: company.id === primaryCompany.id ? properties : 0,
          keys: company.id === primaryCompany.id ? keys : 0
        });
      }
    } else {
      // Single property
      propertyView.push({
        ...baseDeal,
        viewType: 'property',
        companyId: primaryCompany.id,
        companyName: primaryCompany.properties.name,
        lat: coords.lat,
        lng: coords.lng,
        city: hqCity,
        state: hqState,
        country: hqCountry,
        isPrimary: true
      });
    }
    
    console.log(`  ✓ Added to both views`);
  }
  
  // 4. Write output file
  console.log('\n💾 Writing deals-data-dual.js...');
  
  const output = {
    propertyView: propertyView,
    hqView: hqView,
    meta: {
      generated: new Date().toISOString(),
      totalDeals: deals.length,
      dealsWithCoords: dealsWithCoords,
      propertyViewDots: propertyView.length,
      hqViewDots: hqView.length,
      multiPropertyDeals: multiPropertyDeals
    }
  };
  
  const jsContent = `// Journey Alliance Deals Data - Dual View
// Auto-generated from HubSpot API: ${new Date().toISOString()}
// Total Deals: ${deals.length} | Property View: ${propertyView.length} dots | HQ View: ${hqView.length} dots

const dualViewData = ${JSON.stringify(output, null, 2)};
`;
  
  fs.writeFileSync('deals-data-dual.js', jsContent);
  
  console.log('\n✅ Sync Complete!');
  console.log(`   Total deals: ${deals.length}`);
  console.log(`   With coordinates: ${dealsWithCoords}`);
  console.log(`   Property View dots: ${propertyView.length}`);
  console.log(`   HQ View dots: ${hqView.length}`);
  console.log(`   Multi-property deals: ${multiPropertyDeals}`);
}

main().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
