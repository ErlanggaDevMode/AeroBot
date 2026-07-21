-- SQL Schema for IoT Solar Monitoring System

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: devices
-- Stores current state and metadata of all monitored hardware units.
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,                       -- Unique identifier e.g. "ESP32-001"
    device_name TEXT NOT NULL DEFAULT 'ESP32 Device',                 -- User-friendly name
    location TEXT,                             -- Physical deployment location
    firmware_version TEXT,                     -- Current running firmware version
    status TEXT DEFAULT 'offline',             -- 'online' or 'offline' status
    last_seen TIMESTAMPTZ,                     -- Timestamp of last successful upload
    pending_command TEXT,                      -- Queue a command to execute on next upload (e.g. 'reboot')
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: sensor_logs
-- Stores historical time-series logs of environmental and electrical telemetry.
CREATE TABLE IF NOT EXISTS sensor_logs (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    temperature NUMERIC,                       -- In °C
    humidity NUMERIC,                          -- In %
    soil NUMERIC,                              -- Soil Moisture in %
    battery_voltage NUMERIC,                   -- Battery voltage in Volts
    solar_status TEXT,                         -- Solar state e.g. 'charging', 'idle'
    rssi INTEGER,                              -- WiFi signal strength in dBm
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: alerts
-- Logs status transitions and system anomalies.
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                        -- e.g. 'battery_low', 'battery_critical', 'sensor_error', 'device_offline'
    message TEXT NOT NULL,                     -- Descriptive notification text
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance on frequent query paths
CREATE INDEX IF NOT EXISTS idx_sensor_logs_device_id_created_at ON sensor_logs (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_device_id_created_at ON alerts (device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices (last_seen);
