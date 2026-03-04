const db = require("../config/db");

let schemaReady = false;

async function ensureCouponSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS trek_coupons (
      id INT AUTO_INCREMENT PRIMARY KEY,
      trek_id INT NOT NULL,
      code VARCHAR(60) NOT NULL,
      discount_type ENUM('percentage', 'flat') NOT NULL DEFAULT 'percentage',
      discount_value DECIMAL(10,2) NOT NULL,
      min_booking_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      max_discount_amount DECIMAL(10,2) NULL,
      start_date DATETIME NULL,
      end_date DATETIME NULL,
      usage_limit INT NULL,
      usage_count INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_trek_coupon_code (trek_id, code),
      KEY idx_trek_coupons_trek_id (trek_id),
      KEY idx_trek_coupons_active (is_active)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS coupon_usages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      coupon_id INT NOT NULL,
      user_id INT NOT NULL,
      booking_id INT NOT NULL,
      used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_coupon_user_once (coupon_id, user_id),
      KEY idx_coupon_usages_user (user_id),
      KEY idx_coupon_usages_booking (booking_id),
      CONSTRAINT fk_coupon_usages_coupon FOREIGN KEY (coupon_id) REFERENCES trek_coupons(id) ON DELETE CASCADE,
      CONSTRAINT fk_coupon_usages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_coupon_usages_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    )
  `);

  schemaReady = true;
}

module.exports = {
  ensureCouponSchema,
};

