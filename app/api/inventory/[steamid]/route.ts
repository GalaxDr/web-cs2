// app/api/inventory/[steamid]/route.ts

import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(
  request: Request,
  { params }: { params: { steamid: string } }
) {

  const resolvedParams = await Promise.resolve(params);
  const steamId = resolvedParams.steamid; 

  const cookieString = process.env.CSGO_EXCHANGE_COOKIE;

  if (!cookieString || cookieString.includes("PASTE_YOUR_NEW_COOKIE_HERE")) {
    console.error("CRITICAL ERROR: The csgo.exchange cookie needs to be updated in the API code.");
    return NextResponse.json(
      { error: "The server needs a valid session cookie to work. Please update the cookie in the route.ts file." },
      { status: 500 }
    );
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
      return NextResponse.json({ error: "No skins found. Your inventory might be private." }, { status: 404 });
    }

    console.log(`API Route: Found ${cleanedInventory.length} skins with wear.`);
    return NextResponse.json(cleanedInventory);

  } catch (error: unknown) {
    console.error('API Route Error:', error);
    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json(
      { error: `Failed to fetch data: ${errorMessage}` },
      { status: 500 }
    );
  }
}
