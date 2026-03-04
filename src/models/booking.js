const db = require("../config/db");
const emailService = require("../service/emailService"); // Email service
const couponService = require("../service/coupon.service");

function normalizeCouponCode(code = "") {
  return String(code || "").trim().toUpperCase();
}

function isExpectedBookingError(error) {
  const expectedCodes = new Set([
    "DUPLICATE_BOOKING",
    "EXISTING_BOOKING",
    "INSUFFICIENT_SLOTS",
    "INVALID_COUPON",
    "COUPON_NOT_STARTED",
    "COUPON_EXPIRED",
    "COUPON_MIN_AMOUNT_NOT_MET",
    "COUPON_USAGE_LIMIT_REACHED",
    "COUPON_ALREADY_USED_BY_USER",
  ]);
  return expectedCodes.has(String(error?.message || "")) || error?.code === "ER_DUP_ENTRY";
}

async function createBooking(bookingData) {
  const conn = await db.getConnection();

  try {
    await couponService.ensureCouponSchema();

    // Start transaction
    await conn.beginTransaction();

    // 1. Check for duplicate completed bookings
    const [existingBookings] = await conn.execute(
      `
      SELECT id, booking_reference, booking_status 
      FROM bookings 
      WHERE user_id = ? 
        AND trek_id = ? 
        AND batch_id = ?
        AND booking_status = 'completed'
    `,
      [bookingData.userId, bookingData.trekId, bookingData.batchId],
    );

    if (existingBookings.length > 0) {
      await conn.rollback();
      throw new Error("DUPLICATE_BOOKING");
    }

    // 2. Check if user has any pending/confirmed booking for same trek
    const [pendingBookings] = await conn.execute(
      `
      SELECT id, booking_reference, booking_status 
      FROM bookings 
      WHERE user_id = ? 
        AND trek_id = ? 
        AND batch_id = ?
        AND booking_status IN ('pending', 'confirmed')
    `,
      [bookingData.userId, bookingData.trekId, bookingData.batchId],
    );

    if (pendingBookings.length > 0) {
      await conn.rollback();
      throw new Error("EXISTING_BOOKING");
    }

    // 3. Generate unique booking reference
    const bookingReference = generateBookingReference(
      bookingData.trekId,
      bookingData.batchId,
      bookingData.startDate,
    );

    // 4. Calculate pricing
    const basePrice = parseFloat(bookingData.price) * bookingData.participants;
    const addonsTotal = (bookingData.selectedAddOns || [])
      .filter((addon) => addon.selected || Number(addon.quantity) > 0)
      .reduce((sum, addon) => {
        const quantity = Number(addon.quantity) > 0
          ? Number(addon.quantity)
          : bookingData.participants;
        return sum + Number(addon.price || 0) * quantity;
      }, 0);
    const subtotalBeforeDiscount = basePrice + addonsTotal;
    let discountAmount = 0;
    let coupon = null;
    const couponCode = normalizeCouponCode(bookingData.couponCode || bookingData.coupon?.code);
    let couponTrekId = Number(bookingData.trekId || 0);

    if (couponCode) {
      const [[trekById]] = await conn.execute(
        "SELECT id FROM treks WHERE id = ? LIMIT 1",
        [couponTrekId]
      );
      if (!trekById) {
        const [[batchRow]] = await conn.execute(
          "SELECT trek_id AS trekId FROM trek_batches WHERE id = ? LIMIT 1",
          [bookingData.batchId]
        );
        if (batchRow?.trekId) {
          couponTrekId = Number(batchRow.trekId);
        }
      }
    }

    if (couponCode) {
      const [couponRows] = await conn.execute(
        `
          SELECT
            id,
            trek_id,
            code,
            discount_type,
            discount_value,
            min_booking_amount,
            max_discount_amount,
            start_date,
            end_date,
            usage_limit,
            usage_count,
            is_active
          FROM trek_coupons
          WHERE trek_id = ? AND code = ?
          LIMIT 1
          FOR UPDATE
        `,
        [couponTrekId, couponCode]
      );

      coupon = couponRows[0];
      if (!coupon || Number(coupon.is_active) !== 1) {
        throw new Error("INVALID_COUPON");
      }

      const now = new Date();
      if (coupon.start_date && new Date(coupon.start_date) > now) {
        throw new Error("COUPON_NOT_STARTED");
      }
      if (coupon.end_date && new Date(coupon.end_date) < now) {
        throw new Error("COUPON_EXPIRED");
      }

      if (Number(coupon.min_booking_amount || 0) > subtotalBeforeDiscount) {
        throw new Error("COUPON_MIN_AMOUNT_NOT_MET");
      }

      if (
        coupon.usage_limit !== null &&
        Number(coupon.usage_count || 0) >= Number(coupon.usage_limit)
      ) {
        throw new Error("COUPON_USAGE_LIMIT_REACHED");
      }

      const [usageRows] = await conn.execute(
        `
          SELECT id
          FROM coupon_usages
          WHERE coupon_id = ? AND user_id = ?
          LIMIT 1
        `,
        [coupon.id, bookingData.userId]
      );

      if (usageRows.length > 0) {
        throw new Error("COUPON_ALREADY_USED_BY_USER");
      }

      if (coupon.discount_type === "percentage") {
        discountAmount = subtotalBeforeDiscount * (Number(coupon.discount_value) / 100);
      } else {
        discountAmount = Number(coupon.discount_value || 0);
      }

      if (coupon.max_discount_amount !== null) {
        discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
      }
      discountAmount = Math.min(discountAmount, subtotalBeforeDiscount);
    }

    const subtotal = subtotalBeforeDiscount - discountAmount;
    const taxAmount = subtotal * 0.05; // 5% tax
    const totalAmount = subtotal + taxAmount;

    // 5. Insert main booking record
    const bookingQuery = `
      INSERT INTO bookings (
        booking_reference,
        user_id,
        trek_id,
        batch_id,
        customer_name,
        customer_email,
        customer_phone,
        emergency_contact,
        special_requests,
        trek_name,
        start_date,
        end_date,
        participants,
        base_price,
        addons_total,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        payment_status,
        amount_paid,
        balance_due,
        refund_amount,
        cancellation_fee,
        payment_deadline,
        booking_status,
        confirmation_sent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const paymentDeadline = new Date(bookingData.startDate);
    paymentDeadline.setDate(paymentDeadline.getDate() - 7); // 7 days before trek
    
    const formatMySQL = (date) => {
      const pad = (n) => (n < 10 ? '0' + n : n);
      return (
        date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + ' ' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes()) + ':' +
        pad(date.getSeconds())
      );
    };

    const mysqlStartDate = formatMySQL(new Date(bookingData.startDate));
    const mysqlEndDate = formatMySQL(new Date(bookingData.endDate));

    const [bookingResult] = await conn.execute(bookingQuery, [
      bookingReference,
      bookingData.userId,
      bookingData.trekId,
      bookingData.batchId,
      bookingData.personalInfo.name,
      bookingData.personalInfo.email,
      bookingData.personalInfo.phone,
      bookingData.personalInfo.emergencyContact,
      bookingData.personalInfo.specialRequests,
      bookingData.trekName,
      mysqlStartDate,
      mysqlEndDate,
      bookingData.participants,
      basePrice,
      addonsTotal,
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      "pending",
      0, // amount_paid
      totalAmount, // balance_due
      0,
      0,
      paymentDeadline,
      "pending",
      false, // confirmation_sent
    ]);

    const bookingId = bookingResult.insertId;

    // 6. Insert participant details (NEW)
    if (bookingData.participantDetails && bookingData.participantDetails.length > 0) {
      const participantQuery = `
        INSERT INTO booking_participants (
          booking_id,
          name,
          age,
          gender,
          id_type,
          id_number,
          phone,
          medical_info,
          is_primary_contact
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (let i = 0; i < bookingData.participantDetails.length; i++) {
        const participant = bookingData.participantDetails[i];
        const isPrimary = i === 0 ? 1 : 0; // First participant is primary contact

        await conn.execute(participantQuery, [
          bookingId,
          participant.name,
          participant.age || null,
          participant.gender || null,
          participant.idType || null,
          maskIdNumber(participant.idNumber) || null,
          participant.phone || null,
          participant.medicalInfo || null,
          isPrimary,
        ]);
      }

      // Participant insertion done. Avoid logging participant PII in production.
      console.info(`Inserted ${bookingData.participantDetails.length} participants for booking ${bookingReference}`);
    }

    // 7. Insert booking add-ons
    if (bookingData.selectedAddOns && bookingData.selectedAddOns.length > 0) {
      const addonQuery = `
        INSERT INTO booking_addons (
          booking_id,
          addon_id,
          addon_name,
          quantity,
          unit_price,
          total_price
        ) VALUES (?, ?, ?, ?, ?, ?)
      `;

      for (const addon of bookingData.selectedAddOns) {
        const quantity = Number(addon.quantity) > 0
          ? Number(addon.quantity)
          : (addon.selected ? bookingData.participants : 0);

        if (quantity > 0) {
          const unitPrice = Number(addon.price || 0);
          const totalPrice = unitPrice * quantity;

          await conn.execute(addonQuery, [
            bookingId,
            addon.id,
            addon.name,
            quantity,
            unitPrice,
            totalPrice,
          ]);
        }
      }
    }

    // 8. Mark coupon usage (if applied)
    if (coupon) {
      await conn.execute(
        `
          INSERT INTO coupon_usages (coupon_id, user_id, booking_id)
          VALUES (?, ?, ?)
        `,
        [coupon.id, bookingData.userId, bookingId]
      );

      await conn.execute(
        `
          UPDATE trek_coupons
          SET usage_count = usage_count + 1
          WHERE id = ?
        `,
        [coupon.id]
      );
    }

    // 9. Update trek batch available slots
    const updateSlotsQuery = `
      UPDATE trek_batches 
      SET 
        available_slots = available_slots - ?,
        booked_slots = booked_slots + ?
      WHERE id = ? AND available_slots >= ?
    `;

    const [updateResult] = await conn.execute(updateSlotsQuery, [
      bookingData.participants,
      bookingData.participants,
      bookingData.batchId,
      bookingData.participants,
    ]);

    // Check if update was successful
    if (updateResult.affectedRows === 0) {
      throw new Error("INSUFFICIENT_SLOTS");
    }

    // 10. Commit transaction
    await conn.commit();

    // 11. Fetch complete booking details with participants
    const [bookingDetails] = await conn.execute(
      `
      SELECT 
        b.*,
        GROUP_CONCAT(
          CONCAT(ba.addon_name, ' (', ba.quantity, 'x₹', ba.unit_price, ')')
          SEPARATOR ', '
        ) as addons_summary
      FROM bookings b
      LEFT JOIN booking_addons ba ON b.id = ba.booking_id
      WHERE b.id = ?
      GROUP BY b.id
    `,
      [bookingId],
    );

    const booking = bookingDetails[0];

    // Fetch participant details
    const [participants] = await conn.execute(
      `
      SELECT 
        id,
        name,
        age,
        gender,
        id_type,
        id_number,
        phone,
        medical_info,
        is_primary_contact
      FROM booking_participants
      WHERE booking_id = ?
      ORDER BY is_primary_contact DESC, id ASC
    `,
      [bookingId],
    );

    booking.participants_details = participants;

    // 12. Send confirmation email (async, don't wait)
    emailService
      .sendBookingConfirmation(booking)
      .then(() => {
        // Mark confirmation sent; avoid exposing booking details in logs
        console.info(`Confirmation email queued for booking ${bookingReference}`);
        conn.execute("UPDATE bookings SET confirmation_sent = TRUE WHERE id = ?", [bookingId]);
      })
      .catch((err) => {
        console.error("Failed to send confirmation email:", err.message || err);
      });

    // 13. Notify admin via admin socket server about new booking
    try {
      const ioClient = require("socket.io-client");
      const adminSocketUrl = process.env.ADMIN_SOCKET_URL || "http://localhost:4001";
      const adminSocket = ioClient(adminSocketUrl, {
        transports: ["websocket"],
        reconnection: false,
      });

      adminSocket.on("connect", () => {
        const notificationPayload = {
          bookingId: bookingId,
          bookingReference: bookingReference,
          customerName: booking.customer_name || bookingData.personalInfo?.name || null,
          trekName: booking.trek_name || bookingData.trekName || null,
          participants: bookingData.participants,
          totalAmount: totalAmount,
          createdAt: new Date().toISOString(),
        };

        // Wait for an acknowledgement so we don't disconnect before message delivery.
        adminSocket.timeout(3000).emit("booking-created", notificationPayload, (err) => {
          if (err) {
            console.error("Admin booking notification acknowledgement timed out");
          }
          adminSocket.disconnect();
        });
      });

      adminSocket.on("connect_error", (err) => {
        console.error("Failed to connect to admin socket server for booking notification", err);
      });
    } catch (err) {
      console.error("Error notifying admin about new booking:", err);
    }

    return {
      success: true,
      message: "Booking created successfully. Confirmation email sent.",
      booking: booking,
      bookingId: bookingId,
      bookingReference: bookingReference,
      participantCount: participants.length,
    };
  } catch (error) {
    // Rollback transaction on error
    await conn.rollback();
    if (!isExpectedBookingError(error)) {
      console.error("Booking creation error:", error);
    }

    // Custom error messages
    if (error.message === "DUPLICATE_BOOKING") {
      throw new Error(
        "You have already completed this trek. Each trek can only be booked once.",
      );
    }
    if (error.message === "EXISTING_BOOKING") {
      throw new Error(
        "You already have a pending or confirmed booking for this trek.",
      );
    }
    if (error.message === "INSUFFICIENT_SLOTS") {
      throw new Error("Insufficient available slots or batch not found");
    }
    if (error.message === "INVALID_COUPON") {
      throw new Error("Invalid coupon code for this trek");
    }
    if (error.message === "COUPON_NOT_STARTED") {
      throw new Error("Coupon is not active yet");
    }
    if (error.message === "COUPON_EXPIRED") {
      throw new Error("Coupon has expired");
    }
    if (error.message === "COUPON_MIN_AMOUNT_NOT_MET") {
      throw new Error("Booking amount does not meet coupon minimum requirement");
    }
    if (error.message === "COUPON_USAGE_LIMIT_REACHED") {
      throw new Error("Coupon usage limit reached");
    }
    if (error.message === "COUPON_ALREADY_USED_BY_USER") {
      throw new Error("You have already used this coupon");
    }
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("You have already used this coupon");
    }

    throw error;
  } finally {
    // Release connection
    conn.release();
  }
}

function generateBookingReference(trekId, batchId, startDate) {
  const date = new Date(startDate);
  const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");
  const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TRK${trekId}-B${batchId}-${dateStr}-${randomStr}`;
}

// Add this helper function above createBooking
function maskIdNumber(idNumber) {
  if (!idNumber) return null;
  const clean = idNumber.replace(/\s/g, ''); // remove spaces (e.g. Aadhar formatting)
  if (clean.length <= 4) return clean;        // too short to mask
  const masked = '*'.repeat(clean.length - 4) + clean.slice(-4);
  return masked;
}

module.exports = {
  createBooking,
};
