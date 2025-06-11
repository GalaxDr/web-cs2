"use client"

import { useState } from "react"
import { Search, Package2, Loader2, XCircle, Link } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Defining the Skin type for clarity
interface Skin {
  skin: string
  wear: string
}

export default function CSInventoryFetcher() {
  // State now holds the full Trade Link
  const [tradeLink, setTradeLink] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inventoryData, setInventoryData] = useState<Skin[] | null>(null)
  const [fetchedSteamId, setFetchedSteamId] = useState<string | null>(null)

  const handleFetchInventory = async () => {
    if (!tradeLink.trim()) {
      setError("Please paste a valid Steam Trade Link.")
      return
    }

    setLoading(true)
    setError(null)
    setInventoryData(null)
    setFetchedSteamId(null)

    try {
      // --- PARSING AND CONVERSION LOGIC ---
      const url = new URL(tradeLink)
      const partnerId = url.searchParams.get("partner")

      if (!partnerId || !/^\d+$/.test(partnerId)) {
        throw new Error("The Trade Link is invalid or does not contain a partner ID.")
      }
      
      // Formula to convert Account ID (partner) to SteamID64
      const steamId64 = (BigInt(partnerId) + BigInt("76561197960265728")).toString()
      setFetchedSteamId(steamId64)
      
      console.log(`Trade Link Parsed. Partner ID: ${partnerId}, Converted to SteamID64: ${steamId64}`)

      // Call our API Route with the converted SteamID64
      const response = await fetch(`/api/inventory/${steamId64}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `The API returned an error: ${response.statusText}`)
      }

      const data: Skin[] = await response.json()
      
      if (data.length === 0) {
        setError("Inventory found, but it's empty or contains no skins with wear.")
      } else {
        setInventoryData(data)
      }

    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "An unknown error occurred.")
      } else {
        setError("An unknown error occurred.")
      }
      setInventoryData(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">CS Inventory Fetcher</h1>
          <p className="text-muted-foreground">
            Paste a Steam Trade Link to view a user&#39;s inventory.
          </p>
        </header>

        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <Input
            placeholder="Paste the Steam Trade Link here..."
            value={tradeLink}
            onChange={(e) => setTradeLink(e.target.value)}
            className="flex-grow"
          />
          <Button onClick={handleFetchInventory} className="flex items-center gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {loading ? 'Fetching...' : 'Fetch Inventory'}
          </Button>
        </div>

        <div className="w-full">
          {loading && (
            <div className="flex flex-col items-center justify-center p-12">
              <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary" />
              <p className="text-muted-foreground">Fetching inventory, please wait...</p>
            </div>
          )}

          {!loading && error && (
            <Alert variant="destructive" className="mb-6">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && inventoryData && (
            <Card>
              <CardHeader>
                <CardTitle>Inventory Found</CardTitle>
                <CardDescription>
                  Showing {inventoryData.length} skins for SteamID: {fetchedSteamId}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Skin</TableHead>
                      <TableHead>Wear</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryData.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.skin}</TableCell>
                        <TableCell className="text-muted-foreground">{item.wear}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {!loading && !error && !inventoryData && (
            <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center">
              <Package2 className="h-16 w-16 mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">The inventory will be displayed here.</p>
              <a 
                href="https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-sm text-blue-500 hover:underline mt-2 flex items-center gap-1"
              >
                Don&#39;t know your Trade Link? Find it here <Link className="h-3 w-3" />
              </a>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
