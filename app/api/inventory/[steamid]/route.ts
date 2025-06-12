// app/api/inventory/[steamid]/route.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as cheerio from 'cheerio';
import mysql, { Pool, RowDataPacket, PoolConnection } from 'mysql2/promise';

// --- SINGLETON POOL CONFIGURATION ---
// This ensures only one pool is created across all API calls
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 2, // Slightly increased for better performance
      queueLimit: 5, // Limit queue to prevent memory issues
      multipleStatements: false,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000, // 10 seconds
      idleTimeout: 30000, // 30 seconds - reduced to free connections faster
      maxIdle: 1, // Keep at most 1 idle connection
    });

    // Monitor pool events
    pool.on('acquire', function (connection) {
      console.log('🔗 Connection %d acquired', connection.threadId);
    });

    pool.on('release', function (connection) {
      console.log('🔗 Connection %d released', connection.threadId);
    });

    pool.on('enqueue', function () {
      console.log('⏳ Waiting for available connection slot');
    });

    pool.on('connection', function (connection) {
      console.log('🆕 New connection established');
      // Set connection-level timeout to prevent hanging connections
      connection.query('SET SESSION wait_timeout = 300'); // 5 minutes
      connection.query('SET SESSION interactive_timeout = 300');
    });
  }
  return pool;
}

// --- TYPE DEFINITIONS ---
interface ScrapedItem {
  name: string;
  wear: string;
  category: string;
  isAgent: boolean;
  isKnife: boolean;
  isGloves: boolean;
}

interface FinalItemInfo {
  skin: string;
  wear: string;
  price: number | string;
  imageUrl: string;
}

interface BuffInfoRow extends RowDataPacket {
  market_hash_name: string;
  priceBuff: number;
  icon_url: string;
}

// Generates name variations for database search
function generateSearchVariations(item: ScrapedItem): string[] {
  const variations: string[] = [];
  const baseName = item.name.trim();
  
  let statTrakPrefix = '';
  let souvenirPrefix = '';
  let starPrefix = '';
  
  if (item.category.includes('StatTrak')) {
    statTrakPrefix = 'StatTrak™ ';
  }
  if (item.category.includes('Souvenir')) {
    souvenirPrefix = 'Souvenir ';
  }
  if ((item.isKnife || item.isGloves) && !baseName.startsWith('★')) {
    starPrefix = '★ ';
  }
  
  if (item.isAgent) {
    // Agents have different name patterns in the database
    variations.push(
      baseName,                                    // "Ground Rebel | Elite Crew"
      `${baseName} | ${item.wear}`,                  // "Ground Rebel | Elite Crew | Vanilla"
      `Agent | ${baseName}`,                         // "Agent | Ground Rebel | Elite Crew"
      `${baseName} | Agent`,                         // "Ground Rebel | Elite Crew | Agent"
      baseName.replace(' | ', ', '),                 // "Ground Rebel, Elite Crew"
      baseName.split(' | ').reverse().join(' | ')  // "Elite Crew | Ground Rebel"
    );
    
    // With StatTrak
    if (statTrakPrefix) {
      variations.push(
        `${statTrakPrefix}${baseName}`,
        `${starPrefix}${statTrakPrefix}${baseName}`
      );
    }
    
    // Specific log for debugging agents
    console.log(`🕵️ Agent variations for "${baseName}":`, variations);
  }
  else if (item.isKnife) {
    if (item.wear === 'Vanilla' || !item.wear) {
      variations.push(
        `${starPrefix}${statTrakPrefix}${baseName}`,
        `${statTrakPrefix}${baseName}`,
        `★ ${baseName}`,
        baseName,
        item.wear
      );
    } else {
      variations.push(
        `${starPrefix}${statTrakPrefix}${baseName} (${item.wear})`,
        `${statTrakPrefix}${baseName} (${item.wear})`,
        `★ ${baseName} (${item.wear})`,
        `${baseName} (${item.wear})`,
        item.wear
      );
    }
  }
  else if (item.isGloves) {
    variations.push(
      `${starPrefix}${statTrakPrefix}${baseName} (${item.wear})`,
      `${statTrakPrefix}${baseName} (${item.wear})`,
      `★ ${baseName} (${item.wear})`,
      `${baseName} (${item.wear})`,
      `${starPrefix}${statTrakPrefix}${baseName}`,
      `${baseName}`,
      item.wear
    );
  }
  else {
    variations.push(
      `${souvenirPrefix}${statTrakPrefix}${baseName} (${item.wear})`,
      `${statTrakPrefix}${baseName} (${item.wear})`,
      `${baseName} (${item.wear})`,
      item.wear,
    );
  }
  
  return [...new Set(variations)].filter(v => v.trim().length > 0);
}

// Optimized batch search with a single query
async function searchItemsBatch(items: ScrapedItem[]): Promise<Map<string, BuffInfoRow>> {
  let connection: PoolConnection | null = null;
  const itemMap = new Map<string, BuffInfoRow>();
  
  try {
    // Generate all variations for all items
    const allVariations: string[] = [];
    const variationToItem = new Map<string, ScrapedItem>();
    
    for (const item of items) {
      const variations = generateSearchVariations(item);
      for (const variation of variations) {
        allVariations.push(variation);
        variationToItem.set(variation, item);
      }
    }
    
    if (allVariations.length === 0) return itemMap;
    
    console.log(`🔍 Searching for ${allVariations.length} variations from ${items.length} items`);
    
    // Get connection with timeout
    const connectionPromise = getPool().getConnection();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    );
    
    connection = await Promise.race([connectionPromise, timeoutPromise]);
    console.log('✅ Connection acquired successfully');
    
    // Process in chunks to avoid a query that is too large
    const CHUNK_SIZE = 100;
    for (let i = 0; i < allVariations.length; i += CHUNK_SIZE) {
      const chunk = allVariations.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      
      try {
        const [rows] = await connection.execute<BuffInfoRow[]>(
          `SELECT market_hash_name, priceBuff, icon_url 
           FROM buffinfo 
           WHERE market_hash_name IN (${placeholders})`,
          chunk
        );
        
        // Map results
        for (const row of rows) {
          itemMap.set(row.market_hash_name, row);
        }
        
        console.log(`✅ Found ${rows.length} items in chunk ${Math.floor(i / CHUNK_SIZE) + 1}`);
      } catch (error) {
        console.error(`❌ Error processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, error);
        // Continue processing other chunks even if one fails
      }
      
      // Small delay between chunks
      if (i + CHUNK_SIZE < allVariations.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    // For items not found, try an approximate search
    const notFoundItems = items.filter(item => {
      const variations = generateSearchVariations(item);
      return !variations.some(v => itemMap.has(v));
    });
    
    if (notFoundItems.length > 0) {
      console.log(`🔎 Trying approximate search for ${notFoundItems.length} items not found`);
      
      for (const item of notFoundItems) {
        try {
          // Search using LIKE for partial matches, escaping SQL wildcards
          const searchPattern = `%${item.name.replace(/[%_]/g, '\\$&')}%`;
          const [likeRows] = await connection.execute<BuffInfoRow[]>(
            `SELECT market_hash_name, priceBuff, icon_url 
             FROM buffinfo 
             WHERE market_hash_name LIKE ? 
             LIMIT 5`,
            [searchPattern]
          );
          
          if (likeRows.length > 0) {
            console.log(`🔍 Approximate matches for "${item.name}":`, likeRows.map(r => r.market_hash_name));
            // Use the first match
            itemMap.set(likeRows[0].market_hash_name, likeRows[0]);
          }
        } catch (error) {
          console.error(`❌ Error in approximate search for "${item.name}":`, error);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Database connection error:', error);
    throw error;
  } finally {
    // ALWAYS release the connection
    if (connection) {
      try {
        connection.release();
        console.log('🔵 Connection released in searchItemsBatch');
      } catch (releaseError) {
        console.error('❌ Error releasing connection:', releaseError);
        // Force destroy if release fails
        try {
          (connection as PoolConnection & { destroy(): void }).destroy();
        } catch (destroyError) {
          console.error('❌ Error destroying connection:', destroyError);
        }
      }
    }
  }
  
  return itemMap;
}


// Process all items using batch queries
async function enrichAllItems(items: ScrapedItem[]): Promise<FinalItemInfo[]> {
  const enrichedInventory: FinalItemInfo[] = [];
  
  try {
    // Get all matches in batch
    const itemMap = await searchItemsBatch(items);
    console.log(`📊 Found ${itemMap.size} total matches in database`);
    
    // Process each item
    for (const item of items) {
      const variations = generateSearchVariations(item);
      let found = false;
      
      const itemData: FinalItemInfo = {
        skin: item.name,
        wear: item.isAgent ? "Agent" : (item.isGloves ? "Gloves" : item.wear),
        price: 'N/A',
        imageUrl: ''
      };
      
      // Check each variation
      for (const variation of variations) {
        const dbItem = itemMap.get(variation);
        if (dbItem) {
          console.log(`✅ Found: "${variation}" -> Price: ${dbItem.priceBuff}`);
          itemData.price = dbItem.priceBuff || 0.0;
          itemData.imageUrl = dbItem.icon_url || '';
          found = true;
          break;
        }
      }
      
      // If not found by exact match, check if it was found by approximate search
      if (!found) {
        // Check if any key in itemMap contains the item name
        for (const [key, value] of itemMap.entries()) {
          if (key.toLowerCase().includes(item.name.toLowerCase())) {
            console.log(`✅ Found by approximate match: "${key}" for "${item.name}" -> Price: ${value.priceBuff}`);
            itemData.price = value.priceBuff || 0.0;
            itemData.imageUrl = value.icon_url || '';
            found = true;
            break;
          }
        }
      }
      
      if (!found) {
        console.log(`❌ Not found: ${item.name} (${item.wear})`);
        // Log all variations tried for debugging
        if (item.isAgent) {
          console.log(`   Tried variations: ${variations.join(', ')}`);
        }
      }
      
      // Adjust display name
      let displayName = item.name;
      if (item.category.includes('StatTrak')) displayName = `StatTrak™ ${displayName}`;
      if ((item.isKnife || item.isGloves) && !displayName.startsWith('★')) displayName = `★ ${displayName}`;
      itemData.skin = displayName;
      
      enrichedInventory.push(itemData);
    }
    
    const foundItems = enrichedInventory.filter(item => item.price !== 'N/A').length;
    console.log(`✅ Processing complete: ${foundItems}/${enrichedInventory.length} items found in database`);
    
    return enrichedInventory;
    
  } catch (error) {
    console.error('❌ Error in enrichAllItems:', error);
    // Return all items without prices on error
    return items.map(item => ({
      skin: item.name,
      wear: item.isAgent ? "Agent" : (item.isGloves ? "Gloves" : item.wear),
      price: 'N/A',
      imageUrl: ''
    }));
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ steamid: string }> }
) {
  const { steamid: steamId } = await params;
  const cookieString = process.env.CSGO_EXCHANGE_COOKIE;

  if (!cookieString) {
    return NextResponse.json({ error: "Server configuration is incomplete. Cookie is missing." }, { status: 500 });
  }

  // Check if we can get a connection before proceeding
  let testConnection: PoolConnection | null = null;
  try {
    testConnection = await getPool().getConnection();
    console.log('✅ Test connection successful');
  } catch (error) {
    console.error('❌ Cannot connect to database:', error);
    return NextResponse.json({ 
      error: "Database connection unavailable. Too many connections.", 
      details: "The database server has reached its connection limit. Please try again later or contact the administrator."
    }, { status: 503 });
  } finally {
    // ALWAYS release test connection
    if (testConnection) {
      try {
        testConnection.release();
        console.log('🔵 Test connection released');
      } catch (releaseError) {
        console.error('❌ Error releasing test connection:', releaseError);
        try {
          (testConnection as PoolConnection & { destroy(): void }).destroy();
        } catch (destroyError) {
          console.error('❌ Error destroying test connection:', destroyError);
        }
      }
    }
  }

  const url = `https://csgo.exchange/inventory/${steamId}/retry/`;
  const headers = {
    'accept': 'text/html, */*; q=0.01',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'origin': 'https://csgo.exchange',
    'referer': `https://csgo.exchange/id/${steamId}`,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'x-requested-with': 'XMLHttpRequest',
    'Cookie': cookieString,
  };
  const body = 'r=1';

  try {
    // --- 1. FETCH DATA FROM CSGO.EXCHANGE ---
    console.log(`🌐 Fetching from csgo.exchange...`);
    const response = await fetch(url, { method: 'POST', headers, body, cache: 'no-store' });
    if (!response.ok) throw new Error(`csgo.exchange responded with status: ${response.status}`);
    
    const htmlContent = await response.text();
    const $ = cheerio.load(htmlContent);

    if ($('.contentItems').length === 0) {
      throw new Error("Inventory page did not load correctly. The cookie might have expired or the request was blocked.");
    }
    
    // --- 2. PARSE ITEMS ---
    const scrapedItems: ScrapedItem[] = [];
    $('.vItem').each((i, element) => {
      const itemWear = $(element).attr('data-exterior') || '';
      const itemQuality = $(element).attr('data-quality') || '';
      const itemCategory = $(element).attr('class') || '';
      const itemName = decodeURIComponent($(element).attr('data-search') || '').trim();

      const isAgent = ['Master', 'Superior', 'Exceptional', 'Distinguished'].includes(itemQuality);
      const isKnife = itemCategory.includes('Knife');
      const isGloves = itemCategory.includes('Gloves');
      const isSkinWithWear = itemWear && itemWear !== 'Vanilla';
      
      if ((isSkinWithWear || isKnife || isAgent || isGloves) && itemName) {
        scrapedItems.push({ name: itemName, wear: itemWear, category: itemCategory, isAgent, isKnife, isGloves });
      }
    });

    if (scrapedItems.length === 0) {
      return NextResponse.json({ error: "No valid items found. The inventory might be empty or the cookie has expired." }, { status: 404 });
    }

    console.log(`📦 ${scrapedItems.length} items extracted from inventory`);
    
    // --- 3. ENRICH WITH DATABASE ---
    const enrichedInventory = await enrichAllItems(scrapedItems);
    
    // Log pool status after processing
    const poolStatus = {
      allConnections: (getPool() as Pool & { _allConnections?: unknown[] })._allConnections?.length || 0,
      freeConnections: (getPool() as Pool & { _freeConnections?: unknown[] })._freeConnections?.length || 0,
      connectionQueue: (getPool() as Pool & { _connectionQueue?: unknown[] })._connectionQueue?.length || 0
    };
    console.log(`📊 Final pool status: ${JSON.stringify(poolStatus)}`);
    
    return NextResponse.json(enrichedInventory);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ API Error:', errorMessage);
    return NextResponse.json({ error: `Failed to fetch data: ${errorMessage}` }, { status: 500 });
  }
}

// Cleanup function for graceful shutdown (optional)
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, closing pool...');
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, closing pool...');
  if (pool) {
    await pool.end();
  }
  process.exit(0);
});
