-- =============================================================================
-- Snowflake Setup Scripts
-- Run these after Pulumi deployment if needed for additional configuration
-- =============================================================================

-- Use the provisioned resources
USE WAREHOUSE DATA_PIPELINE_WH;
USE DATABASE DATA_PIPELINE_DB;
USE SCHEMA RAW;

-- =============================================================================
-- COPY INTO Command (run after uploading data to S3)
-- =============================================================================

-- For Parquet files (NYC Taxi data - 1M+ rows). The file names five columns differently
-- (VendorID, tpep_pickup_datetime, PULocationID, ...), so map each one. USE_LOGICAL_TYPE = TRUE
-- loads its timestamps as timestamps; without it they arrive as microsecond integers.
COPY INTO TAXI_DATA (VENDOR_ID, PICKUP_DATETIME, DROPOFF_DATETIME, PASSENGER_COUNT,
  TRIP_DISTANCE, PICKUP_LOCATION_ID, DROPOFF_LOCATION_ID, FARE_AMOUNT, TIP_AMOUNT, TOTAL_AMOUNT)
FROM (SELECT $1:VendorID::NUMBER, $1:tpep_pickup_datetime::TIMESTAMP_NTZ,
  $1:tpep_dropoff_datetime::TIMESTAMP_NTZ, $1:passenger_count::NUMBER, $1:trip_distance::FLOAT,
  $1:PULocationID::NUMBER, $1:DOLocationID::NUMBER, $1:fare_amount::FLOAT,
  $1:tip_amount::FLOAT, $1:total_amount::FLOAT
  FROM @S3_STAGE)
PATTERN = '.*[.]parquet'
FILE_FORMAT = (TYPE = PARQUET USE_LOGICAL_TYPE = TRUE)
ON_ERROR = CONTINUE;

-- For CSV files such as data/sample.csv (10 columns; LOADED_AT takes its default)
-- COPY INTO TAXI_DATA (VENDOR_ID, PICKUP_DATETIME, DROPOFF_DATETIME, PASSENGER_COUNT,
--   TRIP_DISTANCE, PICKUP_LOCATION_ID, DROPOFF_LOCATION_ID, FARE_AMOUNT, TIP_AMOUNT, TOTAL_AMOUNT)
-- FROM (SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10 FROM @S3_STAGE)
-- PATTERN = '.*[.]csv'
-- FILE_FORMAT = (FORMAT_NAME = CSV_FORMAT)
-- ON_ERROR = CONTINUE;

-- =============================================================================
-- Verify Data Loaded
-- =============================================================================

-- Check row count
SELECT COUNT(*) as total_rows FROM TAXI_DATA;

-- Sample data
SELECT * FROM TAXI_DATA LIMIT 10;

-- Basic aggregations
SELECT
    DATE_TRUNC('day', PICKUP_DATETIME) as trip_date,
    COUNT(*) as trip_count,
    AVG(TRIP_DISTANCE) as avg_distance,
    AVG(TOTAL_AMOUNT) as avg_fare
FROM TAXI_DATA
GROUP BY 1
ORDER BY 1 DESC
LIMIT 10;

-- =============================================================================
-- Performance Optimization (optional)
-- =============================================================================

-- Add clustering key for better query performance
ALTER TABLE TAXI_DATA CLUSTER BY (PICKUP_DATETIME);

-- Create a view for common queries
CREATE OR REPLACE VIEW DAILY_SUMMARY AS
SELECT
    DATE_TRUNC('day', PICKUP_DATETIME) as trip_date,
    COUNT(*) as trip_count,
    SUM(PASSENGER_COUNT) as total_passengers,
    AVG(TRIP_DISTANCE) as avg_distance,
    AVG(FARE_AMOUNT) as avg_fare,
    AVG(TIP_AMOUNT) as avg_tip,
    SUM(TOTAL_AMOUNT) as total_revenue
FROM TAXI_DATA
GROUP BY 1;

-- Query the view
SELECT * FROM DAILY_SUMMARY ORDER BY trip_date DESC LIMIT 30;

-- =============================================================================
-- Storage Integration Verification
-- =============================================================================

-- Check storage integration status
DESC STORAGE INTEGRATION DATA_PIPELINE_S3_INT;

-- List files in stage
LIST @S3_STAGE;

-- =============================================================================
-- Cleanup (run only when you want to reset)
-- =============================================================================

-- TRUNCATE TABLE TAXI_DATA;
-- DROP TABLE IF EXISTS TAXI_DATA;
