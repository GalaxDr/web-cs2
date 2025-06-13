// app/api/inventory/[steamid]/route.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as cheerio from 'cheerio';
import mysql, { Pool, RowDataPacket, PoolConnection } from 'mysql2/promise';

// --- SINGLETON POOL CONFIGURATION ---
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      waitForConnections: true,
      connectionLimit: 2,
      queueLimit: 5,
      multipleStatements: false,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 10000,
      idleTimeout: 30000,
      maxIdle: 1,
    });

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
      connection.query('SET SESSION wait_timeout = 300');
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
  index: number; // Adicionar índice para manter itens únicos
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

// Função simplificada - gera apenas o nome exato esperado no banco
function generateMarketHashName(item: ScrapedItem): string {
  const baseName = item.name.trim();
  const isStatTrak = item.category.includes('StatTrak');
  const isSouvenir = item.category.includes('Souvenir');
  
  if (item.isAgent) {
    // Agentes não têm condição no nome
    return baseName;
  }
  
  let prefix = '';
  
  // Adicionar estrela para facas e luvas
  if (item.isKnife || item.isGloves) {
    prefix = '★ ';
  }
  
  // Adicionar StatTrak ou Souvenir
  if (isStatTrak) {
    prefix += 'StatTrak™ ';
  } else if (isSouvenir) {
    prefix += 'Souvenir ';
  }
  
  // Para vanilla, apenas o nome
  if (item.wear === 'Vanilla' || !item.wear) {
    return `${prefix}${baseName}`;
  }
  
  // Para outros, adicionar condição
  return `${prefix}${baseName} (${item.wear})`;
}

// Busca otimizada com índice para preservar duplicatas
async function searchItemsBatchOptimized(items: ScrapedItem[]): Promise<Map<number, BuffInfoRow>> {
  let connection: PoolConnection | null = null;
  const itemMap = new Map<number, BuffInfoRow>();
  
  try {
    connection = await getPool().getConnection();
    console.log('✅ Connection acquired for batch search');
    
    // Mapear cada item para seu market_hash_name esperado
    const itemsWithHashNames = items.map(item => ({
      item,
      hashName: generateMarketHashName(item)
    }));
    
    console.log(`🔍 Searching for ${items.length} items`);
    
    // Buscar em chunks
    const CHUNK_SIZE = 50;
    
    for (let i = 0; i < itemsWithHashNames.length; i += CHUNK_SIZE) {
      const chunk = itemsWithHashNames.slice(i, i + CHUNK_SIZE);
      const hashNames = chunk.map(c => c.hashName);
      const placeholders = hashNames.map(() => '?').join(',');
      
      try {
        const [rows] = await connection.execute<BuffInfoRow[]>(
          `SELECT market_hash_name, priceBuff, icon_url 
           FROM buffinfo 
           WHERE market_hash_name IN (${placeholders})`,
          hashNames
        );
        
        // Mapear resultados usando o índice do item
        for (const row of rows) {
          const matchingItems = chunk.filter(c => c.hashName === row.market_hash_name);
          for (const matched of matchingItems) {
            console.log(`✅ Found: "${row.market_hash_name}" -> ${row.priceBuff}`);
            itemMap.set(matched.item.index, row);
          }
        }
        
        console.log(`📊 Chunk ${Math.floor(i / CHUNK_SIZE) + 1}: Found ${rows.length} matches`);
      } catch (error) {
        console.error(`❌ Error in chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, error);
      }
    }
    
    // Identificar itens não encontrados para busca aproximada
    const notFoundItems = items.filter(item => !itemMap.has(item.index));
    
    if (notFoundItems.length > 0) {
      console.log(`🔎 Approximate search for ${notFoundItems.length} items not found`);
      
      // Busca aproximada apenas para agentes (que podem ter variações no nome)
      const agents = notFoundItems.filter(item => item.isAgent);
      
      for (const agent of agents) {
        try {
          const nameParts = agent.name.split(' | ');
          const [agentRows] = await connection.execute<BuffInfoRow[]>(
            `SELECT market_hash_name, priceBuff, icon_url 
             FROM buffinfo 
             WHERE market_hash_name LIKE ? 
                AND market_hash_name LIKE ?
             LIMIT 1`,
            [`%${nameParts[0]}%`, `%${nameParts[1] || ''}%`]
          );
          
          if (agentRows.length > 0) {
            console.log(`🔍 Agent match: "${agent.name}" -> "${agentRows[0].market_hash_name}"`);
            itemMap.set(agent.index, agentRows[0]);
          }
        } catch (error) {
          console.error(`❌ Error searching agent "${agent.name}":`, error);
        }
      }
      
      // Log de itens não encontrados
      const stillNotFound = items.filter(item => !itemMap.has(item.index));
      for (const item of stillNotFound) {
        console.log(`❌ NOT FOUND: "${generateMarketHashName(item)}" [${item.category}]`);
      }
    }
    
    console.log(`📊 Final results: ${itemMap.size}/${items.length} items found`);
    
  } catch (error) {
    console.error('❌ Database error in batch search:', error);
    throw error;
  } finally {
    if (connection) {
      try {
        connection.release();
        console.log('🔵 Connection released');
      } catch (releaseError) {
        console.error('❌ Error releasing connection:', releaseError);
      }
    }
  }
  
  return itemMap;
}

// Função enrichAllItems otimizada
async function enrichAllItems(items: ScrapedItem[]): Promise<FinalItemInfo[]> {
  const enrichedInventory: FinalItemInfo[] = [];
  
  try {
    const itemMap = await searchItemsBatchOptimized(items);
    console.log(`📊 Found ${itemMap.size} total matches in database`);
    
    for (const item of items) {
      const itemData: FinalItemInfo = {
        skin: item.name,
        wear: item.isAgent ? "Agent" : (item.isGloves ? "Gloves" : item.wear),
        price: 'N/A',
        imageUrl: ''
      };
      
      // Procurar resultado usando o índice
      const dbResult = itemMap.get(item.index);
      if (dbResult) {
        itemData.price = dbResult.priceBuff || 0.0;
        itemData.imageUrl = dbResult.icon_url || '';
      }
      
      // Ajustar nome para exibição
      let displayName = item.name;
      if (item.category.includes('StatTrak')) displayName = `StatTrak™ ${displayName}`;
      if ((item.isKnife || item.isGloves) && !displayName.startsWith('★')) displayName = `★ ${displayName}`;
      itemData.skin = displayName;
      
      enrichedInventory.push(itemData);
    }
    
    const foundItems = enrichedInventory.filter(item => item.price !== 'N/A').length;
    console.log(`✅ Processing complete: ${foundItems}/${enrichedInventory.length} items found`);
    
    return enrichedInventory;
    
  } catch (error) {
    console.error('❌ Error in enrichAllItems:', error);
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
      throw new Error("Inventory page did not load correctly. Please try again later.");
    }
    
    // --- 2. PARSE ITEMS ---
    const scrapedItems: ScrapedItem[] = [];
    let itemIndex = 0;
    
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
        scrapedItems.push({ 
          name: itemName, 
          wear: itemWear, 
          category: itemCategory, 
          isAgent, 
          isKnife, 
          isGloves,
          index: itemIndex++ // Adicionar índice único
        });
      }
    });

    if (scrapedItems.length === 0) {
      return NextResponse.json({ error: "No valid items found. The inventory might be empty or private." }, { status: 404 });
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

// Cleanup function for graceful shutdown
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