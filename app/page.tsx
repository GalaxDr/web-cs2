"use client"

import { useState } from "react"
import Image from "next/image"
import { Search, Package2, Loader2, XCircle, Link as LinkIcon, TrendingUp, ShoppingCart, Copy, CheckCircle2, ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

// The interface for a skin
interface Skin {
  skin: string
  wear: string
  price: number | string
  imageUrl: string
}

const BOT_TRADELINK = process.env.NEXT_PUBLIC_BOT_TRADELINK

export default function CSInventoryFetcher() {
  const [tradeLink, setTradeLink] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inventoryData, setInventoryData] = useState<Skin[] | null>(null)
  const [fetchedSteamId, setFetchedSteamId] = useState<string | null>(null)
  const [totalPrice, setTotalPrice] = useState<number>(0)
  const [copied, setCopied] = useState(false)
  const [showSellDialog, setShowSellDialog] = useState(false)

  const handleFetchInventory = async () => {
    if (!tradeLink.trim()) {
      setError("Please paste a valid Steam Trade Link.")
      return
    }

    setLoading(true)
    setError(null)
    setInventoryData(null)
    setFetchedSteamId(null)
    setTotalPrice(0)

    try {
      const url = new URL(tradeLink)
      const partnerId = url.searchParams.get("partner")

      if (!partnerId || !/^\d+$/.test(partnerId)) {
        throw new Error("The Trade Link is invalid or does not contain a partner ID.")
      }
      
      const steamId64 = (BigInt(partnerId) + BigInt("76561197960265728")).toString()
      setFetchedSteamId(steamId64)
      

      const response = await fetch(`/api/inventory/${steamId64}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `The API returned an error: ${response.statusText}`)
      }

      const data: Skin[] = await response.json()
      
      // 1. Filter the data to exclude items with a price <= $0.01
      const filteredData = data.filter(item => {
        const price = typeof item.price === 'string' ? parseFloat(item.price) : item.price;
        return typeof price === 'number' && price > 0.01;
      });

      // 2. Convert string prices to numbers for consistent sorting and calculation
      const processedData = filteredData.map(item => ({
        ...item,
        price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
      }));
      
      if (processedData.length === 0) {
        setError("Inventory found, but it's empty or contains no skins valued over $0.01.")
      } else {
        // 3. Sort the filtered data by price (descending)
        const sortedData = [...processedData].sort((a, b) => {
          const priceA = typeof a.price === 'number' ? a.price : -1;
          const priceB = typeof b.price === 'number' ? b.price : -1;
          return priceB - priceA;
        });

        // 4. Calculate the total price from the filtered data
        const newTotalPrice = sortedData.reduce((sum, item) => {
          return sum + (typeof item.price === 'number' ? item.price : 0);
        }, 0);

        setTotalPrice(newTotalPrice);
        setInventoryData(sortedData)
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

  const handleCopyTradeLink = async () => {
    try {
      if (BOT_TRADELINK) {
        await navigator.clipboard.writeText(BOT_TRADELINK)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        throw new Error("Trade link is not available.")
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">CS2 Skins Seller</h1>
          <p className="text-muted-foreground">
            Paste a Steam Trade Link to view and sell your skins.
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
                  Showing {inventoryData.length} skins valued over $0.01 for SteamID: {fetchedSteamId}
                </CardDescription>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-2xl font-bold text-primary pt-2">
                    <TrendingUp className="h-6 w-6" />
                    Total Value: ${totalPrice.toFixed(2)}
                  </div>
                  <Dialog open={showSellDialog} onOpenChange={setShowSellDialog}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Sell Skins
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Sell Your Skins</DialogTitle>
                        <DialogDescription>
                          Send a trade offer to our bot to sell your skins. Copy the trade link below and send your items.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex items-center space-x-2 pt-4">
                        <div className="grid flex-1 gap-2">
                          <Input
                            id="bot-trade-link"
                            defaultValue={BOT_TRADELINK}
                            readOnly
                            className="text-sm"
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="px-3"
                          onClick={handleCopyTradeLink}
                        >
                          {copied ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="flex justify-center pt-4">
                        <Button
                          asChild
                          className="flex items-center gap-2"
                          variant="default"
                        >
                          <a
                            href={BOT_TRADELINK}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open Trade Link
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                      <div className="text-sm text-muted-foreground pt-4">
                        <p className="font-semibold mb-2">How to sell:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Click &quot;Open Trade Link&quot; or copy the link above</li>
                          <li>Select the skins you want to sell</li>
                          <li>Send the trade offer</li>
                          <li>Receive payment after trade confirmation</li>
                        </ol>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>Skin</TableHead>
                      <TableHead>Wear</TableHead>
                      <TableHead className="text-right">Price (Dollars)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryData.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {item.imageUrl ? (
                            <Image 
                              src={item.imageUrl} 
                              alt={item.skin} 
                              width={64} 
                              height={64}
                              className="rounded-md bg-gray-800"
                              unoptimized // Necessary for external image domains
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-md bg-gray-800 flex items-center justify-center">
                              <Package2 className="h-8 w-8 text-gray-500" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{item.skin}</TableCell>
                        <TableCell className="text-muted-foreground">{item.wear}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : item.price}
                        </TableCell>
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
                Don&apos;t know your Trade Link? Find it here <LinkIcon className="h-3 w-3" />
              </a>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}