# CS Inventory Fetcher

A web application to fetch and evaluate CS2 inventories using Buff163 prices.

-----

## 🚀 Features

  * **Inventory Search**: Enter a Steam Trade Link to view any user's inventory.
  * **Real-time Valuation**: Up-to-date prices from Buff163 (Chinese market).
  * **Intuitive Interface**: Modern and responsive design.
  * **Quick Sell**: Integration with a trade bot for skin sales.
  * **Smart Filter**: Displays only items valued above $0.01.
  * **Full Support**: Skins, knives, gloves, agents, and StatTrak™/Souvenir items.

-----

## 🛠️ Technologies

  * **Frontend**: Next.js 14, React, TypeScript
  * **UI**: Tailwind CSS, shadcn/ui
  * **Backend**: Next.js API Routes
  * **Database**: MySQL (Buff163 prices)
  * **Web Scraping**: Cheerio (for csgo.exchange)

-----

## 📋 Prerequisites

  * Node.js 18+
  * MySQL 5.7+
  * Valid csgo.exchange cookie
  * Database with Buff163 prices

-----

## 🔧 Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/seu-usuario/cs-inventory-fetcher.git
    cd cs-inventory-fetcher
    ```

2.  **Install dependencies**

    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Configure environment variables**

    Create a `.env.local` file in the project root:

    ```env
    # Database
    DB_HOST=localhost
    DB_USER=your_user
    DB_PASSWORD=your_password
    DB_DATABASE=buffinfo

    # csgo.exchange cookie
    CSGO_EXCHANGE_COOKIE="your_cookie_here"

    # Bot Trade Link (optional - can be hardcoded)
    BOT_TRADELINK="https://steamcommunity.com/tradeoffer/new/?partner=197500738&token=Why1EBtH"
    ```

4.  **Database Structure**

    The `buffinfo` table should have the following structure:

    ```sql
    CREATE TABLE buffinfo (
      market_hash_name VARCHAR(255) PRIMARY KEY,
      priceBuff DECIMAL(10, 2),
      icon_url VARCHAR(500)
    );
    ```

5.  **Run the project**

    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

    Access [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000)

-----

## 📁 Project Structure

```
├── app/
│   ├── api/
│   │   └── inventory/
│   │       └── [steamid]/
│   │           └── route.ts      # API to fetch inventories
│   ├── layout.tsx
│   └── page.tsx                  # Main component
├── components/
│   └── ui/                       # shadcn/ui components
├── lib/
│   └── utils.ts
├── public/
├── .env.local                    # Environment variables
├── next.config.js
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

-----

## 🔍 How It Works

1.  **User Input**: The user pastes a Steam Trade Link.
2.  **SteamID Extraction**: The system extracts the partner ID and converts it to SteamID64.
3.  **Scraping**: An authenticated request is made to csgo.exchange.
4.  **Parsing**: Item information is extracted from the returned HTML.
5.  **Enrichment**: Prices are retrieved from the MySQL database.
6.  **Display**: Items are shown, sorted by value.

-----

## 🔐 Security

  * The csgo.exchange cookie is kept only on the server.
  * No user data is stored.
  * All requests are made server-side.
  * Rate limiting is recommended for production.

-----

## ⚡ Performance

  * **Connection Pool**: Maximum of 2 concurrent connections.
  * **Batch Fetching**: Optimized queries for multiple items.
  * **Caching**: Consider implementing Redis for price caching.
  * **Timeout**: Idle connections close after 30 seconds.

-----

## 🐛 Common Issues

### "Cookie has expired"

  * The csgo.exchange cookie needs to be renewed periodically.
  * Log in to the website and copy the new cookie.

### "Too many connections"

  * The pool is configured for a maximum of 2 connections.
  * Increase `connectionLimit` if necessary.

### Items not found

  * Verify that the name in the database exactly matches the expected format.
  * Agents: `Name | Organization`
  * Knives/Gloves: `★ Name (Condition)`
  * StatTrak™: `StatTrak™ Name (Condition)`

-----

## 📝 Development Notes

  * The system uses approximate search only for agents.
  * Duplicates are handled with unique indices.
  * Items valued $\\le $0.01$ are filtered on the frontend.
  * The connection pool is a singleton (shared across requests).

-----

## 🤝 Contributing

1.  Fork the project.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

-----

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

-----

## 👤 Author

Júlio César Becker @galaxdr

-----

## 🙏 Acknowledgments

  * [shadcn/ui](https://ui.shadcn.com/) for the components.
  * [csgo.exchange](https://csgo.exchange/) for inventory data.
  * [Buff163](https://buff.163.com/) for price reference.