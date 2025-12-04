# Cloud Data Infrastructure with Pulumi + Snowflake

Infrastructure-as-Code data pipeline provisioning AWS S3 and Snowflake resources using Pulumi (TypeScript).

## What This Project Does

- Provisions **11 cloud resources** across AWS and Snowflake using Pulumi IaC
- Creates automated data ingestion pipeline from S3 → Snowflake
- Loads **2.9M+ rows in ~33 seconds** using Snowflake's COPY INTO
- Reduces manual infrastructure setup from **2+ hours to under 5 minutes**

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Pulumi    │────▶│   AWS S3 Bucket  │────▶│   Snowflake     │
│  (IaC)      │     │   + IAM Role     │     │   Warehouse     │
└─────────────┘     └──────────────────┘     └─────────────────┘
                           │                        │
                           ▼                        ▼
                    ┌──────────────┐         ┌─────────────────┐
                    │  NYC Taxi    │         │ Storage         │
                    │  (Parquet)   │         │ Integration     │
                    └──────────────┘         └─────────────────┘
```

## Resources Provisioned (11)

**AWS (3 resources):**
1. S3 Bucket - Data landing zone with force destroy enabled
2. IAM Role - For Snowflake to assume via STS
3. IAM Role Policy - S3 read permissions (GetObject, ListBucket)

**Snowflake (8 resources):**
4. Warehouse - X-SMALL with auto-suspend (60s)
5. Database - DATA_PIPELINE_DB
6. Schema - RAW
7. Storage Integration - S3 connection with IAM role
8. File Format (CSV) - With header skip and null handling
9. File Format (Parquet) - For large datasets
10. External Stage - S3 mount point
11. Table - TAXI_DATA with 11 columns

## Prerequisites

1. **Pulumi CLI** - `brew install pulumi` or https://www.pulumi.com/docs/install/
2. **Node.js 18+** - https://nodejs.org/
3. **AWS CLI configured** - `aws configure`
4. **Snowflake account** - Free trial at https://signup.snowflake.com/

## Quick Start

### 1. Install Dependencies

```bash
cd pulumi-snowflake-pipeline
npm install
```

### 2. Initialize Pulumi Stack

```bash
pulumi login --local
pulumi stack init dev
```

### 3. Configure Credentials

```bash
# AWS
pulumi config set aws:region us-east-1

# Snowflake
pulumi config set snowflake:account YOUR_ACCOUNT_IDENTIFIER
pulumi config set snowflake:username YOUR_USERNAME
pulumi config set --secret snowflake:password YOUR_PASSWORD
pulumi config set snowflake:role ACCOUNTADMIN
```

### 4. Deploy Infrastructure

```bash
pulumi up
```

This will provision all 11 resources in ~30-60 seconds.

### 5. Update IAM Trust Policy

After deployment, get Snowflake's AWS identity:
```sql
DESC STORAGE INTEGRATION "DATA-PIPELINE_S3_INT";
```

Update the IAM role trust policy in `index.ts` with:
- `STORAGE_AWS_IAM_USER_ARN`
- `STORAGE_AWS_EXTERNAL_ID`

Then run `pulumi up` again.

### 6. Load Data

```bash
# Download NYC Taxi dataset (~50MB, 2.9M rows)
curl -O https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet

# Upload to S3
aws s3 cp yellow_tripdata_2024-01.parquet s3://YOUR_BUCKET_NAME/raw/
```

### 7. Run COPY INTO

```sql
COPY INTO "DATA-PIPELINE_DB".RAW.TAXI_DATA
FROM @"DATA-PIPELINE_DB".RAW.S3_STAGE
FILE_FORMAT = (TYPE = PARQUET)
MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
ON_ERROR = CONTINUE;
```

## Project Structure

```
pulumi-snowflake-pipeline/
├── Pulumi.yaml          # Project configuration
├── Pulumi.dev.yaml      # Dev stack config (gitignored)
├── package.json         # Node dependencies
├── tsconfig.json        # TypeScript config
├── index.ts             # Main Pulumi program (11 resources)
├── snowflake/
│   └── setup.sql        # Additional SQL utilities
├── data/
│   └── sample.csv       # Sample data for testing
└── README.md
```

## Verified Metrics

| Metric | Value |
|--------|-------|
| Resources provisioned | 11 |
| Data loaded | 2,964,624 rows |
| Load time | ~33 seconds |
| Dataset | NYC Yellow Taxi Jan 2024 |
| File size | 48 MB (Parquet) |

## Cleanup

```bash
pulumi destroy
pulumi stack rm dev
```

## Technologies

- **Pulumi** - Infrastructure as Code (TypeScript)
- **AWS S3** - Object storage for data landing
- **AWS IAM** - Cross-account access for Snowflake
- **Snowflake** - Cloud data warehouse
- **TypeScript** - Type-safe infrastructure code

## License

MIT
