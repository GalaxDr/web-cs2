// app/api/inventory/[steamid]/route.ts

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as cheerio from 'cheerio';

// Updated function signature for Next.js 15 - params is now a Promise
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ steamid: string }> }
) {
  // Await the params Promise to get the actual parameters
  const { steamid: steamId } = await params;

  const cookieString = process.env.CSGO_EXCHANGE_COOKIE;

  if (!cookieString) {
    console.error("CRITICAL ERROR: The CSGO_EXCHANGE_COOKIE environment variable is not set.");
    return NextResponse.json(
      { error: "Server configuration is incomplete. The session cookie is missing." },
      { status: 500 }
    );
  }
  
  // The logic remains a 1:1 match with the working Python script
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

  console.log(`API Route: Making POST request to ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store', // Disable cache to ensure we always fetch fresh data
    });

    if (!response.ok) {
      throw new Error(`csgo.exchange responded with status: ${response.status}`);
    }

    const htmlContent = await response.text();
    const $ = cheerio.load(htmlContent);
    const cleanedInventory: { skin: string; wear: string }[] = [];

    $('.vItem').each((i, element) => {
      const itemWear = $(element).attr('data-exterior') || '';
      if (itemWear && itemWear !== 'Vanilla') {
        const rawItemName = $(element).attr('data-search') || '';
        const cleanedItemName = decodeURIComponent(rawItemName);

        cleanedInventory.push({ 
          skin: cleanedItemName, 
          wear: itemWear 
        });
      }
    });

    if (cleanedInventory.length === 0) {
      return NextResponse.json({ error: "No skins found. The inventory might be private, or the session cookie for csgo.exchange has expired." }, { status: 404 });
    }

    console.log(`API Route: Found ${cleanedInventory.length} skins with wear.`);
    return NextResponse.json(cleanedInventory);

  } catch (error: unknown) {
    console.error('API Route Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to fetch data: ${errorMessage}` },
      { status: 500 }
    );
  }
}