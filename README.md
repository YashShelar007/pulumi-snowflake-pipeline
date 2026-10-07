# pulumi-snowflake-pipeline

A Pulumi program in TypeScript that provisions an S3 bucket, an IAM role, and the Snowflake warehouse, database, stage and table needed to load files from S3 into Snowflake with `COPY INTO`. It is for anyone who wants a small, readable example of wiring AWS and Snowflake together as code instead of by hand in two consoles.

## What it does not do

- It does not load data. You upload a file and run `COPY INTO` yourself (steps 6 and 7 below).
- It does not set up Snowpipe, scheduling, or any transformation.
- It does not remove the hardcoded identifiers in `index.ts` (see Known limits). Deploy it only after you have read them.

## Quickstart

You need Node.js 18 or newer, the Pulumi CLI, the AWS CLI configured for an account you control, and a Snowflake account.

```bash
git clone https://github.com/YashShelar007/pulumi-snowflake-pipeline.git
cd pulumi-snowflake-pipeline
npm install
npx tsc --noEmit        # type-checks index.ts
```

The commands above were run on a clean clone. Everything below needs live AWS and Snowflake credentials and was not run for this README (not verified: no credentials in the polish environment).

```bash
pulumi login --local
pulumi stack init dev

pulumi config set aws:region us-east-1
pulumi config set snowflake:account YOUR_ACCOUNT_IDENTIFIER
pulumi config set snowflake:username YOUR_USERNAME
pulumi config set --secret snowflake:password YOUR_PASSWORD
pulumi config set snowflake:role ACCOUNTADMIN

pulumi up
```

Then close the trust loop. Snowflake generates its own AWS identity for the storage integration, so the role's trust policy has to be updated after the first deploy:

```sql
DESC STORAGE INTEGRATION "DATA-PIPELINE_S3_INT";
```

Copy `STORAGE_AWS_IAM_USER_ARN` and `STORAGE_AWS_EXTERNAL_ID` into the `assumeRolePolicy` in `index.ts` (the `Principal.AWS` and `sts:ExternalId` values), and run `pulumi up` again.

Load a file and copy it in:

```bash
curl -O https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet
aws s3 cp yellow_tripdata_2024-01.parquet s3://YOUR_BUCKET_NAME/raw/
```

```sql
COPY INTO "DATA-PIPELINE_DB".RAW.TAXI_DATA
FROM @"DATA-PIPELINE_DB".RAW.S3_STAGE
FILE_FORMAT = (TYPE = PARQUET)
MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
ON_ERROR = CONTINUE;
```

Tear down with `pulumi destroy` and `pulumi stack rm dev`.

## How it works

`index.ts` declares 11 resources. On AWS: a bucket (`forceDestroy` is on, so `pulumi destroy` deletes it even with files in it), an IAM role that Snowflake assumes, and a role policy granting `s3:GetObject`, `s3:GetObjectVersion`, `s3:ListBucket` and `s3:GetBucketLocation` on that bucket.

On Snowflake: an X-SMALL warehouse that suspends after 60 seconds, a database, a `RAW` schema, a storage integration that points at the IAM role, a CSV and a Parquet file format, an external stage over `s3://<bucket>/raw/`, and a `TAXI_DATA` table with 11 columns (the last, `LOADED_AT`, defaults to the current timestamp).

Resource names come from the string `data-pipeline`, upper-cased for Snowflake. That is why the database is `DATA-PIPELINE_DB`, hyphen included, and why you must quote it in SQL.

```
Pulumi program (index.ts)
   |-- AWS:       S3 bucket, IAM role, role policy
   `-- Snowflake: warehouse, database, schema, storage integration,
                  CSV + Parquet formats, S3 stage, TAXI_DATA table

S3 bucket /raw/  --(storage integration + IAM role)-->  stage  --COPY INTO-->  TAXI_DATA
```

Other files: `snowflake/setup.sql` holds follow-up queries (row count, a daily summary view, a clustering key), and `data/sample.csv` is a 10-row sample with the same columns as the table minus `LOADED_AT`.

## Known limits

- `index.ts` hardcodes an AWS account ID in the bucket name, and a Snowflake IAM user ARN and external ID in the trust policy. They are identifiers from the author's own deployment, not credentials. Replace the trust policy values as described above; the bucket name still carries the author's account ID.
- `snowflake/setup.sql` uses `DATA_PIPELINE_WH` and `DATA_PIPELINE_DB` (underscore), but the program creates `DATA-PIPELINE_WH` and `DATA-PIPELINE_DB` (hyphen). Quote the names or edit the script before running it.
- The `instructions` stack output suggests loading `sample.csv` and then copying with `PARQUET_FORMAT`; a CSV needs `CSV_FORMAT`.
- The author reports loading 2,964,624 rows (NYC Yellow Taxi, January 2024, 48 MB Parquet) in about 33 seconds. That run was not reproduced here.
- No tests, no CI.

## Status

Built in 2025 as a cloud computing project. Not actively developed.

## License

MIT. See `LICENSE`.
