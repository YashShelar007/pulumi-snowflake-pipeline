# pulumi-snowflake-pipeline

A Pulumi program in TypeScript that provisions an S3 bucket, an IAM role, and the Snowflake warehouse, database, stage and table needed to load files from S3 into Snowflake with `COPY INTO`. It is for anyone who wants a small, readable example of wiring AWS and Snowflake together as code instead of by hand in two consoles.

## What it does not do

- It does not load data. You upload a file and run `COPY INTO` yourself (see [Quickstart](#quickstart)).
- It does not set up Snowpipe, scheduling, or any transformation.

## Quickstart

You need Node.js 18 or newer, the Pulumi CLI, the AWS CLI configured for an account you control, and a Snowflake account.

```bash
git clone https://github.com/YashShelar007/pulumi-snowflake-pipeline.git
cd pulumi-snowflake-pipeline
npm install
npx tsc --noEmit        # type-checks index.ts
npm test                # runs index.ts against Pulumi mocks, no credentials needed
```

The commands above were run on a clean clone. Everything below needs live AWS and Snowflake credentials and was not run for this README (not verified: no credentials in the polish environment).

```bash
pulumi login --local
pulumi stack init dev

pulumi config set aws:region us-east-1
pulumi config set awsAccountId "$(aws sts get-caller-identity --query Account --output text)"
pulumi config set snowflake:account YOUR_ACCOUNT_IDENTIFIER
pulumi config set snowflake:username YOUR_USERNAME
pulumi config set --secret snowflake:password YOUR_PASSWORD
pulumi config set snowflake:role ACCOUNTADMIN

pulumi up
```

Then close the trust loop. Snowflake generates its own AWS identity for the storage integration, so the role's trust policy has to be updated after the first deploy. Until you do, the role trusts only your own account, with the placeholder external ID `0000`:

```sql
DESC STORAGE INTEGRATION DATA_PIPELINE_S3_INT;
```

Copy the `STORAGE_AWS_IAM_USER_ARN` and `STORAGE_AWS_EXTERNAL_ID` values from that output into stack config, and deploy again:

```bash
pulumi config set storageAwsIamUserArn STORAGE_AWS_IAM_USER_ARN
pulumi config set storageAwsExternalId STORAGE_AWS_EXTERNAL_ID
pulumi up
```

Load a file:

```bash
curl -O https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet
aws s3 cp yellow_tripdata_2024-01.parquet s3://YOUR_BUCKET_NAME/raw/
```

Then copy it in by running the `USE` statements and the Parquet `COPY INTO` at the top of `snowflake/setup.sql`. `pulumi stack output instructions` prints the same steps with your bucket name filled in.

Tear down with `pulumi destroy` and `pulumi stack rm dev`.

## How it works

`index.ts` declares 11 resources. On AWS: a bucket (`forceDestroy` is on, so `pulumi destroy` deletes it even with files in it), an IAM role that Snowflake assumes, and a role policy granting `s3:GetObject`, `s3:GetObjectVersion`, `s3:ListBucket` and `s3:GetBucketLocation` on that bucket.

On Snowflake: an X-SMALL warehouse that suspends after 60 seconds, a database, a `RAW` schema, a storage integration that points at the IAM role, a CSV and a Parquet file format, an external stage over `s3://<bucket>/raw/`, and a `TAXI_DATA` table with 11 columns (the last, `LOADED_AT`, defaults to the current timestamp).

The NYC Parquet file names five of those columns differently (`VendorID`, `tpep_pickup_datetime`, `tpep_dropoff_datetime`, `PULocationID`, `DOLocationID`), so its `COPY INTO` maps all ten loaded columns in a `SELECT`. It also sets `USE_LOGICAL_TYPE = TRUE`; without it, Snowflake reads this file's timestamps as microsecond integers.

Resource names come from the string `data-pipeline`. On Snowflake it is upper-cased with an underscore for the hyphen, so the database is `DATA_PIPELINE_DB` and SQL needs no quoting.

```
Pulumi program (index.ts)
   |-- AWS:       S3 bucket, IAM role, role policy
   `-- Snowflake: warehouse, database, schema, storage integration,
                  CSV + Parquet formats, S3 stage, TAXI_DATA table

S3 bucket /raw/  --(storage integration + IAM role)-->  stage  --COPY INTO-->  TAXI_DATA
```

Other files: `snowflake/setup.sql` holds follow-up queries (row count, a daily summary view, a clustering key), and `data/sample.csv` is a 10-row sample with the same columns as the table minus `LOADED_AT`.

## Known limits

- The author reports loading 2,964,624 rows (NYC Yellow Taxi, January 2024, 48 MB Parquet) in about 33 seconds. That run was not reproduced here.
- `PARQUET_FORMAT` is created, but the Parquet `COPY INTO` sets its options inline instead of using it, because `@pulumi/snowflake` 0.50 cannot set `USE_LOGICAL_TYPE` on a file format.
- No CI. `npm test` is the only automated check, and it never touches AWS or Snowflake.

## Status

Built in 2025 as a cloud computing project. Not actively developed.

## License

MIT. See `LICENSE`.
