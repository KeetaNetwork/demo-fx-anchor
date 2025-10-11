# Demo FX Anchor

A demonstration Foreign Exchange (FX) anchor implementation for the Keeta Network that provides currency conversion services between different tokens.

## Overview

This project implements an FX Anchor server that handles foreign exchange conversion requests between various currencies on the Keeta Network. It demonstrates how to build a compliant anchor service that can provide conversion rates, process exchange requests, and integrate with the Keeta Network infrastructure.

## Architecture

The project is organized as a monorepo with the following structure:

-   **`apps/api`** - Core FX anchor server implementation

    -   Express-based HTTP server that implements the Keeta FX Anchor protocol
    -   Exchange rate calculation and conversion logic
    -   Token information retrieval from the Keeta Network

-   **`apps/cloud`** - Infrastructure as Code using Pulumi

    -   GCP Cloud Run deployment configuration
    -   Docker image build and registry management
    -   Load balancing and SSL certificate configuration

-   **`deployment`** - Deployment scripts and configuration
    -   Pulumi stack configurations
    -   Environment-specific settings

## Features

-   **Affinity-based Conversions**: Supports both "from" and "to" currency affinity modes
-   **Precision Handling**: Properly converts amounts between tokens with different precision
-   **Zero-fee Demo Mode**: Configured with zero network and processing fees for demonstration purposes
-   **Cloud-Ready**: Includes Docker containerization and GCP Cloud Run deployment
-   **Comprehensive Testing**: Includes unit tests for core conversion logic

## Prerequisites

-   **Node.js**: v20.18.0 (see `.nvmrc`)
-   **npm**: Latest version

## Installation

```bash
# Install dependencies
make install

# Build the project
make
```

## Configuration

The server requires the following environment variables:

| Variable        | Description                               | Required | Default |
| --------------- | ----------------------------------------- | -------- | ------- |
| `APP_SEED`      | Seed phrase for the Keeta Network account | Yes      | -       |
| `PORT`          | HTTP server port                          | No       | `8080`  |
| `APP_LOG_LEVEL` | Logging level (DEBUG, INFO, WARN, ERROR)  | No       | `WARN`  |

### Example Configuration

```bash
export APP_SEED="your-seed-phrase-here"
export PORT=8080
export APP_LOG_LEVEL=DEBUG
```

## Usage

### Development Mode

Start the development server with hot-reload:

```bash
npm run dev
```

The server will start on port 8080 (or the port specified in the `PORT` environment variable).

### Production Build

Build the project for production:

```bash
make
```

### Running Tests

Execute the test suite:

```bash
make test
```

## Development

### Project Structure

```
demo-fx-anchor/
├── apps/
│   ├── api/                    # FX Anchor server
│   │   └── src/
│   │       ├── app.ts          # FX handler implementation
│   │       ├── server.ts       # Server configuration
│   │       ├── main.ts         # Entry point
│   │       ├── Dockerfile      # Container configuration
│   │       └── utils/          # Utility functions
│   │           ├── config.ts   # Environment configuration
│   │           ├── network.ts  # Network utilities
│   │           └── rates.ts    # Exchange rate logic
│   └── cloud/                  # Pulumi infrastructure
│       └── index.ts            # GCP deployment config
├── deployment/                 # Deployment configuration
│   └── index.ts                # Pulumi stack setup
├── utils/                      # Build and dev scripts
├── Makefile                    # Build automation
└── package.json                # Project metadata
```

### Key Implementation Details

#### Exchange Rate Calculation

The anchor uses an example USD-based rate table for all conversions.
The example rates use the token name for matching, however in production usage, using the token publicKeyString would be more reliable

When converting between two non-USD currencies:

1. Converts the source currency to USD
2. Converts from USD to the destination currency
3. Applies proper precision between different tokens for the conversions

See `apps/api/src/utils/rates.ts` for the implementation.  For real-time rates, an integration with an external source would be required.

#### Affinity Modes

-   **From affinity**: The `amount` represents the source currency, and the server calculates the destination amount
-   **To affinity**: The `amount` represents the destination currency, and the server calculates the source amount

## Support

For issues or questions:

-   GitHub: [https://github.com/keetanetwork/demo-fx-anchor](https://github.com/keetanetwork/demo-fx-anchor)
-   Author: Keeta, Inc
