use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use serde::Serialize;
use tauri::State;
use tokio::{sync::Mutex, time::Instant};

use crate::database::Database;

const SETTING_MAXIMUM_BANDWIDTH: &str = "maximum_bandwidth";
pub const DEFAULT_UPLOAD_MBPS: u32 = 10;
pub const DEFAULT_DOWNLOAD_MBPS: u32 = 25;
const DEFAULT_UPLOAD_BYTES_PER_SECOND: u64 = DEFAULT_UPLOAD_MBPS as u64 * 1_000_000 / 8;
const DEFAULT_DOWNLOAD_BYTES_PER_SECOND: u64 = DEFAULT_DOWNLOAD_MBPS as u64 * 1_000_000 / 8;

#[derive(Clone)]
pub struct BandwidthManager {
    inner: Arc<BandwidthInner>,
}

struct BandwidthInner {
    maximum_bandwidth: AtomicBool,
    upload: DirectionLimiter,
    download: DirectionLimiter,
}

struct DirectionLimiter {
    bytes_per_second: u64,
    next_available: Mutex<Instant>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BandwidthPreferences {
    maximum_bandwidth: bool,
    default_upload_mbps: u32,
    default_download_mbps: u32,
}

impl BandwidthManager {
    pub fn new(maximum_bandwidth: bool) -> Self {
        Self {
            inner: Arc::new(BandwidthInner {
                maximum_bandwidth: AtomicBool::new(maximum_bandwidth),
                upload: DirectionLimiter::new(DEFAULT_UPLOAD_BYTES_PER_SECOND),
                download: DirectionLimiter::new(DEFAULT_DOWNLOAD_BYTES_PER_SECOND),
            }),
        }
    }

    pub fn is_maximum(&self) -> bool {
        self.inner.maximum_bandwidth.load(Ordering::SeqCst)
    }

    pub async fn set_maximum(&self, maximum_bandwidth: bool) {
        self.inner
            .maximum_bandwidth
            .store(maximum_bandwidth, Ordering::SeqCst);
        self.inner.upload.reset().await;
        self.inner.download.reset().await;
    }

    pub async fn throttle_upload(&self, bytes: usize) {
        if !self.is_maximum() {
            self.inner.upload.acquire(bytes).await;
        }
    }

    pub async fn throttle_download(&self, bytes: usize) {
        if !self.is_maximum() {
            self.inner.download.acquire(bytes).await;
        }
    }
}

impl DirectionLimiter {
    fn new(bytes_per_second: u64) -> Self {
        Self {
            bytes_per_second,
            next_available: Mutex::new(Instant::now()),
        }
    }

    async fn acquire(&self, bytes: usize) {
        if bytes == 0 {
            return;
        }
        let now = Instant::now();
        let mut next_available = self.next_available.lock().await;
        let reservation = reserve_transfer(&mut next_available, now, bytes, self.bytes_per_second);
        drop(next_available);
        tokio::time::sleep_until(reservation).await;
    }

    async fn reset(&self) {
        *self.next_available.lock().await = Instant::now();
    }
}

fn reserve_transfer(
    next_available: &mut Instant,
    now: Instant,
    bytes: usize,
    bytes_per_second: u64,
) -> Instant {
    let reservation = (*next_available).max(now);
    let duration = Duration::from_secs_f64(bytes as f64 / bytes_per_second as f64);
    *next_available = reservation + duration;
    reservation
}

#[tauri::command]
pub fn get_bandwidth_preferences(manager: State<'_, BandwidthManager>) -> BandwidthPreferences {
    preferences(manager.is_maximum())
}

#[tauri::command]
pub async fn set_bandwidth_preferences(
    maximum_bandwidth: bool,
    database: State<'_, Database>,
    manager: State<'_, BandwidthManager>,
) -> Result<BandwidthPreferences, String> {
    database
        .set_setting(SETTING_MAXIMUM_BANDWIDTH, &maximum_bandwidth.to_string())
        .map_err(|error| error.to_string())?;
    manager.set_maximum(maximum_bandwidth).await;
    Ok(preferences(maximum_bandwidth))
}

fn preferences(maximum_bandwidth: bool) -> BandwidthPreferences {
    BandwidthPreferences {
        maximum_bandwidth,
        default_upload_mbps: DEFAULT_UPLOAD_MBPS,
        default_download_mbps: DEFAULT_DOWNLOAD_MBPS,
    }
}

pub fn parse_setting(value: Option<String>) -> bool {
    value
        .as_deref()
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .is_some_and(|value| matches!(value.as_str(), "true" | "1" | "yes" | "on"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maximum_bandwidth_setting_defaults_to_off() {
        assert!(!parse_setting(None));
        assert!(!parse_setting(Some("false".to_owned())));
        assert!(parse_setting(Some("TRUE".to_owned())));
    }

    #[test]
    fn default_limits_are_positive_and_convert_from_bits() {
        assert_eq!(DEFAULT_UPLOAD_BYTES_PER_SECOND, 1_250_000);
        assert_eq!(DEFAULT_DOWNLOAD_BYTES_PER_SECOND, 3_125_000);
    }

    #[test]
    fn concurrent_transfers_reserve_non_overlapping_time_slots() {
        let now = Instant::now();
        let mut next_available = now;
        let first = reserve_transfer(&mut next_available, now, 250_000, 1_000_000);
        let second = reserve_transfer(&mut next_available, now, 250_000, 1_000_000);

        assert_eq!(first, now);
        assert_eq!(second.duration_since(now), Duration::from_millis(250));
        assert_eq!(
            next_available.duration_since(now),
            Duration::from_millis(500)
        );
    }
}
