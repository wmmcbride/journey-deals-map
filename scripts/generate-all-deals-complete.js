#!/usr/bin/env node
/**
 * Generate all-deals-complete.js
 * Pulls ALL 355 deals from HubSpot and merges with geocoded locations from deals-data-dual.js
 * Outputs a complete dataset for modal functionality
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.HUBSPOT_API_KEY;

if (!API_KEY) {
  console.error('❌ HUBSPOT_API_KEY environment variable not set');
  process.exit(1);
}

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

const STAGE_NAMES = {
  '239842175': 'Closed Won',
  '1294734116': 'Contracting',
  '1294734115': 'Decision & Approval',
  '1294734113': 'Solution & Business Alignment',
  '1294734112': 'Discovery & Stakeholders',
  '1294734111': 'Evaluation Accepted',
  '239842176': 'Closed Lost'
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
    const url = `https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,pipeline,hubspot_owner_id,closedate,createdate,amount,gbv,gbv__rollup_,hs_object_id${afterParam}`;
    
    const data = await fetchJSON(url);
    allDeals = allDeals.concat(data.results);
    
    if (!data.paging || !data.paging.next) break;
    after = data.paging.next.after;
    
    await sleep(100); // Rate limit protection
  }
  
  // Filter to Alliance New Business pipeline
  const allianceDeals = allDeals.filter(d => d.properties.pipeline === ALLIANCE_PIPELINE_ID);
  
  // Include ALL stages
  const allStageIds = Object.values(STAGE_IDS);
  const filteredDeals = allianceDeals.filter(d => allStageIds.includes(d.properties.dealstage));
  
  console.log(`  ✓ Found ${filteredDeals.length} Alliance deals`);
  return filteredDeals;
}

async function getOwnerName(ownerId) {
  if (!ownerId) return 'Unattributed';
  
  try {
    const url = `https://api.hubapi.com/crm/v3/owners/${ownerId}`;
    const data = await fetchJSON(url);
    return `${data.firstName} ${data.lastName}`;
  } catch(e) {
    return 'Unattributed';
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

function calculateDaysInStage(deal) {
  const createDate = new Date(deal.createdate);
  const now = new Date();
  const diffTime = Math.abs(now - createDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

async function main() {
  console.log('🚀 Generating all-deals-complete.js...\n');
  
  // 1. Get all deals from HubSpot
  const deals = await getAllDeals();
  
  // 2. Load existing geocoded data from deals-data-dual.js
  console.log('📍 Loading existing geocoded data...');
  let existingMappedDeals = new Map();
  
  try {
    const dealsDataPath = path.join(__dirname, '..', 'deals-data-dual.js');
    const dealsDataContent = fs.readFileSync(dealsDataPath, 'utf8');
    
    // Extract dealsDataProperty array
    const match = dealsDataContent.match(/const dealsDataProperty = (\[[\s\S]*?\]);/);
    if (match) {
      const dealsDataProperty = eval(match[1]);
      dealsDataProperty.forEach(deal => {
        if (deal.dealId) {
          existingMappedDeals.set(deal.dealId, {
            lat: deal.lat,
            lon: deal.lon,
            city: deal.city,
            state: deal.state,
            country: deal.country
          });
        }
      });
      console.log(`  ✓ Loaded ${existingMappedDeals.size} geocoded locations`);
    }
  } catch(e) {
    console.warn('  ⚠️  Could not load existing geocoded data:', e.message);
  }
  
  // 3. Get owner names cache
  console.log('👥 Fetching owner names...');
  const ownerCache = {};
  const uniqueOwnerIds = [...new Set(deals.map(d => d.properties.hubspot_owner_id).filter(Boolean))];
  
  for (const ownerId of uniqueOwnerIds) {
    ownerCache[ownerId] = await getOwnerName(ownerId);
    await sleep(100);
  }
  console.log(`  ✓ ${uniqueOwnerIds.length} owners cached`);
  
  // 4. Process each deal
  console.log('\n🏨 Processing deals...');
  const allDealsComplete = [];
  
  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];
    const props = deal.properties;
    
    if (i % 50 === 0) {
      console.log(`  [${i+1}/${deals.length}] Processing...`);
    }
    
    const dealId = deal.id;
    const stageName = STAGE_NAMES[props.dealstage] || 'Unknown';
    const ownerName = ownerCache[props.hubspot_owner_id] || 'Unattributed';
    const gbv = parseFloat(props.gbv__rollup_ || props.gbv || props.amount || 0);
    
    // Check if we have existing location data
    const existingLocation = existingMappedDeals.get(dealId);
    
    let dealData = {
      dealId: dealId,
      dealname: props.dealname || 'Unknown',
      dealstage: props.dealstage,
      stageName: stageName,
      gbv__rollup_: gbv,
      hubspot_owner_id: props.hubspot_owner_id || null,
      ownerName: ownerName,
      closedate: props.closedate || null,
      createdate: props.createdate || null,
      daysInStage: calculateDaysInStage(props),
      companyName: null,
      hasLocation: false,
      lat: null,
      lon: null,
      city: null,
      state: null,
      country: null
    };
    
    if (existingLocation) {
      dealData.hasLocation = true;
      dealData.lat = existingLocation.lat;
      dealData.lon = existingLocation.lon;
      dealData.city = existingLocation.city;
      dealData.state = existingLocation.state;
      dealData.country = existingLocation.country;
    }
    
    // Get company name
    try {
      const companies = await getDealCompanies(dealId);
      if (companies.length > 0) {
        const primaryAssoc = companies.find(c => 
          c.associationTypes && c.associationTypes.some(t => t.label === 'Primary')
        );
        const primaryCompanyId = primaryAssoc ? primaryAssoc.toObjectId : companies[0].toObjectId;
        
        const companyDetails = await getCompanyDetails(primaryCompanyId);
        if (companyDetails) {
          dealData.companyName = companyDetails.properties.name || null;
        }
        await sleep(100);
      }
    } catch(e) {
      // Continue without company name
    }
    
    allDealsComplete.push(dealData);
  }
  
  console.log(`  ✓ Processed ${allDealsComplete.length} deals`);
  
  // 5. Generate statistics
  const dealsWithLocation = allDealsComplete.filter(d => d.hasLocation).length;
  const dealsWithoutLocation = allDealsComplete.length - dealsWithLocation;
  
  console.log('\n📊 Statistics:');
  console.log(`   Total deals: ${allDealsComplete.length}`);
  console.log(`   With location: ${dealsWithLocation}`);
  console.log(`   Without location: ${dealsWithoutLocation}`);
  
  // Count by stage
  const stageBreakdown = {};
  allDealsComplete.forEach(deal => {
    if (!stageBreakdown[deal.stageName]) {
      stageBreakdown[deal.stageName] = 0;
    }
    stageBreakdown[deal.stageName]++;
  });
  
  console.log('\n📋 Stage Breakdown:');
  Object.entries(stageBreakdown).sort((a, b) => b[1] - a[1]).forEach(([stage, count]) => {
    console.log(`   ${stage}: ${count} deals`);
  });
  
  // 6. Write output file
  console.log('\n💾 Writing all-deals-complete.js...');
  
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const coverage = ((dealsWithLocation / allDealsComplete.length) * 100).toFixed(1);
  
  const jsContent = `// Journey Deals Map - Complete Dataset (All Deals)
// Generated: ${timestamp}
// Total deals: ${allDealsComplete.length}
// Mapped deals: ${dealsWithLocation}
// Unmapped deals: ${dealsWithoutLocation}
// Coverage: ${coverage}%

const allDealsComplete = ${JSON.stringify(allDealsComplete, null, 2)};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { allDealsComplete };
}
`;
  
  const outputPath = path.join(__dirname, '..', 'all-deals-complete.js');
  fs.writeFileSync(outputPath, jsContent);
  
  console.log('\n✅ Generation Complete!');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Total deals: ${allDealsComplete.length}`);
  console.log(`   Mapped: ${dealsWithLocation}`);
  console.log(`   Unmapped: ${dealsWithoutLocation}`);
}

main().catch(err => {
  console.error('❌ Generation failed:', err);
  process.exit(1);
});
