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

-- For Parquet files (NYC Taxi data - 1M+ rows)
COPY INTO TAXI_DATA
FROM @S3_STAGE
FILE_FORMAT = PARQUET_FORMAT
MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
ON_ERROR = CONTINUE;

-- For CSV files
-- COPY INTO TAXI_DATA
-- FROM @S3_STAGE
-- FILE_FORMAT = CSV_FORMAT
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
