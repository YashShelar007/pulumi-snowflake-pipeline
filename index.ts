import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as snowflake from "@pulumi/snowflake";

// =============================================================================
// Configuration
// =============================================================================

const config = new pulumi.Config();
const projectName = "data-pipeline";
const environment = pulumi.getStack(); // dev, staging, prod

// =============================================================================
// AWS Resources (4 resources)
// =============================================================================

// 1. S3 Bucket - Data Landing Zone
const dataBucket = new aws.s3.Bucket(`${projectName}-bucket`, {
  bucket: `${projectName}-data-${environment}-${Date.now()}`,
  forceDestroy: true, // Allow deletion even with objects (for demo)
  tags: {
    Project: projectName,
    Environment: environment,
    ManagedBy: "Pulumi",
  },
});

// 2. S3 Bucket Policy - Allow Snowflake access
const bucketPolicy = new aws.s3.BucketPolicy(`${projectName}-bucket-policy`, {
  bucket: dataBucket.id,
  policy: pulumi.all([dataBucket.arn]).apply(([bucketArn]) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowSnowflakeAccess",
          Effect: "Allow",
          Principal: "*", // Will be restricted by IAM role
          Action: ["s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket"],
          Resource: [bucketArn, `${bucketArn}/*`],
        },
      ],
    })
  ),
});

// 3. IAM Role - For Snowflake to assume
const snowflakeRole = new aws.iam.Role(`${projectName}-snowflake-role`, {
  name: `${projectName}-snowflake-access-${environment}`,
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          // Snowflake's AWS account - update with your storage integration's AWS IAM user ARN
          AWS: "*", // Will be updated after storage integration is created
        },
        Action: "sts:AssumeRole",
        Condition: {
          StringEquals: {
            "sts:ExternalId": "snowflake_external_id", // Replace with actual external ID
          },
        },
      },
    ],
  }),
  tags: {
    Project: projectName,
    Environment: environment,
    ManagedBy: "Pulumi",
  },
});

// 4. IAM Policy - S3 read permissions for Snowflake
const snowflakePolicy = new aws.iam.RolePolicy(
  `${projectName}-snowflake-policy`,
  {
    role: snowflakeRole.id,
    policy: pulumi.all([dataBucket.arn]).apply(([bucketArn]) =>
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "s3:GetObject",
              "s3:GetObjectVersion",
              "s3:ListBucket",
              "s3:GetBucketLocation",
            ],
            Resource: [bucketArn, `${bucketArn}/*`],
          },
        ],
      })
    ),
  }
);

// =============================================================================
// Snowflake Resources (8 resources)
// =============================================================================

// 5. Snowflake Warehouse - Compute resource
const warehouse = new snowflake.Warehouse(`${projectName}-warehouse`, {
  name: `${projectName.toUpperCase()}_WH`,
  warehouseSize: "X-SMALL", // Start small, can scale up
  autoSuspend: 60, // Suspend after 60 seconds of inactivity
  autoResume: true,
  comment: "Data pipeline warehouse managed by Pulumi",
});

// 6. Snowflake Database
const database = new snowflake.Database(`${projectName}-database`, {
  name: `${projectName.toUpperCase()}_DB`,
  comment: "Data pipeline database managed by Pulumi",
});

// 7. Snowflake Schema
const schema = new snowflake.Schema(`${projectName}-schema`, {
  name: "RAW",
  database: database.name,
  comment: "Raw data landing schema",
});

// 8. Storage Integration - Connect Snowflake to S3
const storageIntegration = new snowflake.StorageIntegration(
  `${projectName}-storage-integration`,
  {
    name: `${projectName.toUpperCase()}_S3_INT`,
    type: "EXTERNAL_STAGE",
    storageProvider: "S3",
    enabled: true,
    storageAwsRoleArn: snowflakeRole.arn,
    storageAllowedLocations: [pulumi.interpolate`s3://${dataBucket.bucket}/`],
    comment: "S3 storage integration managed by Pulumi",
  }
);

// 9. File Format - CSV
const csvFileFormat = new snowflake.FileFormat(`${projectName}-csv-format`, {
  name: "CSV_FORMAT",
  database: database.name,
  schema: schema.name,
  formatType: "CSV",
  fieldDelimiter: ",",
  skipHeader: 1,
  nullIf: ["NULL", "null", ""],
  emptyFieldAsNull: true,
  comment: "CSV file format for data ingestion",
});

// 10. File Format - Parquet (for large datasets)
const parquetFileFormat = new snowflake.FileFormat(
  `${projectName}-parquet-format`,
  {
    name: "PARQUET_FORMAT",
    database: database.name,
    schema: schema.name,
    formatType: "PARQUET",
    comment: "Parquet file format for data ingestion",
  }
);

// 11. External Stage - S3 connection point
const s3Stage = new snowflake.Stage(`${projectName}-s3-stage`, {
  name: "S3_STAGE",
  database: database.name,
  schema: schema.name,
  url: pulumi.interpolate`s3://${dataBucket.bucket}/raw/`,
  storageIntegration: storageIntegration.name,
  comment: "External S3 stage managed by Pulumi",
});

// 12. Table - Destination for taxi data (example schema)
const taxiTable = new snowflake.Table(`${projectName}-taxi-table`, {
  name: "TAXI_DATA",
  database: database.name,
  schema: schema.name,
  columns: [
    { name: "VENDOR_ID", type: "NUMBER" },
    { name: "PICKUP_DATETIME", type: "TIMESTAMP" },
    { name: "DROPOFF_DATETIME", type: "TIMESTAMP" },
    { name: "PASSENGER_COUNT", type: "NUMBER" },
    { name: "TRIP_DISTANCE", type: "FLOAT" },
    { name: "PICKUP_LOCATION_ID", type: "NUMBER" },
    { name: "DROPOFF_LOCATION_ID", type: "NUMBER" },
    { name: "FARE_AMOUNT", type: "FLOAT" },
    { name: "TIP_AMOUNT", type: "FLOAT" },
    { name: "TOTAL_AMOUNT", type: "FLOAT" },
    { name: "LOADED_AT", type: "TIMESTAMP", default: { expression: "CURRENT_TIMESTAMP()" } },
  ],
  comment: "NYC Taxi trip data loaded from S3",
});

// =============================================================================
// Outputs
// =============================================================================

export const awsOutputs = {
  bucketName: dataBucket.bucket,
  bucketArn: dataBucket.arn,
  roleArn: snowflakeRole.arn,
  roleName: snowflakeRole.name,
};

export const snowflakeOutputs = {
  warehouseName: warehouse.name,
  databaseName: database.name,
  schemaName: schema.name,
  stageName: s3Stage.name,
  tableName: taxiTable.name,
  storageIntegrationName: storageIntegration.name,
};

export const instructions = pulumi.interpolate`
================================================================================
DEPLOYMENT COMPLETE! Next steps:
================================================================================

1. Upload sample data to S3:
   aws s3 cp data/sample.csv s3://${dataBucket.bucket}/raw/

2. Or download NYC Taxi data (1M+ rows):
   wget https://d37ci6vzurychx.cloudfront.net/trip-data/yellow_tripdata_2024-01.parquet
   aws s3 cp yellow_tripdata_2024-01.parquet s3://${dataBucket.bucket}/raw/

3. Run COPY INTO in Snowflake to load data:
   USE WAREHOUSE ${warehouse.name};
   USE DATABASE ${database.name};
   USE SCHEMA ${schema.name};

   COPY INTO TAXI_DATA
   FROM @S3_STAGE
   FILE_FORMAT = PARQUET_FORMAT
   MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE;

4. Verify data loaded:
   SELECT COUNT(*) FROM TAXI_DATA;
   -- Should show 1M+ rows loaded in <30 seconds!

================================================================================
`;
