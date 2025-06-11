"use client"

import { useState } from "react"
import { Search, Package2, Loader2, XCircle, Link } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Definindo o tipo da Skin para clareza
interface Skin {
  skin: string
  desgaste: string
}

export default function CSInventoryFetcher() {
  // O estado agora armazena o Trade Link completo
  const [tradeLink, setTradeLink] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inventoryData, setInventoryData] = useState<Skin[] | null>(null)
  const [fetchedSteamId, setFetchedSteamId] = useState<string | null>(null)

  const handleFetchInventory = async () => {
    if (!tradeLink.trim()) {
      setError("Por favor, cole um Steam Trade Link válido.")
      return
    }

    setLoading(true)
    setError(null)
    setInventoryData(null)
    setFetchedSteamId(null)

    try {
      // --- LÓGICA DE PARSING E CONVERSÃO ---
      const url = new URL(tradeLink)
      const partnerId = url.searchParams.get("partner")

      if (!partnerId || !/^\d+$/.test(partnerId)) {
        throw new Error("O Trade Link é inválido ou não contém um ID de parceiro.")
      }
      
      // Fórmula de conversão de Account ID (partner) para SteamID64
      const steamId64 = (BigInt(partnerId) + BigInt("76561197960265728")).toString()
      setFetchedSteamId(steamId64)
      
      console.log(`Trade Link Parsed. Partner ID: ${partnerId}, Converted to SteamID64: ${steamId64}`)

      // Chamada para nossa API Route com o SteamID64 convertido
      const response = await fetch(`/api/inventory/${steamId64}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `A API retornou um erro: ${response.statusText}`)
      }

      const data: Skin[] = await response.json()
      
      if (data.length === 0) {
        setError("Inventário encontrado, mas está vazio ou não contém skins com desgaste.")
      } else {
        setInventoryData(data)
      }

    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Ocorreu um erro desconhecido.")
      } else {
        setError("Ocorreu um erro desconhecido.")
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
            Cole um Steam Trade Link para ver o inventário de um usuário.
          </p>
        </header>

        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <Input
            placeholder="Cole o Steam Trade Link aqui..."
            value={tradeLink}
            onChange={(e) => setTradeLink(e.target.value)}
            className="flex-grow"
          />
          <Button onClick={handleFetchInventory} className="flex items-center gap-2" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar Inventário
          </Button>
        </div>

        <div className="w-full">
          {loading && (
            <div className="flex flex-col items-center justify-center p-12">
              <Loader2 className="h-12 w-12 animate-spin mb-4 text-primary" />
              <p className="text-muted-foreground">Buscando inventário, aguarde...</p>
            </div>
          )}

          {!loading && error && (
            <Alert variant="destructive" className="mb-6">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Erro</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!loading && !error && inventoryData && (
            <Card>
              <CardHeader>
                <CardTitle>Inventário Encontrado</CardTitle>
                <CardDescription>
                  Exibindo {inventoryData.length} skins para o SteamID: {fetchedSteamId}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Skin</TableHead>
                      <TableHead>Desgaste</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryData.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.skin}</TableCell>
                        <TableCell className="text-muted-foreground">{item.desgaste}</TableCell>
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
              <p className="text-muted-foreground">O inventário será exibido aqui.</p>
              <a 
                href="https://steamcommunity.com/id/me/tradeoffers/privacy#trade_offer_access_url" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-sm text-blue-500 hover:underline mt-2 flex items-center gap-1"
              >
                Não sabe seu Trade Link? Encontre aqui <Link className="h-3 w-3" />
              </a>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}