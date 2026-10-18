export const hit = {
  type: "impact", id: 1, ms: 123, helmet_id: "test-helmet", boot_id: "test-boot", player: "#44",
  peak_g: 42, peak_rot_rads: 5, peak_rot_dps: 286.5, location: "right", location_validated: false,
  ax: 42, ay: 0, az: 0, fifo_samples: 32, gyro_window_complete: true,
  accel_clipped: false, gyro_clipped: false, calibration_capture: false,
} as const;
